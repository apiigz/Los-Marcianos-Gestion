import pool from "../../bd/conexion.bd.mjs";

//Obtener todos los roles
export async function obtenerTodos(){
    const { rows } = await pool.query(`
    SELECT r.*,
      (SELECT count(*) FROM usuario u WHERE u.rol_id = r.id)::int AS usuarios,
      (SELECT count(*) FROM rol_permiso rp WHERE rp.rol_id = r.id)::int AS permisos
    FROM rol r ORDER BY r.id`);
  return rows;

}

//Obtener un rol por id
export async function obtenerUno(id){
    const resultado = await pool.query("SELECT * FROM rol WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear un rol
export async function crearUno(dato){
    const resultado = await pool.query
    ("INSERT INTO rol (nombre) VALUES ($1) RETURNING *", [dato.nombre]);
    return resultado.rows[0];
}

//Actualizar un rol por id
export async function actualizarUno(id, dato){
    const resultado = await pool.query
    ("UPDATE rol SET nombre = $1 WHERE id = $2 RETURNING *", [dato.nombre, id]);
    return resultado.rows[0];
}

//Eliminar un rol por id
export async function eliminarUno(id){
    const resultado = await pool.query("DELETE FROM rol WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}

//

export async function obtenerCatalogoPermisos() {
  const { rows } = await pool.query(
    'SELECT codigo, modulo, descripcion FROM permiso ORDER BY modulo, codigo');
  return rows;
}

export async function obtenerPermisosDeRol(rolId) {
  const { rows } = await pool.query(
    'SELECT permiso_codigo FROM rol_permiso WHERE rol_id = $1', [rolId]);
  return rows.map(r => r.permiso_codigo);
}

export async function reemplazarPermisosDeRol(rolId, codigos) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM rol_permiso WHERE rol_id = $1', [rolId]);
    if (codigos.length) {
      await client.query(
        `INSERT INTO rol_permiso (rol_id, permiso_codigo)
         SELECT $1, unnest($2::text[])`, [rolId, codigos]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}