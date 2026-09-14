import pool from "../../bd/conexion.bd.mjs";

//Obtener todas las cajas fisicas
export async function obtenerTodos(){
    const resultado = await pool.query("SELECT * FROM caja_fisica");
    return resultado.rows;
}

//Buscar una caja por id
export async function obtenerUno(id){
    const resultado = await pool.query("SELECT * FROM caja_fisica WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear una caja fisica
export async function crearUno(dato){
    const resultado = await pool.query("INSERT INTO caja_fisica (sucursal_id, nombre) VALUES ($1, $2) RETURNING *", [dato.sucursal_id, dato.nombre]);
    return resultado.rows[0];
}

//Actualizar una caja fisica por id
export async function actualizarUno(id, dato){
    const resultado = await pool.query("UPDATE caja_fisica SET sucursal_id = $1, nombre = $2 WHERE id = $3 RETURNING *", [dato.sucursal_id, dato.nombre, id]);
    return resultado.rows[0];
}

//Eliminar una caja fisica por id
export async function eliminarUno(id){
    const resultado = await pool.query("DELETE FROM caja_fisica WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}