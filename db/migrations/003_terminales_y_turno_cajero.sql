BEGIN;

-- 1. Quién está trabajando en cada turno y desde qué terminal
CREATE TABLE turno_cajero (
  id               SERIAL PRIMARY KEY,
  turno_caja_id    INT NOT NULL REFERENCES turno_caja(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  usuario_id       INT NOT NULL REFERENCES usuario(id)    ON UPDATE CASCADE ON DELETE RESTRICT,
  terminal_id      INT NOT NULL REFERENCES terminal(id)   ON UPDATE CASCADE ON DELETE RESTRICT,
  ingreso          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
  egreso           TIMESTAMPTZ
);

-- Una terminal solo puede tener un cajero activo
CREATE UNIQUE INDEX uq_turno_cajero_terminal_activo
  ON turno_cajero(terminal_id) WHERE egreso IS NULL;
-- Un usuario aparece una sola vez (activo) por turno
CREATE UNIQUE INDEX uq_turno_cajero_usuario_activo
  ON turno_cajero(turno_caja_id, usuario_id) WHERE egreso IS NULL;
CREATE INDEX ix_turno_cajero_turno ON turno_cajero(turno_caja_id);

-- 2. Una caja no puede tener dos turnos vivos a la vez (red de seguridad ante concurrencia)
CREATE UNIQUE INDEX uq_turno_activo_por_caja
  ON turno_caja(caja_fisica_id) WHERE estado IN ('ABIERTO','EN_CIERRE');

-- 3. Permiso para reasignar la terminal de una PC
INSERT INTO permiso (codigo, modulo, descripcion)
VALUES ('pos.cambiar_terminal', 'pos', 'Cambiar la terminal asignada a esta PC');

INSERT INTO rol_permiso (rol_id, permiso_codigo)
SELECT id, 'pos.cambiar_terminal' FROM rol WHERE nombre = 'CAJERO_EXPERIMENTADO';

-- 4. Datos base: una caja por sucursal y dos terminales por caja (solo si no existen)
INSERT INTO caja_fisica (sucursal_id, nombre)
SELECT s.id, 'Caja 1' FROM sucursal s
WHERE NOT EXISTS (SELECT 1 FROM caja_fisica cf WHERE cf.sucursal_id = s.id);

INSERT INTO terminal (sucursal_id, caja_fisica_id, nombre)
SELECT cf.sucursal_id, cf.id, 'Terminal ' || n
FROM caja_fisica cf CROSS JOIN generate_series(1, 2) AS n
WHERE NOT EXISTS (SELECT 1 FROM terminal t WHERE t.caja_fisica_id = cf.id);

COMMIT;