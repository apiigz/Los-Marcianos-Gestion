import pool from '../bd/conexion.bd.mjs';

export async function cargarUsuarioConPermisos(id) {
  const { rows } = await pool.query(`
    SELECT u.id, u.nombre, u.apellido, u.dni, u.activo, u.rol_id, r.nombre AS rol
    FROM usuario u JOIN rol r ON r.id = u.rol_id
    WHERE u.id = $1`, [id]);
  const u = rows[0];
  if (!u) return null;

  const q = u.rol === 'ADMINISTRADOR'
    ? await pool.query('SELECT codigo FROM permiso')
    : await pool.query('SELECT permiso_codigo AS codigo FROM rol_permiso WHERE rol_id = $1', [u.rol_id]);

  u.permisos = q.rows.map(r => r.codigo);
  return u;
}