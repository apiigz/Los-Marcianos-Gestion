import pool from '../../bd/conexion.bd.mjs';


//CONSULTAS DE LECTURA (Con JOINs para obtener nombres y códigos)

// Traer todo el stock de todas las sucursales (usado en la grilla general de admin)
export async function obtenerStockSucursales() {
  const query = `
    SELECT 
      ss.id,
      ss.sucursal_id,
      s.nombre AS sucursal_nombre,
      ss.producto_id,
      p.codigo_barra,
      p.descripcion AS producto_nombre,
      p.precio_minorista,
      ss.cantidad_disponible,
      ss.stock_minimo,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM stock_sucursal ss
    INNER JOIN sucursal s ON ss.sucursal_id = s.id
    INNER JOIN producto p ON ss.producto_id = p.id
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE p.activo = true
    ORDER BY s.nombre ASC, p.descripcion ASC;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

// Traer el stock de un producto específico en todas las sucursales donde existe
export async function obtenerStockProductoSucursales(producto_id) {
  const query = `
    SELECT 
      ss.id,
      ss.sucursal_id,
      s.nombre AS sucursal_nombre,
      ss.producto_id,
      p.codigo_barra,
      p.descripcion AS producto_nombre,
      ss.cantidad_disponible,
      ss.stock_minimo,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM stock_sucursal ss
    INNER JOIN sucursal s ON ss.sucursal_id = s.id
    INNER JOIN producto p ON ss.producto_id = p.id
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE ss.producto_id = $1
    ORDER BY s.nombre ASC;
  `;
  const { rows } = await pool.query(query, [producto_id]);
  return rows;
}

// Traer todo el catálogo e inventario de una sucursal en particular (usado por filtro de pestañas o POS)
export const obtenerStockSucursalProducto = async (sucursal_id) => {
  const query = `
    SELECT 
      ss.id,
      ss.sucursal_id,
      ss.producto_id,
      ss.cantidad_disponible,
      ss.stock_minimo,
      p.descripcion AS producto_nombre,
      p.codigo_barra,
      p.precio_minorista,
      s.nombre AS sucursal_nombre,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM stock_sucursal ss
    JOIN producto p ON ss.producto_id = p.id
    JOIN sucursal s ON ss.sucursal_id = s.id
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE ss.sucursal_id = $1
    ORDER BY p.descripcion ASC;
  `;
  const { rows } = await pool.query(query, [sucursal_id]);
  return rows;
};

// Traer el stock puntual de un solo producto en una sucursal específica
export async function obtenerStockProductoSucursal(producto_id, sucursal_id) {
  const query = `
    SELECT 
      ss.id,
      ss.sucursal_id,
      ss.producto_id,
      p.codigo_barra,
      p.descripcion AS producto_nombre,
      p.precio_minorista,
      ss.cantidad_disponible,
      ss.stock_minimo,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM stock_sucursal ss
    INNER JOIN producto p ON ss.producto_id = p.id
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE ss.producto_id = $1 AND ss.sucursal_id = $2;
  `;
  const { rows } = await pool.query(query, [producto_id, sucursal_id]);
  return rows[0];
}

// Crear o inicializar stock puntual (usa ON CONFLICT para actualizar si ya existía)
export async function crearStockSucursal(sucursal_id, producto_id, cantidad_disponible = 0, stock_minimo = 5) {
  const query = `
    INSERT INTO stock_sucursal (sucursal_id, producto_id, cantidad_disponible, stock_minimo) 
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (sucursal_id, producto_id) 
    DO UPDATE SET 
      cantidad_disponible = EXCLUDED.cantidad_disponible,
      stock_minimo = EXCLUDED.stock_minimo
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [sucursal_id, producto_id, cantidad_disponible, stock_minimo]);
  return rows[0];
}

// Inicializar un producto recién creado en TODAS las sucursales existentes en 0
// Acepta un 'dbClient' opcional para ejecutarse dentro de la transacción de creación del producto
export async function inicializarStockEnTodasLasSucursales(producto_id, stock_minimo = 5, dbClient = pool) {
  const query = `
    INSERT INTO stock_sucursal (sucursal_id, producto_id, cantidad_disponible, stock_minimo)
    SELECT id, $1, 0, $2
    FROM sucursal
    ON CONFLICT (sucursal_id, producto_id) DO NOTHING
    RETURNING *;
  `;
  const { rows } = await dbClient.query(query, [producto_id, stock_minimo]);
  return rows;
}

// Sobreescritura manual de valores por sucursal y producto
export async function actualizarStockSucursal(sucursal_id, producto_id, cantidad_disponible, stock_minimo) {
  const query = `
    UPDATE stock_sucursal 
    SET cantidad_disponible = $1, stock_minimo = $2 
    WHERE producto_id = $3 AND sucursal_id = $4 
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [cantidad_disponible, stock_minimo, producto_id, sucursal_id]);
  return rows[0];
}

// Ajuste relativo atómico (+ reposición / - venta)
// Recibe 'delta' numérico (admite fracciones como -0.250 kg) y soporta cliente transaccional
export async function ajustarStock(sucursal_id, producto_id, delta, dbClient = pool) {
  const query = `
    UPDATE stock_sucursal 
    SET cantidad_disponible = cantidad_disponible + $1
    WHERE sucursal_id = $2 AND producto_id = $3
    RETURNING *;
  `;
  const { rows } = await dbClient.query(query, [delta, sucursal_id, producto_id]);
  return rows[0];
}

// Actualizar el stock desde el panel de admin usando el ID de la fila
export async function actualizarStockPorId(id, cantidad_disponible, stock_minimo) {
  const query = `
    UPDATE stock_sucursal 
    SET cantidad_disponible = $1, stock_minimo = $2 
    WHERE id = $3 
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [cantidad_disponible, stock_minimo, id]);
  return rows[0];
}


export async function eliminarStockSucursal(producto_id, sucursal_id) {
  const query = `
    DELETE FROM stock_sucursal 
    WHERE producto_id = $1 AND sucursal_id = $2 
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [producto_id, sucursal_id]);
  return rows[0];
}