BEGIN;

CREATE TABLE pedido_mayorista (
  id                SERIAL PRIMARY KEY,
  remito_numero     BIGINT NOT NULL UNIQUE DEFAULT nextval('remito_mayorista_seq'),
  cliente_id        INT NOT NULL REFERENCES cliente(id),
  sucursal_origen_id INT NOT NULL REFERENCES sucursal(id),
  emisor_id         INT REFERENCES emisor_fiscal(id),          -- se completa cuando haya facturación
  canal             VARCHAR(30) NOT NULL,
  estado            VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','PREPARADO','EN_REPARTO','ENTREGADO','CANCELADO')),
  total             NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  stock_descontado  BOOLEAN NOT NULL DEFAULT false,
  observaciones     VARCHAR(500),
  creado_por        INT NOT NULL REFERENCES usuario(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedido_may_estado  ON pedido_mayorista(estado);
CREATE INDEX ix_pedido_may_cliente ON pedido_mayorista(cliente_id);

CREATE TABLE pedido_item (
  id              SERIAL PRIMARY KEY,
  pedido_id       INT NOT NULL REFERENCES pedido_mayorista(id) ON DELETE CASCADE,
  producto_id     INT NOT NULL REFERENCES producto(id),
  cantidad        NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  alicuota_iva    NUMERIC(4,2)  NOT NULL CHECK (alicuota_iva >= 0),
  subtotal        NUMERIC(14,2) NOT NULL,
  CONSTRAINT uq_pedido_item UNIQUE (pedido_id, producto_id)
);

-- Historial: quién hizo qué y cuándo (el "control" que pidieron)
CREATE TABLE pedido_evento (
  id         SERIAL PRIMARY KEY,
  pedido_id  INT NOT NULL REFERENCES pedido_mayorista(id) ON DELETE CASCADE,
  tipo       VARCHAR(40) NOT NULL,
  usuario_id INT NOT NULL REFERENCES usuario(id),
  detalle    VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedido_evento_pedido ON pedido_evento(pedido_id);

-- Libro de cuenta corriente del cliente. monto > 0: el cliente debe; monto < 0: pagó.
-- Saldo = SUM(monto). Los cargos se generan al entregar (paso 4/5).
CREATE TABLE movimiento_cuenta_cliente (
  id         SERIAL PRIMARY KEY,
  cliente_id INT NOT NULL REFERENCES cliente(id),
  pedido_id  INT REFERENCES pedido_mayorista(id),
  tipo       VARCHAR(20) NOT NULL CHECK (tipo IN ('CARGO','PAGO','AJUSTE','DEVOLUCION')),
  monto      NUMERIC(14,2) NOT NULL,
  detalle    VARCHAR(300),
  usuario_id INT NOT NULL REFERENCES usuario(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_mov_cuenta_cliente ON movimiento_cuenta_cliente(cliente_id);

-- Canales de pedido configurables (otro negocio puede tener otros)
INSERT INTO configuracion (clave, valor, descripcion) VALUES
 ('mayorista.canales', 'TELEFONO,WHATSAPP,PRESENCIAL,EN_ENTREGA', 'Canales por los que llegan pedidos mayoristas (separados por coma)');

COMMIT;