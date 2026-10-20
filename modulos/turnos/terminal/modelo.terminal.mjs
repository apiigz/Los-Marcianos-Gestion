import pool from "../../bd/conexion.bd.mjs";

// Lista con nombres de caja y sucursal (la usa el POS para elegir terminal)
export async function obtenerTodos() {
  const { rows } = await pool.query(`
    SELECT t.id, t.nombre, t.caja_fisica_id, t.sucursal_id,
           cf.nombre AS caja_nombre, s.nombre AS sucursal_nombre
    FROM terminal t
    JOIN caja_fisica cf ON cf.id = t.caja_fisica_id
    JOIN sucursal s ON s.id = t.sucursal_id
    ORDER BY s.nombre, cf.nombre, t.nombre`);
  return rows;
}

export async function obtenerUno(id) {
  const { rows } = await pool.query("SELECT * FROM terminal WHERE id = $1", [id]);
  return rows[0];
}

export async function crearUno(dato) {
  const { rows } = await pool.query(
    "INSERT INTO terminal (sucursal_id, caja_fisica_id, nombre) VALUES ($1, $2, $3) RETURNING *",
    [dato.sucursal_id, dato.caja_fisica_id, dato.nombre]);
  return rows[0];
}

export async function actualizarUno(id, dato) {
  const { rows } = await pool.query(
    "UPDATE terminal SET sucursal_id = $1, caja_fisica_id = $2, nombre = $3 WHERE id = $4 RETURNING *",
    [dato.sucursal_id, dato.caja_fisica_id, dato.nombre, id]);
  return rows[0];
}

export async function eliminarUno(id) {
  const { rows } = await pool.query("DELETE FROM terminal WHERE id = $1 RETURNING *", [id]);
  return rows[0];
}