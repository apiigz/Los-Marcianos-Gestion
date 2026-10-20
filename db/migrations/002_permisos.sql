BEGIN;

CREATE TABLE permiso (
  codigo      VARCHAR(60) PRIMARY KEY,
  modulo      VARCHAR(40) NOT NULL,
  descripcion VARCHAR(200) NOT NULL
);

CREATE TABLE rol_permiso (
  rol_id         INT NOT NULL REFERENCES rol(id) ON UPDATE CASCADE ON DELETE CASCADE,
  permiso_codigo VARCHAR(60) NOT NULL REFERENCES permiso(codigo) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_codigo)
);

INSERT INTO permiso (codigo, modulo, descripcion) VALUES
 ('admin.acceder',            'general',  'Entrar al panel de administración'),
 ('pos.acceder',              'pos',      'Entrar a la terminal de ventas'),
 ('venta.crear',              'pos',      'Registrar ventas'),
 ('venta.cambiar_recargo',    'pos',      'Modificar el recargo de tarjeta'),
 ('venta.elegir_tipo_factura','pos',      'Elegir tipo de factura (A/B/M)'),
 ('venta.reembolsar',         'pos',      'Reembolsar tickets'),
 ('venta.fiado',              'pos',      'Cargar ventas al fiado de empleados'),
 ('venta.devolucion',         'pos',      'Usar modo devolución (F2)'),
 ('turno.abrir',              'turnos',   'Abrir turno de caja'),
 ('turno.cerrar',             'turnos',   'Cerrar turno de caja'),
 ('turno.cerrar_si_esta_solo','turnos',   'Cerrar turno solo si no hay un cajero con permiso de cierre activo'),
 ('turno.ver_todos',          'turnos',   'Ver el listado de turnos (admin)'),
 ('turno.auditar',            'turnos',   'Auditar arqueos y forzar cierres'),
 ('ventas.ver_todas',         'ventas',   'Ver el historial completo de ventas'),
 ('productos.ver',            'productos','Ver catálogo'),
 ('productos.editar',         'productos','Crear/editar/desactivar productos y combos'),
 ('categorias.gestionar',     'productos','ABM de categorías'),
 ('proveedores.gestionar',    'productos','ABM de proveedores'),
 ('stock.ver',                'stock',    'Ver stock'),
 ('stock.ajustar',            'stock',    'Ajustar stock manualmente'),
 ('stock.ver_costos',         'stock',    'Ver costos y valorización del stock'),
 ('usuarios.gestionar',       'admin',    'ABM de usuarios'),
 ('roles.gestionar',          'admin',    'Editar roles y sus permisos'),
 ('sucursales.gestionar',     'admin',    'ABM de sucursales, cajas y terminales'),
 ('estadisticas.ver',         'admin',    'Ver estadísticas y dashboard');

UPDATE rol SET nombre = 'CAJERO_EXPERIMENTADO' WHERE nombre = 'CAJERO';
INSERT INTO rol (nombre) VALUES ('CAJERO_NOVATO');

INSERT INTO rol_permiso (rol_id, permiso_codigo)
SELECT r.id, p.c FROM rol r,
 unnest(ARRAY['pos.acceder','venta.crear','venta.cambiar_recargo','venta.elegir_tipo_factura',
              'venta.reembolsar','venta.fiado','venta.devolucion','turno.abrir','turno.cerrar']) AS p(c)
WHERE r.nombre = 'CAJERO_EXPERIMENTADO';

INSERT INTO rol_permiso (rol_id, permiso_codigo)
SELECT r.id, p.c FROM rol r,
 unnest(ARRAY['pos.acceder','venta.crear','venta.fiado','turno.abrir','turno.cerrar_si_esta_solo']) AS p(c)
WHERE r.nombre = 'CAJERO_NOVATO';

COMMIT;