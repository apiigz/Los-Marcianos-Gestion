BEGIN;

CREATE TABLE configuracion (
  clave       VARCHAR(60) PRIMARY KEY,
  valor       VARCHAR(200) NOT NULL,
  descripcion VARCHAR(200)
);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
 ('recargo.debito',  '10', '% de recargo por defecto en débito'),
 ('recargo.credito', '10', '% de recargo por defecto en crédito'),
 ('recargo.maximo',  '15', '% máximo que un cajero puede aplicar manualmente');

-- Qué porcentaje se aplicó y quién lo cambió (si difería del default)
ALTER TABLE pago_venta
  ADD COLUMN recargo_porcentaje      NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN recargo_modificado_por  INT REFERENCES usuario(id);

-- Los productos por kilo necesitan mínimo fraccionable
ALTER TABLE stock_sucursal ALTER COLUMN stock_minimo TYPE NUMERIC;

INSERT INTO permiso (codigo, modulo, descripcion)
VALUES ('config.gestionar', 'admin', 'Editar parámetros del sistema (recargos, etc.)');

COMMIT;