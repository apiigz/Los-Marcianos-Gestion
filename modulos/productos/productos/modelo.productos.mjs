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
export async function buscarProductoPorCodigo(codigo) {
  const query = `
    SELECT 
      p.id,
      p.categoria_id,
      p.proveedor_id,
      p.codigo_barra,
      p.descripcion,
      p.precio_costo,
      p.precio_minorista,
      p.precio_mayorista,
      p.alicuota_iva,
      p.activo,
      p.es_combo,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM producto p
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE p.codigo_barra = $1 AND p.activo = true
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [codigo]);
  return rows[0] || null;
}

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

export async function cambiarEstadoProducto(id, activo) {
  const query = `
    UPDATE producto
    SET activo = $1
    WHERE id = $2
    RETURNING id, descripcion, activo;
  `;
  const { rows } = await pool.query(query, [activo, id]);
  return rows[0] || null;
}

export async function obtenerComponentesCombo(comboProductoId) {
  const query = `
    SELECT 
      ci.id,
      ci.combo_producto_id,
      ci.producto_ingrediente_id,
      ci.cantidad,
      p.descripcion,
      p.precio_minorista,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM combo_item ci
    JOIN producto p ON ci.producto_ingrediente_id = p.id
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE ci.combo_producto_id = $1;
  `;
  const { rows } = await pool.query(query, [comboProductoId]);
  return rows;
}

// Guardar o actualizar componentes de un combo (reemplaza los anteriores de forma atómica)
export async function guardarComponentesCombo(comboProductoId, componentes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Marcar el producto padre como es_combo = true
    await client.query('UPDATE producto SET es_combo = true WHERE id = $1', [comboProductoId]);

    // 2. Limpiar ingredientes previos
    await client.query('DELETE FROM combo_item WHERE combo_producto_id = $1', [comboProductoId]);

    // 3. Insertar nuevos ingredientes
    const insertQuery = `
      INSERT INTO combo_item (combo_producto_id, producto_ingrediente_id, cantidad)
      VALUES ($1, $2, $3);
    `;

    for (const comp of componentes) {
      await client.query(insertQuery, [
        comboProductoId,
        comp.producto_ingrediente_id,
        Number(parseFloat(comp.cantidad).toFixed(3))
      ]);
    }

    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}