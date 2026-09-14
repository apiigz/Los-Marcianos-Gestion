import pool from "../../bd/conexion.bd.mjs";

//Obtener todos los proveedores
export async function obtenerTodos() {
    const resultado = await pool.query("SELECT * FROM proveedor");
    return resultado.rows;
}

//Obtener un proveedor por id
export async function obtenerUno(id) {
    const resultado = await pool.query("SELECT * FROM proveedor WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear un proveedor
export async function crearUno(dato) {
    const resultado = await pool.query("INSERT INTO proveedor (razon_social, cuit, telefono, contacto_nombre, activo) VALUES ($1, $2, $3, $4, $5) RETURNING *", [dato.razon_social, dato.cuit, dato.telefono, dato.contacto_nombre, dato.activo]);
    return resultado.rows[0];
}

//Actualizar un proveedor por id
export async function actualizarUno(id, dato) {
    const resultado = await pool.query("UPDATE proveedor SET razon_social = $1, cuit = $2, telefono = $3, contacto_nombre = $4, activo = $5 WHERE id = $6 RETURNING *", [dato.razon_social, dato.cuit, dato.telefono, dato.contacto_nombre, dato.activo, id]);
    return resultado.rows[0];
}

//Eliminar un proveedor por id
export async function eliminarUno(id) {
    const resultado = await pool.query("DELETE FROM proveedor WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}

export const cambiarEstado = async (id, activo) => {
  const query = `
    UPDATE proveedor
    SET activo = $1
    WHERE id = $2
    RETURNING id, razon_social, cuit, telefono, contacto_nombre, activo;
  `;

  const { rows } = await pool.query(query, [activo, id]);
  return rows[0];
};