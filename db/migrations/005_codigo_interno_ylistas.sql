BEGIN;

ALTER TABLE producto
  ADD COLUMN codigo_interno   VARCHAR(6),
  ADD COLUMN vende_minorista  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN vende_mayorista  BOOLEAN NOT NULL DEFAULT false;

-- Solo dígitos, 1 a 6 (texto, para conservar el "015")
ALTER TABLE producto
  ADD CONSTRAINT ck_producto_codigo_interno
  CHECK (codigo_interno IS NULL OR codigo_interno ~ '^[0-9]{1,6}$');

-- Único, pero solo entre los que tienen código
CREATE UNIQUE INDEX uq_producto_codigo_interno
  ON producto(codigo_interno) WHERE codigo_interno IS NOT NULL;

COMMIT;