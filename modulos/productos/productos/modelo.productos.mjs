import pool from '../../bd/conexion.bd.mjs';

//Obtener todos los productos
export async function obtenerTodos() {
  const resultado = await pool.query("SELECT * FROM producto");
  return resultado.rows;
}

//Buscar un producto por id
export async function obtenerUno(id) {
  const resultado = await pool.query("SELECT * FROM producto WHERE id = $1", [id]);
  return resultado.rows[0];
}

//Crear un producto
export async function crearUno(dato) {
  const resultado = await pool.query
  ("INSERT INTO producto (categoria_id, proveedor_id, codigo_barra, descripcion, precio_costo, precio_minorista, precio_mayorista, alicuota_iva, activo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *", [dato.categoria_id, dato.proveedor_id, dato.codigo_barra, dato.descripcion, dato.precio_costo, dato.precio_minorista, dato.precio_mayorista, dato.alicuota_iva, dato.activo]);
  return resultado.rows[0];
}

//Actualizar un producto por id
export async function actualizarUno(id, dato) {
  const resultado = await pool.query
  ("UPDATE producto SET categoria_id = $1, proveedor_id = $2, codigo_barra = $3, descripcion = $4, precio_costo = $5, precio_minorista = $6, precio_mayorista = $7, alicuota_iva = $8, activo = $9 WHERE id = $10 RETURNING *", [dato.categoria_id, dato.proveedor_id, dato.codigo_barra, dato.descripcion, dato.precio_costo, dato.precio_minorista, dato.precio_mayorista, dato.alicuota_iva, dato.activo, id]);
  return resultado.rows[0];
}

//Eliminar un producto por id
export async function eliminarUno(id) {
  const resultado = await pool.query("DELETE FROM producto WHERE id = $1 RETURNING *", [id]);
  return resultado.rows[0];
}


// 1. Búsqueda exacta por código de barras (usada al escanear)
export const buscarPorCodigoBarra = async (codigo) => {
  const query = `
    SELECT 
      p.id, 
      p.codigo_barra, 
      p.descripcion, 
      p.precio_minorista, 
      p.alicuota_iva, 
      p.activo, 
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM producto p
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE p.codigo_barra = $1 AND p.activo = true;
  `;
  const { rows } = await pool.query(query, [String(codigo).trim()]);
  return rows[0];
};

// 2. Búsqueda predictiva por nombre / descripción (autocompletado)
export const buscarPorNombre = async (termino) => {
  const query = `
    SELECT 
      p.id, 
      p.codigo_barra, 
      p.descripcion, 
      p.precio_minorista, 
      p.alicuota_iva,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM producto p
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE p.descripcion ILIKE $1 AND p.activo = true
    ORDER BY p.descripcion ASC
    LIMIT 8; -- Límite para no sobrecargar el desplegable
  `;
  // %termino% permite buscar cualquier coincidencia ignorando mayúsculas/minúsculas
  const { rows } = await pool.query(query, [`%${termino}%`]);
  return rows;
};