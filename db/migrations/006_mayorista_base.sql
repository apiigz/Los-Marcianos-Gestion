BEGIN;

-- Clientes de la distribuidora
CREATE TABLE cliente (
  id             SERIAL PRIMARY KEY,
  razon_social   VARCHAR(150) NOT NULL,
  cuit           VARCHAR(11),
  condicion_iva  VARCHAR(30) NOT NULL DEFAULT 'CONSUMIDOR_FINAL'
                 CHECK (condicion_iva IN ('RESPONSABLE_INSCRIPTO','MONOTRIBUTO','EXENTO','CONSUMIDOR_FINAL')),
  telefono       VARCHAR(50),
  direccion      VARCHAR(200),
  limite_credito NUMERIC(12,2) CHECK (limite_credito IS NULL OR limite_credito >= 0),  -- NULL = sin límite
  observaciones  VARCHAR(500),
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ck_cliente_cuit CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$')
);
CREATE UNIQUE INDEX uq_cliente_cuit ON cliente(cuit) WHERE cuit IS NOT NULL;

-- A qué cuenta entran las transferencias (kiosco, monotributo, etc.)
CREATE TABLE cuenta_cobro (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(100) NOT NULL UNIQUE,
  alias   VARCHAR(100),
  titular VARCHAR(150),
  activa  BOOLEAN NOT NULL DEFAULT true
);

-- Quién emite los comprobantes fiscales (se carga cuando se defina con el contador)
CREATE TABLE emisor_fiscal (
  id            SERIAL PRIMARY KEY,
  razon_social  VARCHAR(150) NOT NULL,
  cuit          VARCHAR(11) NOT NULL UNIQUE CHECK (cuit ~ '^[0-9]{11}$'),
  condicion_iva VARCHAR(30) NOT NULL
                CHECK (condicion_iva IN ('RESPONSABLE_INSCRIPTO','MONOTRIBUTO','EXENTO')),
  activo        BOOLEAN NOT NULL DEFAULT true
);

-- Número de remito interno ("contra boleta")
CREATE SEQUENCE remito_mayorista_seq START 1;

-- Configuración: módulos activables y datos del negocio
INSERT INTO configuracion (clave, valor, descripcion) VALUES
 ('modulo.mayorista', 'true',  'Habilita el módulo de ventas mayoristas'),
 ('modulo.rrhh',      'false', 'Habilita el módulo de Recursos Humanos'),
 ('negocio.nombre',   'Los Marcianos 24hs', 'Nombre que se muestra en tickets y comprobantes');

-- Permisos (no se asignan a ningún rol: el admin los tiene siempre; el resto desde Roles)
INSERT INTO permiso (codigo, modulo, descripcion) VALUES
 ('cliente.gestionar',              'mayorista', 'Crear y editar clientes de la distribuidora'),
 ('mayorista.ver',                  'mayorista', 'Ver pedidos y clientes mayoristas'),
 ('mayorista.vender',               'mayorista', 'Tomar y cargar pedidos mayoristas'),
 ('mayorista.preparar',             'mayorista', 'Marcar pedidos como preparados'),
 ('mayorista.cargar_camioneta',     'mayorista', 'Cargar la camioneta y despachar pedidos'),
 ('mayorista.entregar',             'mayorista', 'Confirmar entregas y cobrar en destino'),
 ('mayorista.verificar_transferencia','mayorista','Verificar transferencias recibidas'),
 ('mayorista.exceder_limite',       'mayorista', 'Autorizar pedidos que superan el límite de crédito');

COMMIT;