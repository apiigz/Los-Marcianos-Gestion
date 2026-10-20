ALTER TABLE rol
  ADD COLUMN es_admin   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN es_sistema BOOLEAN NOT NULL DEFAULT false;

UPDATE rol SET es_admin = true, es_sistema = true WHERE nombre = 'ADMINISTRADOR';
UPDATE rol SET es_sistema = true WHERE nombre IN ('CAJERO_EXPERIMENTADO', 'CAJERO_NOVATO');