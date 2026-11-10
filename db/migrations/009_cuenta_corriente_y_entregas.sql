BEGIN;

-- Dinero cobrado al cliente (con o sin pedido)
CREATE TABLE cobro_cliente (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT NOT NULL REFERENCES cliente(id),
  pedido_id       INT REFERENCES pedido_mayorista(id),      -- NULL = pago suelto a cuenta
  medio           VARCHAR(20) NOT NULL CHECK (medio IN ('EFECTIVO','TRANSFERENCIA','DEBITO','QR')),
  monto           NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  cuenta_cobro_id INT REFERENCES cuenta_cobro(id),
  verificado_por  INT REFERENCES usuario(id),
  verificado_at   TIMESTAMPTZ,
  referencia      VARCHAR(100),                             -- ej: número de boleta
  cobrado_por     INT NOT NULL REFERENCES usuario(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_cobro_transferencia
    CHECK (medio <> 'TRANSFERENCIA' OR (cuenta_cobro_id IS NOT NULL AND verificado_por IS NOT NULL))
);
CREATE INDEX ix_cobro_cliente ON cobro_cliente(cliente_id);
CREATE INDEX ix_cobro_pedido  ON cobro_cliente(pedido_id);

-- El libro: coherencia de signos y vínculo con el cobro
ALTER TABLE movimiento_cuenta_cliente
  ADD COLUMN cobro_id INT REFERENCES cobro_cliente(id),
  ADD CONSTRAINT ck_mov_signo CHECK (
    (tipo = 'CARGO' AND monto > 0) OR
    (tipo IN ('PAGO','DEVOLUCION') AND monto < 0) OR
    (tipo = 'AJUSTE' AND monto <> 0));

-- Lo cobrado y no entregado, para la próxima visita
CREATE TABLE pendiente_entrega (
  id                SERIAL PRIMARY KEY,
  cliente_id        INT NOT NULL REFERENCES cliente(id),
  pedido_id         INT NOT NULL REFERENCES pedido_mayorista(id),
  producto_id       INT NOT NULL REFERENCES producto(id),
  cantidad          NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  cantidad_restante NUMERIC(12,3) NOT NULL CHECK (cantidad_restante >= 0 AND cantidad_restante <= cantidad),
  precio_unitario   NUMERIC(12,2) NOT NULL,                 -- lo que se cobró, para poder acreditar
  estado            VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','ENTREGADO','ACREDITADO')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto_at       TIMESTAMPTZ,
  CONSTRAINT ck_pendiente_estado CHECK (
    (estado = 'PENDIENTE' AND cantidad_restante > 0) OR
    (estado <> 'PENDIENTE' AND cantidad_restante = 0))
);
CREATE INDEX ix_pendiente_cliente ON pendiente_entrega(cliente_id) WHERE estado = 'PENDIENTE';

-- Libro y cobros: solo se agregan filas (las correcciones son ajustes)
CREATE FUNCTION bloquear_modificacion_libro() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Este registro es de solo agregado: corregí con un ajuste.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_libro_solo_agregar BEFORE UPDATE OR DELETE ON movimiento_cuenta_cliente
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_libro();
CREATE TRIGGER trg_cobro_solo_agregar BEFORE UPDATE OR DELETE ON cobro_cliente
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_libro();

INSERT INTO configuracion (clave, valor, descripcion) VALUES
 ('mayorista.medios_cobro', 'EFECTIVO,TRANSFERENCIA', 'Medios de cobro habilitados en mayorista');

INSERT INTO permiso (codigo, modulo, descripcion) VALUES
 ('mayorista.cobrar',    'mayorista', 'Registrar cobros y pagos a cuenta de clientes'),
 ('mayorista.acreditar', 'mayorista', 'Acreditar faltantes y hacer ajustes en la cuenta corriente de un cliente');

COMMIT;