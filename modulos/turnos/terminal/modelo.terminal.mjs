import pool from "../../bd/conexion.bd.mjs";

//Obtener todas las terminales
export async function obtenerTodos(){
    const resultado = await pool.query("SELECT * FROM terminal");
    return resultado.rows;
}

//Buscar una terminal por id
export async function obtenerUno(id){
    const resultado = await pool.query("SELECT * FROM terminal WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear una terminal
export async function crearUno(dato){
    const resultado = await pool.query("INSERT INTO terminal (sucursal_id, caja_fisica_id, nombre) VALUES ($1, $2, $3) RETURNING *", [dato.sucursal_id, dato.caja_fisica_id, dato.nombre]);
    return resultado.rows[0];
}

//Actualizar una terminal por id
export async function actualizarUno(id, dato){
    const resultado = await pool.query("UPDATE terminal SET sucursal_id = $1, caja_fisica_id = $2, nombre = $3 WHERE id = $4 RETURNING *", [dato.sucursal_id, dato.caja_fisica_id, dato.nombre, id]);
    return resultado.rows[0];
}

//Eliminar una terminal por id
export async function eliminarUno(id){
    const resultado = await pool.query("DELETE FROM terminal WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}