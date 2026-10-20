-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.rol (
  id integer NOT NULL DEFAULT nextval('rol_id_seq'::regclass),
  nombre character varying NOT NULL UNIQUE,
  CONSTRAINT rol_pkey PRIMARY KEY (id)
);
CREATE TABLE public.sucursal (
  id integer NOT NULL DEFAULT nextval('sucursal_id_seq'::regclass),
  nombre character varying NOT NULL UNIQUE,
  direccion character varying NOT NULL,
  es_deposito_central boolean NOT NULL DEFAULT false,
  punto_de_venta_arca integer NOT NULL UNIQUE,
  CONSTRAINT sucursal_pkey PRIMARY KEY (id)
);
CREATE TABLE public.usuario (
  id integer NOT NULL DEFAULT nextval('usuario_id_seq'::regclass),
  rol_id integer NOT NULL,
  nombre character varying NOT NULL,
  apellido character varying NOT NULL,
  dni character varying NOT NULL UNIQUE,
  cuil character varying NOT NULL UNIQUE,
  email character varying NOT NULL UNIQUE,
  password_hash character varying NOT NULL,
  biometrico_id integer UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT usuario_pkey PRIMARY KEY (id),
  CONSTRAINT usuario_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.rol(id)
);
CREATE TABLE public.categoria (
  id integer NOT NULL DEFAULT nextval('categoria_id_seq'::regclass),
  nombre character varying NOT NULL UNIQUE,
  unidad_medida character varying DEFAULT 'UNIDAD'::character varying CHECK (unidad_medida::text = ANY (ARRAY['UNIDAD'::character varying, 'KILO'::character varying, 'KG'::character varying]::text[])),
  CONSTRAINT categoria_pkey PRIMARY KEY (id)
);
CREATE TABLE public.proveedor (
  id integer NOT NULL DEFAULT nextval('proveedor_id_seq'::regclass),
  razon_social character varying NOT NULL,
  cuit character varying NOT NULL UNIQUE,
  telefono character varying,
  contacto_nombre character varying,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT proveedor_pkey PRIMARY KEY (id)
);
CREATE TABLE public.producto (
  id integer NOT NULL DEFAULT nextval('producto_id_seq'::regclass),
  categoria_id integer NOT NULL,
  proveedor_id integer NOT NULL,
  codigo_barra text NOT NULL UNIQUE,
  descripcion character varying NOT NULL,
  precio_costo numeric NOT NULL CHECK (precio_costo >= 0::numeric),
  precio_minorista numeric NOT NULL CHECK (precio_minorista >= 0::numeric),
  precio_mayorista numeric NOT NULL CHECK (precio_mayorista >= 0::numeric),
  alicuota_iva numeric NOT NULL DEFAULT 21.00 CHECK (alicuota_iva >= 0::numeric),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  es_combo boolean DEFAULT false,
  CONSTRAINT producto_pkey PRIMARY KEY (id),
  CONSTRAINT producto_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categoria(id),
  CONSTRAINT producto_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedor(id)
);
CREATE TABLE public.stock_sucursal (
  id integer NOT NULL DEFAULT nextval('stock_sucursal_id_seq'::regclass),
  sucursal_id integer NOT NULL,
  producto_id integer NOT NULL,
  cantidad_disponible numeric NOT NULL DEFAULT 0,
  stock_minimo integer NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
  CONSTRAINT stock_sucursal_pkey PRIMARY KEY (id),
  CONSTRAINT stock_sucursal_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursal(id),
  CONSTRAINT stock_sucursal_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.producto(id)
);
CREATE TABLE public.caja_fisica (
  id integer NOT NULL DEFAULT nextval('caja_fisica_id_seq'::regclass),
  sucursal_id integer NOT NULL,
  nombre character varying NOT NULL,
  CONSTRAINT caja_fisica_pkey PRIMARY KEY (id),
  CONSTRAINT caja_fisica_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursal(id)
);
CREATE TABLE public.terminal (
  id integer NOT NULL DEFAULT nextval('terminal_id_seq'::regclass),
  sucursal_id integer NOT NULL,
  caja_fisica_id integer NOT NULL,
  nombre character varying NOT NULL,
  CONSTRAINT terminal_pkey PRIMARY KEY (id),
  CONSTRAINT terminal_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursal(id),
  CONSTRAINT terminal_caja_fisica_id_fkey FOREIGN KEY (caja_fisica_id) REFERENCES public.caja_fisica(id)
);
CREATE TABLE public.turno_caja (
  id integer NOT NULL DEFAULT nextval('turno_caja_id_seq'::regclass),
  caja_fisica_id integer NOT NULL,
  nombre_turno USER-DEFINED NOT NULL,
  fecha_apertura timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre timestamp with time zone,
  monto_inicial_efectivo numeric NOT NULL CHECK (monto_inicial_efectivo >= 0::numeric),
  monto_esperado_sistema numeric NOT NULL DEFAULT 0.00,
  monto_real_arqueo numeric,
  diferencia numeric,
  estado USER-DEFINED NOT NULL DEFAULT 'ABIERTO'::estado_turno_enum CHECK (estado = ANY (ARRAY['ABIERTO'::estado_turno_enum, 'EN_CIERRE'::estado_turno_enum, 'CERRADO'::estado_turno_enum])),
  total_esperado_debito numeric DEFAULT 0.00,
  total_esperado_credito numeric DEFAULT 0.00,
  total_esperado_qr numeric DEFAULT 0.00,
  usuario_apertura_id integer,
  segundo_cajero_id integer,
  usuario_cierre_id integer,
  CONSTRAINT turno_caja_pkey PRIMARY KEY (id),
  CONSTRAINT turno_caja_caja_fisica_id_fkey FOREIGN KEY (caja_fisica_id) REFERENCES public.caja_fisica(id),
  CONSTRAINT turno_caja_usuario_apertura_id_fkey FOREIGN KEY (usuario_apertura_id) REFERENCES public.usuario(id),
  CONSTRAINT turno_caja_segundo_cajero_id_fkey FOREIGN KEY (segundo_cajero_id) REFERENCES public.usuario(id),
  CONSTRAINT turno_caja_usuario_cierre_id_fkey FOREIGN KEY (usuario_cierre_id) REFERENCES public.usuario(id)
);
CREATE TABLE public.venta (
  id integer NOT NULL DEFAULT nextval('venta_id_seq'::regclass),
  turno_caja_id integer NOT NULL,
  terminal_id integer NOT NULL,
  usuario_id integer NOT NULL,
  fecha_hora timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total numeric NOT NULL,
  estado character varying DEFAULT 'COMPLETADA'::character varying CHECK (estado::text = ANY (ARRAY['COMPLETADA'::character varying, 'REEMBOLSADA'::character varying]::text[])),
  tipo_operacion character varying DEFAULT 'VENTA'::character varying CHECK (tipo_operacion::text = ANY (ARRAY['VENTA'::character varying, 'DEVOLUCION_PARCIAL'::character varying, 'VALE_ENVASE'::character varying]::text[])),
  CONSTRAINT venta_pkey PRIMARY KEY (id),
  CONSTRAINT venta_turno_caja_id_fkey FOREIGN KEY (turno_caja_id) REFERENCES public.turno_caja(id),
  CONSTRAINT venta_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminal(id),
  CONSTRAINT venta_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id)
);
CREATE TABLE public.detalle_venta (
  id integer NOT NULL DEFAULT nextval('detalle_venta_id_seq'::regclass),
  venta_id integer NOT NULL,
  producto_id integer NOT NULL,
  cantidad numeric NOT NULL,
  precio_unitario numeric NOT NULL CHECK (precio_unitario >= 0::numeric),
  alicuota_iva numeric NOT NULL CHECK (alicuota_iva >= 0::numeric),
  subtotal numeric NOT NULL,
  CONSTRAINT detalle_venta_pkey PRIMARY KEY (id),
  CONSTRAINT detalle_venta_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id),
  CONSTRAINT detalle_venta_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.producto(id)
);
CREATE TABLE public.comprobante_fiscal (
  id integer NOT NULL DEFAULT nextval('comprobante_fiscal_id_seq'::regclass),
  venta_id integer NOT NULL UNIQUE,
  tipo_comprobante integer NOT NULL,
  punto_de_venta integer NOT NULL,
  numero_comprobante bigint NOT NULL,
  doc_tipo integer NOT NULL,
  doc_nro bigint NOT NULL,
  condicion_iva_receptor_id integer,
  cae character varying,
  fecha_vto_cae date,
  estado_arca USER-DEFINED NOT NULL DEFAULT 'PENDIENTE'::estado_arca_enum,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT comprobante_fiscal_pkey PRIMARY KEY (id),
  CONSTRAINT comprobante_fiscal_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id)
);
CREATE TABLE public.pago_venta (
  id integer NOT NULL DEFAULT nextval('pago_venta_id_seq'::regclass),
  venta_id integer NOT NULL,
  medio_pago USER-DEFINED NOT NULL,
  monto numeric NOT NULL,
  recargo numeric NOT NULL DEFAULT 0.00 CHECK (recargo >= 0::numeric),
  monto_total numeric DEFAULT (monto + recargo),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pago_venta_pkey PRIMARY KEY (id),
  CONSTRAINT pago_venta_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id)
);
CREATE TABLE public.combo_item (
  id integer NOT NULL DEFAULT nextval('combo_item_id_seq'::regclass),
  combo_producto_id integer NOT NULL,
  producto_ingrediente_id integer NOT NULL,
  cantidad numeric NOT NULL,
  CONSTRAINT combo_item_pkey PRIMARY KEY (id),
  CONSTRAINT combo_item_combo_producto_id_fkey FOREIGN KEY (combo_producto_id) REFERENCES public.producto(id),
  CONSTRAINT combo_item_producto_ingrediente_id_fkey FOREIGN KEY (producto_ingrediente_id) REFERENCES public.producto(id)
);
CREATE TABLE public.cuenta_corriente_empleado (
  id integer NOT NULL DEFAULT nextval('cuenta_corriente_empleado_id_seq'::regclass),
  empleado_id integer NOT NULL,
  venta_id integer NOT NULL,
  monto numeric NOT NULL,
  fecha_hora timestamp with time zone DEFAULT now(),
  CONSTRAINT cuenta_corriente_empleado_pkey PRIMARY KEY (id),
  CONSTRAINT cuenta_corriente_empleado_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuario(id),
  CONSTRAINT cuenta_corriente_empleado_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id)
);