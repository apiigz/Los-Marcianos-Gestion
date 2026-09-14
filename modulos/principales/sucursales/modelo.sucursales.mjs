import pool from "../../bd/conexion.bd.mjs";

//Obtener todas las sucursales
export async function obtenerTodos() {
    const resultado = await pool.query("SELECT * FROM sucursal");
    return resultado.rows;
}

//Obtener una sucursal por id
export async function obtenerUno(id) {
    const resultado = await pool.query("SELECT * FROM sucursal WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear una sucursal
export async function crearUno(dato) {
    const resultado = await pool.query(
        "INSERT INTO sucursal (nombre, direccion, es_deposito_central, punto_de_venta_arca) VALUES ($1, $2, $3, $4) RETURNING *", [dato.nombre, dato.direccion, dato.es_deposito_central, dato.punto_de_venta_arca]);
    return resultado.rows[0];
}

//Actualizar una sucursal por id
export async function actualizarUno(id, dato) {
    const resultado = await pool.query(
        "UPDATE sucursal SET nombre = $1, direccion = $2, es_deposito_central = $3, punto_de_venta_arca = $4 WHERE id = $5 RETURNING *", [dato.nombre, dato.direccion, dato.es_deposito_central, dato.punto_de_venta_arca, id]);
    return resultado.rows[0];
}

//Eliminar una sucursal por id
export async function eliminarUno(id) {
    const resultado = await pool.query("DELETE FROM sucursal WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}