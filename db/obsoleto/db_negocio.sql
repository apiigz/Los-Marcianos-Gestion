-- ::::::::::::::::::::::::::::::::::::::::::::::: --
-- Sistema de Gestión para Kiosco Los Marcianos 24hs --
-- Motor: PostgreSQL 14+ --
-- :::::::::::::::::::::::::::::::::::::::::::::: --

-- Limpieza para entornos de desarrollo --

DROP TABLE IF EXISTS comprobante_fiscal CASCADE;
DROP TABLE IF EXISTS detalle_venta CASCADE;
DROP TABLE IF EXISTS venta CASCADE;
DROP TABLE IF EXISTS turno_caja CASCADE;
DROP TABLE IF EXISTS terminal CASCADE;
DROP TABLE IF EXISTS caja_fisica CASCADE;
DROP TABLE IF EXISTS stock_sucursal CASCADE;
DROP TABLE IF EXISTS producto CASCADE;
DROP TABLE IF EXISTS categoria CASCADE;
DROP TABLE IF EXISTS proveedor CASCADE;
DROP TABLE IF EXISTS usuario CASCADE;
DROP TABLE IF EXISTS rol CASCADE;
DROP TABLE IF EXISTS sucursal CASCADE;

-- Limpieza de tipos ENUM existentes --

DROP TYPE IF EXISTS estado_arca_enum CASCADE;
DROP TYPE IF EXISTS medio_pago_enum CASCADE;
DROP TYPE IF EXISTS nombre_turno_enum CASCADE;
DROP TYPE IF EXISTS estado_turno_enum CASCADE;

-- Declaración de los ENUMs --

CREATE TYPE estado_arca_enum AS ENUM (
    'PENDIENTE', 
    'APROBADO', 
    'RECHAZADO'
);

CREATE TYPE medio_pago_enum AS ENUM (
    'EFECTIVO', 
    'MIXTO', 
    'DEBITO', 
    'CREDITO'
);

CREATE TYPE nombre_turno_enum AS ENUM (
    'MAÑANA', 
    'TARDE', 
    'NOCHE'
);

CREATE TYPE estado_turno_enum AS ENUM (
    'ABIERTO', 
    'EN_CIERRE', 
    'CERRADO'
);

-- Tablas principales --

CREATE TABLE rol (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE sucursal (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    direccion VARCHAR(200) NOT NULL,
    es_deposito_central BOOLEAN NOT NULL DEFAULT FALSE,
    punto_de_venta_arca INT NOT NULL UNIQUE
);

CREATE TABLE usuario (
    id SERIAL PRIMARY KEY,
    rol_id INT NOT NULL REFERENCES rol(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    dni VARCHAR(15) NOT NULL UNIQUE,
    cuil VARCHAR(15) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    biometrico_id INT UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categoria (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE proveedor (
    id SERIAL PRIMARY KEY,
    razon_social VARCHAR(150) NOT NULL,
    cuit VARCHAR(11) NOT NULL UNIQUE,
    telefono VARCHAR(50),
    contacto_nombre VARCHAR(100),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tablas de productos y stock --

CREATE TABLE producto (
    id SERIAL PRIMARY KEY,
    categoria_id INT NOT NULL REFERENCES categoria(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    proveedor_id INT NOT NULL REFERENCES proveedor(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    codigo_barra VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(200) NOT NULL,
    precio_costo NUMERIC(12, 2) NOT NULL CHECK (precio_costo >= 0),
    precio_minorista NUMERIC(12, 2) NOT NULL CHECK (precio_minorista >= 0),
    precio_mayorista NUMERIC(12, 2) NOT NULL CHECK (precio_mayorista >= 0),
    alicuota_iva NUMERIC(4, 2) NOT NULL DEFAULT 21.00 CHECK (alicuota_iva >= 0),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_sucursal (
    id SERIAL PRIMARY KEY,
    sucursal_id INT NOT NULL REFERENCES sucursal(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    producto_id INT NOT NULL REFERENCES producto(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    cantidad_disponible INT NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
    stock_minimo INT NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    CONSTRAINT uq_stock_sucursal_producto UNIQUE (sucursal_id, producto_id)
);

-- Tablas relacionadas a los turnos (turno, caja, y terminal, lógica explicada en el PDF que les envié) --

CREATE TABLE caja_fisica (
    id SERIAL PRIMARY KEY,
    sucursal_id INT NOT NULL REFERENCES sucursal(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    nombre VARCHAR(50) NOT NULL
);

CREATE TABLE terminal (
    id SERIAL PRIMARY KEY,
    sucursal_id INT NOT NULL REFERENCES sucursal(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    caja_fisica_id INT NOT NULL REFERENCES caja_fisica(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    nombre VARCHAR(50) NOT NULL
);

CREATE TABLE turno_caja (
    id SERIAL PRIMARY KEY,
    caja_fisica_id INT NOT NULL REFERENCES caja_fisica(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    nombre_turno nombre_turno_enum NOT NULL,
    fecha_apertura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP WITH TIME ZONE,
    monto_inicial_efectivo NUMERIC(12, 2) NOT NULL CHECK (monto_inicial_efectivo >= 0),
    monto_esperado_sistema NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_real_arqueo NUMERIC(12, 2),
    diferencia NUMERIC(12, 2),
    estado estado_turno_enum NOT NULL DEFAULT 'ABIERTO'
);

-- Tablas de venta y detalle --

CREATE TABLE venta (
    id SERIAL PRIMARY KEY,
    turno_caja_id INT NOT NULL REFERENCES turno_caja(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    terminal_id INT NOT NULL REFERENCES terminal(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    usuario_id INT NOT NULL REFERENCES usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    medio_pago medio_pago_enum NOT NULL
);

CREATE TABLE detalle_venta (
    id SERIAL PRIMARY KEY,
    venta_id INT NOT NULL REFERENCES venta(id) ON UPDATE CASCADE ON DELETE CASCADE,
    producto_id INT NOT NULL REFERENCES producto(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
    alicuota_iva NUMERIC(4, 2) NOT NULL CHECK (alicuota_iva >= 0),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0)
);

-- Tabla de facturación electrónica y fiscal (ARCA - WSFEv1) --

CREATE TABLE comprobante_fiscal (
    id SERIAL PRIMARY KEY,
    venta_id INT NOT NULL UNIQUE REFERENCES venta(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    tipo_comprobante INT NOT NULL, -- 1: Factura A, 6: Factura B
    punto_de_venta INT NOT NULL, -- Punto de venta asignado
    numero_comprobante BIGINT NOT NULL, -- Secuencia correlativa
    doc_tipo INT NOT NULL, -- 80: CUIT, 96: DNI, 99: Consumidor Final
    doc_nro BIGINT NOT NULL, -- Identificación del comprador
    condicion_iva_receptor_id INT, -- Condición IVA frente a ARCA
    cae VARCHAR(14), -- 14 dígitos numéricos provistos por ARCA
    fecha_vto_cae DATE, -- Vencimiento otorgado del CAE
    estado_arca estado_arca_enum NOT NULL DEFAULT 'PENDIENTE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_comprobante_fiscal_numero UNIQUE (tipo_comprobante, punto_de_venta, numero_comprobante)
);

-- Datos de prueba (comentarlos una vez se pase a entorno de producción) --

INSERT INTO rol (nombre) VALUES 
('ADMINISTRADOR'),
('CAJERO');

INSERT INTO sucursal (nombre, direccion, es_deposito_central, punto_de_venta_arca) VALUES 
('Sucursal Hidalgo', 'Hidalgo', FALSE, 1),
('Sucursal Storni', 'Storni', TRUE, 2),
('Sucursal Alem', 'Alem', FALSE, 3);

INSERT INTO categoria (nombre) VALUES 
('Bebidas'),
('Snacks'),
('Dulces'),
('Lácteos'),
('Panadería');

INSERT INTO producto(categoria_id, proveedor_id, codigo_barra, descripcion, precio_costo, precio_minorista, precio_mayorista, alicuota_iva, activo, created_at) VALUES 
(1, 1, '6789012345678', 'Sprite 500ml', 45.00, 90.00, 80.00, 21.00, TRUE, CURRENT_TIMESTAMP),
(2, 2, '7890123456789', 'Doritos Nacho', 35.00, 70.00, 65.00, 21.00, TRUE, CURRENT_TIMESTAMP),
(3, 3, '8901234567890', 'Alfajor Havanna', 50.00, 100.00, 90.00, 21.00, TRUE, CURRENT_TIMESTAMP),
(4, 4, '9012345678901', 'Yogur La Serenísima', 60.00, 120.00, 110.00, 21.00, TRUE, CURRENT_TIMESTAMP),
(5, 5, '0123456789012', 'Pan Integral', 25.00, 50.00, 45.00, 21.00, TRUE, CURRENT_TIMESTAMP);

INSERT INTO proveedor (razon_social, cuit, telefono, contacto_nombre, activo) VALUES 
('Coca-Cola', '20304050607', '123456789', 'Juan Pérez', TRUE),
('Pepsico', '20304050608', '987654321', 'María López', TRUE),
('Havanna', '20304050609', '555555555', 'Carlos García', TRUE),
('La Serenísima', '20304050610', '444444444', 'Ana Fernández', TRUE),
('Wilson', '20304050611', '333333333', 'Luis Martínez', TRUE);

INSERT INTO usuario(rol_id, nombre, apellido, dni, cuil, email, password_hash, biometrico_id, activo) VALUES
(3, 'Facundo', 'Sarmiento', '12345678', '20-12345678-9', 'facundo.sarmiento@example.com', 'hashed_password', NULL, TRUE),
(4, 'Alejandro', 'Haller', '87654321', '20-87654321-0', 'alejandro.haller@example.com', 'hashed_password', NULL, TRUE);

INSERT INTO stock_sucursal(sucursal_id, producto_id, cantidad_disponible, stock_minimo) VALUES 
(1, 1, 100, 10),
(1, 2, 150, 15),
(1, 3, 200, 20),
(2, 4, 120, 12),
(2, 5, 80, 8),
(3, 1, 90, 9),
(3, 2, 110, 11),
(3, 3, 130, 13);