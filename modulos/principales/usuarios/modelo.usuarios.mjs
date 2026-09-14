import pool from "../../bd/conexion.bd.mjs";

//Obtener todos los usuarios
export async function obtenerTodos(){
    const resultado = await pool.query("SELECT * FROM usuario");
    return resultado.rows;
}

//Obtener un usuario por id
export async function obtenerUno(id){
    const resultado = await pool.query("SELECT * FROM usuario WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear un usuario
export const crearUno = async (datos) => {
  const { rol_id, nombre, apellido, dni, cuil, email, password_hash, activo } = datos;

  const query = `
    INSERT INTO usuario (
      rol_id, 
      nombre, 
      apellido, 
      dni, 
      cuil, 
      email, 
      password_hash, 
      activo
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING 
      id, 
      rol_id, 
      nombre, 
      apellido, 
      dni, 
      cuil, 
      email, 
      activo;
  `;

  const { rows } = await pool.query(query, [
    rol_id,
    nombre,
    apellido,
    dni,
    cuil,
    email,
    password_hash,
    activo
  ]);

  return rows[0];
};

//Actualizar un usuario por id
export const actualizarUno = async (datos) => {
  const { id, rol_id, nombre, apellido, dni, cuil, email, activo, password_hash } = datos;

  const query = `
    UPDATE usuario 
    SET 
      rol_id = $1,
      nombre = $2,
      apellido = $3,
      dni = $4,
      cuil = $5,
      email = $6,
      activo = $7,
      password_hash = COALESCE($8, password_hash)
    WHERE id = $9
    RETURNING id, rol_id, nombre, apellido, dni, cuil, email, activo;
  `;

  const { rows } = await pool.query(query, [
    rol_id,
    nombre,
    apellido,
    dni,
    cuil,
    email,
    activo,
    password_hash,
    id
  ]);

  return rows[0];
};

//Eliminar un usuario por id
export async function eliminarUno(id){
    const resultado = await pool.query("DELETE FROM usuario WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}

//Cambiar el estado de un usuario (para el panel de Usuarios)
export const cambiarEstado = async (id, activo) => {
  const query = `
    UPDATE usuario 
    SET activo = $1 
    WHERE id = $2 
    RETURNING id, rol_id, nombre, apellido, dni, activo;
  `;
  const { rows } = await pool.query(query, [activo, id]);
  return rows[0];
};


// Buscar usuario por email (para autenticación)
export const encontrarUsuarioParaAuth = async (identifier) => {
  // Busca por email (o dni si quiero después) y trae el nombre del rol
  const query = `
    SELECT 
      u.id,
      u.nombre,
      u.apellido,
      u.dni,
      u.password_hash,
      u.activo,
      r.nombre AS rol
    FROM usuario u
    LEFT JOIN rol r ON u.rol_id = r.id
    WHERE u.dni = $1;
  `;
  const { rows } = await pool.query(query, [identifier]);
  return rows[0];
};