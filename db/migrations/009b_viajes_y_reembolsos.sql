BEGIN;

CREATE TABLE vehiculo (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(100) NOT NULL UNIQUE,
  patente VARCHAR(15),
  activo  BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO vehiculo (nombre) VALUES ('Camioneta de la empresa'), ('Camioneta del jefe');

CREATE TABLE viaje (
  id            SERIAL PRIMARY KEY,
  fecha         DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Argentina/Cordoba')::date),
  vehiculo_id   INT NOT NULL REFERENCES vehiculo(id),
  encargado_id  INT NOT NULL REFERENCES usuario(id),
  estado        VARCHAR(12) NOT NULL DEFAULT 'ABIERTO'
                CHECK (estado IN ('ABIERTO','EN_CURSO','REGRESADO','RENDIDO','CANCELADO')),
  observaciones VARCHAR(300),
  salida_at     TIMESTAMPTZ,
  regreso_at    TIMESTAMPTZ,
  creado_por    INT NOT NULL REFERENCES usuario(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_viaje_estado ON viaje(estado);

-- Un pedido en reparto pertenece a un viaje (NOT VALID: no revisa los pedidos de prueba que ya existían)
ALTER TABLE pedido_mayorista ADD COLUMN viaje_id INT REFERENCES viaje(id);
ALTER TABLE pedido_mayorista
  ADD CONSTRAINT ck_pedido_reparto_con_viaje CHECK (estado <> 'EN_REPARTO' OR viaje_id IS NOT NULL) NOT VALID;
CREATE INDEX ix_pedido_viaje ON pedido_mayorista(viaje_id);

-- Los cobros hechos durante el reparto quedan marcados con su viaje
ALTER TABLE cobro_cliente ADD COLUMN viaje_id INT REFERENCES viaje(id);
CREATE INDEX ix_cobro_viaje ON cobro_cliente(viaje_id);

-- Rendición del efectivo a administración
CREATE TABLE rendicion (
  id                SERIAL PRIMARY KEY,
  viaje_id          INT NOT NULL UNIQUE REFERENCES viaje(id),
  efectivo_esperado NUMERIC(14,2) NOT NULL,
  efectivo_contado  NUMERIC(14,2) NOT NULL CHECK (efectivo_contado >= 0),
  diferencia        NUMERIC(14,2) NOT NULL,
  entregado_por     INT NOT NULL REFERENCES usuario(id),   -- encargado del viaje
  recibido_por      INT NOT NULL REFERENCES usuario(id),   -- administración
  observaciones     VARCHAR(300),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_rendicion_diferencia CHECK (diferencia = efectivo_contado - efectivo_esperado)
);

CREATE TABLE rendicion_cobro (
  rendicion_id INT NOT NULL REFERENCES rendicion(id),
  cobro_id     INT NOT NULL UNIQUE REFERENCES cobro_cliente(id),   -- un cobro se rinde una sola vez
  PRIMARY KEY (rendicion_id, cobro_id)
);

CREATE TRIGGER trg_rendicion_solo_agregar BEFORE UPDATE OR DELETE ON rendicion
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_libro();
CREATE TRIGGER trg_rendicion_cobro_solo_agregar BEFORE UPDATE OR DELETE ON rendicion_cobro
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_libro();

-- Devolución de saldo a favor al cliente
CREATE TABLE reembolso_cliente (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT NOT NULL REFERENCES cliente(id),
  monto           NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  medio           VARCHAR(15) NOT NULL CHECK (medio IN ('TRANSFERENCIA','EFECTIVO')),
  motivo          VARCHAR(200) NOT NULL,
  estado          VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADO','CANCELADO')),
  cuenta_cobro_id INT REFERENCES cuenta_cobro(id),          -- cuenta desde la que se transfirió
  referencia      VARCHAR(100),
  solicitado_por  INT NOT NULL REFERENCES usuario(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  pagado_por      INT REFERENCES usuario(id),
  pagado_at       TIMESTAMPTZ,
  CONSTRAINT ck_reembolso_pagado CHECK (
    (estado = 'PAGADO' AND pagado_por IS NOT NULL AND pagado_at IS NOT NULL) OR
    (estado <> 'PAGADO' AND pagado_por IS NULL))
);
CREATE INDEX ix_reembolso_estado ON reembolso_cliente(estado);

-- El libro admite el nuevo tipo: REEMBOLSO suma (reduce el saldo a favor)
ALTER TABLE movimiento_cuenta_cliente ADD COLUMN reembolso_id INT REFERENCES reembolso_cliente(id);
ALTER TABLE movimiento_cuenta_cliente DROP CONSTRAINT IF EXISTS movimiento_cuenta_cliente_tipo_check;
ALTER TABLE movimiento_cuenta_cliente DROP CONSTRAINT IF EXISTS ck_mov_signo;
ALTER TABLE movimiento_cuenta_cliente
  ADD CONSTRAINT movimiento_cuenta_cliente_tipo_check
    CHECK (tipo IN ('CARGO','PAGO','AJUSTE','DEVOLUCION','REEMBOLSO')),
  ADD CONSTRAINT ck_mov_signo CHECK (
    (tipo = 'CARGO' AND monto > 0) OR
    (tipo IN ('PAGO','DEVOLUCION') AND monto < 0) OR
    (tipo = 'REEMBOLSO' AND monto > 0) OR
    (tipo = 'AJUSTE' AND monto <> 0));

INSERT INTO permiso (codigo, modulo, descripcion) VALUES
 ('mayorista.rendir',          'mayorista', 'Recibir la rendición de efectivo de un viaje'),
 ('mayorista.reembolsar',      'mayorista', 'Solicitar o cancelar la devolución de saldo a favor de un cliente'),
 ('mayorista.pagar_reembolso', 'mayorista', 'Marcar como pagada una devolución a un cliente');

COMMIT;