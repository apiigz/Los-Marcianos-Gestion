import pool from "../../bd/conexion.bd.mjs";

//Obtener todas las categorias
export async function obtenerTodos(){
    const resultado = await pool.query("SELECT * FROM categoria");
    return resultado.rows;
}

//Obtener una categoria por id
export async function obtenerUno(id){
    const resultado = await pool.query("SELECT * FROM categoria WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear una categoria
export async function crearUno(dato) {
  const unidad = dato.unidad_medida ? dato.unidad_medida.toUpperCase().trim() : 'UNIDAD';

  const resultado = await pool.query(
    `INSERT INTO categoria (nombre, unidad_medida) 
     VALUES ($1, COALESCE($2, 'UNIDAD')) 
     RETURNING *;`,
    [dato.nombre, unidad]
  );
  return resultado.rows[0];
}

//Actualizar una categoria por id
export async function actualizarUno(id, dato) {
  const unidad = dato.unidad_medida ? dato.unidad_medida.toUpperCase().trim() : 'UNIDAD';

  const query = `
    UPDATE categoria 
    SET 
      nombre = $1, 
      unidad_medida = $2
    WHERE id = $3
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [dato.nombre.trim(), unidad, Number(id)]);
  return rows[0];
}

//Eliminar una categoria por id
export async function eliminarUno(id){
    const resultado = await pool.query("DELETE FROM categoria WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}