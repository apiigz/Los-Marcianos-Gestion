import pool from '../../bd/conexion.bd.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';

// ---------- Helpers de validación ----------
const listaValida = (l) => (l === 'minorista' || l === 'mayorista') ? l : null;

function normalizarCodigoInterno(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (!/^\d{1,6}$/.test(s)) {
    throw new ErrorHttp(400, 'El código interno debe tener entre 1 y 6 dígitos (solo números).');
  }
  return s;
}

// El código interno y el de barras comparten el mismo buscador del POS: no pueden pisarse.
// "*" está reservado para multiplicar cantidades (015*16).
async function verificarCodigos({ id, codigo_barra, codigo_interno }) {
  const barra = codigo_barra == null ? '' : String(codigo_barra).trim();
  if (barra.includes('*')) {
    throw new ErrorHttp(400, 'El código de barras no puede contener "*" (se usa para multiplicar cantidades).');
  }

  if (codigo_interno) {
    if (codigo_interno === barra) {
      throw new ErrorHttp(400, 'El código interno no puede ser igual al código de barras.');
    }
    const r = await pool.query(
      'SELECT descripcion FROM producto WHERE codigo_barra = $1 AND id <> $2 LIMIT 1',
      [codigo_interno, id]);
    if (r.rowCount) {
      throw new ErrorHttp(409, `El código interno ${codigo_interno} coincide con el código de barras de "${r.rows[0].descripcion}".`);
    }
  }

  if (barra) {
    const r = await pool.query(
      'SELECT descripcion FROM producto WHERE codigo_interno = $1 AND id <> $2 LIMIT 1',
      [barra, id]);
    if (r.rowCount) {
      throw new ErrorHttp(409, `Ese código de barras coincide con el código interno de "${r.rows[0].descripcion}".`);
    }
  }
}

function traducirError(e) {
  if (e.code === '23505') {
    if (e.constraint === 'uq_producto_codigo_interno') {
      return new ErrorHttp(409, 'Ese código interno ya está asignado a otro producto.');
    }
    if (e.constraint === 'producto_codigo_barra_key') {
      return new ErrorHttp(409, 'Ya existe un producto con ese código de barras.');
    }
  }
  if (e.code === '23514') return new ErrorHttp(400, 'Hay un valor fuera de rango (revisá precios y código interno).');
  return e;
}

// ---------- CRUD ----------
export async function obtenerTodos() {
  const { rows } = await pool.query('SELECT * FROM producto');
  return rows;
}

export async function obtenerUno(id) {
  const { rows } = await pool.query('SELECT * FROM producto WHERE id = $1', [id]);
  return rows[0];
}

export async function crearUno(dato) {
  const codigoInterno = normalizarCodigoInterno(dato.codigo_interno);
  await verificarCodigos({ id: 0, codigo_barra: dato.codigo_barra, codigo_interno: codigoInterno });

  try {
    const { rows } = await pool.query(`
      INSERT INTO producto (categoria_id, proveedor_id, codigo_barra, descripcion, precio_costo,
                            precio_minorista, precio_mayorista, alicuota_iva, activo,
                            codigo_interno, vende_minorista, vende_mayorista)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [dato.categoria_id, dato.proveedor_id, String(dato.codigo_barra).trim(), dato.descripcion,
       dato.precio_costo, dato.precio_minorista, dato.precio_mayorista, dato.alicuota_iva,
       dato.activo ?? true, codigoInterno,
       dato.vende_minorista ?? true, dato.vende_mayorista ?? false]);
    return rows[0];
  } catch (e) { throw traducirError(e); }
}

export async function actualizarUno(id, dato) {
  const cambiaCodigo = Object.prototype.hasOwnProperty.call(dato, 'codigo_interno');
  const codigoInterno = cambiaCodigo ? normalizarCodigoInterno(dato.codigo_interno) : null;
  await verificarCodigos({
    id: Number(id),
    codigo_barra: dato.codigo_barra,
    codigo_interno: cambiaCodigo ? codigoInterno : null
  });

  try {
    const { rows } = await pool.query(`
      UPDATE producto SET
        categoria_id = $1, proveedor_id = $2, codigo_barra = $3, descripcion = $4,
        precio_costo = $5, precio_minorista = $6, precio_mayorista = $7, alicuota_iva = $8,
        activo = COALESCE($9::boolean, activo),
        codigo_interno  = CASE WHEN $10::boolean THEN $11::varchar ELSE codigo_interno END,
        vende_minorista = COALESCE($12::boolean, vende_minorista),
        vende_mayorista = COALESCE($13::boolean, vende_mayorista)
      WHERE id = $14
      RETURNING *`,
      [dato.categoria_id, dato.proveedor_id, String(dato.codigo_barra).trim(), dato.descripcion,
       dato.precio_costo, dato.precio_minorista, dato.precio_mayorista, dato.alicuota_iva,
       dato.activo ?? null, cambiaCodigo, codigoInterno,
       dato.vende_minorista ?? null, dato.vende_mayorista ?? null, id]);
    return rows[0];
  } catch (e) { throw traducirError(e); }
}

export async function eliminarUno(id) {
  const { rows } = await pool.query('DELETE FROM producto WHERE id = $1 RETURNING *', [id]);
  return rows[0];
}

// ---------- Búsquedas del POS ----------
// Coincide por código de barras O por código interno. lista: 'minorista' | 'mayorista' | undefined
export async function buscarProductoPorCodigo(codigo, lista) {
  const { rows } = await pool.query(`
    SELECT p.id, p.categoria_id, p.proveedor_id, p.codigo_barra, p.codigo_interno, p.descripcion,
           p.precio_costo, p.precio_minorista, p.precio_mayorista, p.alicuota_iva, p.activo, p.es_combo,
           p.vende_minorista, p.vende_mayorista,
           COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM producto p
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE (p.codigo_barra = $1 OR p.codigo_interno = $1)
      AND p.activo = true
      AND ($2::text IS NULL
           OR ($2::text = 'minorista' AND p.vende_minorista)
           OR ($2::text = 'mayorista' AND p.vende_mayorista))
    LIMIT 1`, [String(codigo).trim(), listaValida(lista)]);
  return rows[0] || null;
}

export async function buscarPorNombre(termino, lista) {
  const { rows } = await pool.query(`
    SELECT p.id, p.codigo_barra, p.codigo_interno, p.descripcion, p.precio_minorista, p.precio_mayorista,
           p.alicuota_iva, p.es_combo,
           COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM producto p
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE p.descripcion ILIKE $1 AND p.activo = true
      AND ($2::text IS NULL
           OR ($2::text = 'minorista' AND p.vende_minorista)
           OR ($2::text = 'mayorista' AND p.vende_mayorista))
    ORDER BY p.descripcion ASC
    LIMIT 8`, [`%${termino}%`, listaValida(lista)]);
  return rows;
}

// Precios, IVA y lista reales para valorizar una venta (el servidor manda, no el front)
export async function obtenerPorIds(ids) {
  const { rows } = await pool.query(`
    SELECT id, descripcion, precio_minorista, precio_mayorista, alicuota_iva, activo, vende_minorista, vende_mayorista
    FROM producto WHERE id = ANY($1::int[])`, [ids]);
  return rows;
}

// ---------- Estado y combos ----------
export async function cambiarEstadoProducto(id, activo) {
  const { rows } = await pool.query(
    'UPDATE producto SET activo = $1 WHERE id = $2 RETURNING id, descripcion, activo', [activo, id]);
  return rows[0] || null;
}

export async function obtenerComponentesCombo(comboProductoId) {
  const { rows } = await pool.query(`
    SELECT ci.id, ci.combo_producto_id, ci.producto_ingrediente_id, ci.cantidad,
           p.descripcion, p.precio_minorista,
           COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida
    FROM combo_item ci
    JOIN producto p ON ci.producto_ingrediente_id = p.id
    LEFT JOIN categoria c ON p.categoria_id = c.id
    WHERE ci.combo_producto_id = $1`, [comboProductoId]);
  return rows;
}

export async function guardarComponentesCombo(comboProductoId, componentes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE producto SET es_combo = true WHERE id = $1', [comboProductoId]);
    await client.query('DELETE FROM combo_item WHERE combo_producto_id = $1', [comboProductoId]);
    for (const comp of componentes) {
      await client.query(
        'INSERT INTO combo_item (combo_producto_id, producto_ingrediente_id, cantidad) VALUES ($1, $2, $3)',
        [comboProductoId, comp.producto_ingrediente_id, Number(parseFloat(comp.cantidad).toFixed(3))]);
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