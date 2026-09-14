import pool from "../../bd/conexion.bd.mjs";

//Obtener todos los roles
export async function obtenerTodos(){
    const resultado = await pool.query("SELECT * FROM rol");
    return resultado.rows;
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