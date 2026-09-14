import pool from "../../bd/conexion.bd.mjs";
import { ajustarStock } from "../../productos/stock_sucursal/modelo.stock_sucursal.mjs";

//Obtener todas las ventas
export async function obtenerTodos(){
    const resultado = await pool.query("SELECT * FROM venta");
    return resultado.rows;
}

//Obtener una venta por id
export async function obtenerUno(id){
    const resultado = await pool.query("SELECT * FROM venta WHERE id = $1", [id]);
    return resultado.rows[0];
}

//Crear una venta
export async function crearUno(dato){
    const resultado = await pool.query
    ("INSERT INTO venta (turno_caja_id, terminal_id, usuario_id, fecha_hora, total) VALUES ($1, $2, $3, $4, $5) RETURNING *", 
        [dato.turno_caja_id, dato.terminal_id, dato.usuario_id, dato.fecha_hora, dato.total]);
    return resultado.rows[0];
}

//Actualizar una venta por id
export async function actualizarUno(id, dato){
    const resultado = await pool.query
    ("UPDATE venta SET turno_caja_id = $1, terminal_id = $2, usuario_id = $3, fecha_hora = $4, total = $5 WHERE id = $6 RETURNING *", 
        [dato.turno_caja_id, dato.terminal_id, dato.usuario_id, dato.fecha_hora, dato.total, id]);
    return resultado.rows[0];
}

//Eliminar una venta por id
export async function eliminarUno(id){
    const resultado = await pool.query("DELETE FROM venta WHERE id = $1 RETURNING *", [id]);
    return resultado.rows[0];
}

//Registrar una venta, con detalles y medio de pago
export async function crearVentaTransaccional({ turno_caja_id, terminal_id, usuario_id, total, articulos, pagos }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obtener la sucursal vinculada a la terminal/caja para el descuento de stock
    const resSucursal = await client.query(`
      SELECT COALESCE(t.sucursal_id, cf.sucursal_id) AS sucursal_id
      FROM terminal t
      LEFT JOIN caja_fisica cf ON t.caja_fisica_id = cf.id
      WHERE t.id = $1;
    `, [terminal_id]);

    if (resSucursal.rowCount === 0 || !resSucursal.rows[0].sucursal_id) {
      throw new Error(`No se pudo resolver la sucursal para la terminal ID ${terminal_id}`);
    }
    const sucursalId = resSucursal.rows[0].sucursal_id;

    // 2. Insertar en la tabla venta
    const resVenta = await client.query(`
      INSERT INTO venta (turno_caja_id, terminal_id, usuario_id, fecha_hora, total) 
      VALUES ($1, $2, $3, NOW(), $4) 
      RETURNING id, fecha_hora, total;
    `, [
      turno_caja_id,
      terminal_id,
      usuario_id,
      Number(parseFloat(total).toFixed(2))
    ]);

    const ventaId = resVenta.rows[0].id;

    // 3. Insertar renglones en detalle_venta y ajustar stock
    const queryDetalle = `
      INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, alicuota_iva, subtotal) 
      VALUES ($1, $2, $3, $4, $5, $6);
    `;

    for (const art of articulos) {
      const idProducto = art.producto_id || art.id;
      const cantidad = parseFloat(art.cantidad) || 0;
      const precioUnitario = parseFloat(art.precio_unitario) || 0;
      const subtotalItem = Number((cantidad * precioUnitario).toFixed(2));
      const alicuota = art.alicuota_iva !== undefined ? parseFloat(art.alicuota_iva) : 0;

      await client.query(queryDetalle, [
        ventaId,
        idProducto,
        cantidad,
        precioUnitario,
        alicuota,
        subtotalItem
      ]);

      // Descuento de stock en la sucursal
      await ajustarStock(sucursalId, idProducto, -Number(cantidad.toFixed(3)), client);
    }

    // 4. Insertar en pago_venta y acumular totales para turno_caja
    let totalEfectivo = 0;
    let totalDebito = 0;
    let totalCredito = 0;
    let totalQr = 0;

    const queryPago = `
      INSERT INTO pago_venta (venta_id, medio_pago, monto, recargo) 
      VALUES ($1, $2, $3, $4);
    `;

    for (const p of pagos) {
      const medio = String(p.medio_pago || p.forma_pago || 'EFECTIVO').toUpperCase().trim();
      const montoBase = Number(parseFloat(p.monto || 0).toFixed(2));
      const recargo = Number(parseFloat(p.recargo || 0).toFixed(2));
      const totalMedio = Number((montoBase + recargo).toFixed(2));

      // Inserción en pago_venta (PostgreSQL calcula monto_total automáticamente)
      await client.query(queryPago, [
        ventaId,
        medio,
        montoBase,
        recargo
      ]);

      // Acumulación para turno_caja
      if (medio.includes('EFECTIVO')) {
        totalEfectivo += totalMedio;
      } else if (medio.includes('DEBITO') || medio.includes('DÉBITO')) {
        totalDebito += totalMedio;
      } else if (medio.includes('CREDITO') || medio.includes('CRÉDITO')) {
        totalCredito += totalMedio;
      } else if (medio.includes('QR') || medio.includes('TRANSFERENCIA')) {
        totalQr += totalMedio;
      } else {
        totalQr += totalMedio;
      }
    }

    // 5. Actualización atómica en turno_caja
    await client.query(`
      UPDATE turno_caja 
      SET 
        monto_esperado_sistema = COALESCE(monto_esperado_sistema, 0) + $1,
        total_esperado_debito  = COALESCE(total_esperado_debito, 0) + $2,
        total_esperado_credito = COALESCE(total_esperado_credito, 0) + $3,
        total_esperado_qr      = COALESCE(total_esperado_qr, 0) + $4
      WHERE id = $5;
    `, [
      Number(totalEfectivo.toFixed(2)),
      Number(totalDebito.toFixed(2)),
      Number(totalCredito.toFixed(2)),
      Number(totalQr.toFixed(2)),
      turno_caja_id
    ]);

    await client.query('COMMIT');
    return resVenta.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const obtenerVentasCompletas = async () => {
  const query = `
    SELECT 
      v.id,
      v.turno_caja_id,
      s.id AS sucursal_id,
      v.usuario_id,
      v.fecha_hora,
      v.total,
      s.nombre AS sucursal_nombre,
      cf.nombre AS caja_nombre,
      tc.nombre_turno,
      CONCAT(u.nombre, ' ', u.apellido) AS usuario_nombre,
      
      -- Agrupación de Detalles de Venta
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', dv.id,
          'producto_id', dv.producto_id,
          'producto_descripcion', p.descripcion,
          'codigo_barra', p.codigo_barra,
          'cantidad', dv.cantidad,
          'precio_unitario', dv.precio_unitario,
          'alicuota_iva', dv.alicuota_iva,
          'subtotal', dv.subtotal
        ))
        FROM detalle_venta dv
        JOIN producto p ON dv.producto_id = p.id
        WHERE dv.venta_id = v.id
      ), '[]'::json) AS detalles,

      -- Agrupación de Pagos
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', pv.id,
          'medio_pago', pv.medio_pago,
          'monto', pv.monto,
          'recargo', pv.recargo,
          'monto_total', pv.monto_total
        ))
        FROM pago_venta pv
        WHERE pv.venta_id = v.id
      ), '[]'::json) AS pagos,

      -- Datos de Comprobante Fiscal ARCA (si existe)
      (
        SELECT json_build_object(
          'id', cfiscal.id,
          'tipo_comprobante', cfiscal.tipo_comprobante,
          'punto_de_venta', cfiscal.punto_de_venta,
          'numero_comprobante', cfiscal.numero_comprobante,
          'doc_tipo', cfiscal.doc_tipo,
          'doc_nro', cfiscal.doc_nro,
          'cae', cfiscal.cae,
          'fecha_vto_cae', cfiscal.fecha_vto_cae,
          'estado_arca', cfiscal.estado_arca
        )
        FROM comprobante_fiscal cfiscal
        WHERE cfiscal.venta_id = v.id
        LIMIT 1
      ) AS comprobante

    FROM venta v
    JOIN usuario u ON v.usuario_id = u.id
    JOIN turno_caja tc ON v.turno_caja_id = tc.id
    JOIN caja_fisica cf ON tc.caja_fisica_id = cf.id
    JOIN sucursal s ON cf.sucursal_id = s.id
    ORDER BY v.fecha_hora DESC;
  `;

  const { rows } = await pool.query(query);
  return rows;
};