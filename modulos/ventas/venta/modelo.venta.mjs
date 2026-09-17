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
export async function crearVentaTransaccional({ 
  turno_caja_id, 
  terminal_id, 
  usuario_id, 
  total, 
  articulos, 
  pagos, 
  empleado_fiado_id = null,
  tipo_operacion = 'VENTA'
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obtener la sucursal asignada
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

    // 2. Insertar registro en venta
    const resVenta = await client.query(`
      INSERT INTO venta (turno_caja_id, terminal_id, usuario_id, fecha_hora, total, tipo_operacion) 
      VALUES ($1, $2, $3, NOW(), $4, $5) 
      RETURNING id, fecha_hora, total, tipo_operacion;
    `, [
      turno_caja_id, 
      terminal_id, 
      usuario_id, 
      Number(parseFloat(total).toFixed(2)),
      tipo_operacion
    ]);

    const ventaId = resVenta.rows[0].id;

    // 3. Insertar renglones y actualizar inventario
    const queryDetalle = `
      INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, alicuota_iva, subtotal) 
      VALUES ($1, $2, $3, $4, $5, $6);
    `;

    for (const art of articulos) {
      const idProducto = art.producto_id || art.id;
      const cantidad = parseFloat(art.cantidad) || 0;
      const precioUnitario = parseFloat(art.precio_unitario) || 0;
      const subtotalItem = Number((cantidad * precioUnitario).toFixed(2));
      const alicuota = art.alicuota_iva !== undefined ? parseFloat(art.alicuota_iva) : 21.00;

      await client.query(queryDetalle, [
        ventaId,
        idProducto,
        cantidad,
        precioUnitario,
        alicuota,
        subtotalItem
      ]);

      // Verificar si es combo/promo
      const resCombo = await client.query(
        'SELECT producto_ingrediente_id, cantidad FROM combo_item WHERE combo_producto_id = $1',
        [idProducto]
      );

      // Si cantidad es positiva (venta normal), se resta del stock (-cantidad).
      // Si cantidad es negativa (devolución F2 o reintegro de envase), se reincorpora al stock (-(-cantidad) = +cantidad).
      if (resCombo.rowCount > 0) {
        for (const ing of resCombo.rows) {
          const delta = Number((parseFloat(ing.cantidad) * cantidad).toFixed(3));
          await ajustarStock(sucursalId, ing.producto_ingrediente_id, -delta, client);
        }
      } else {
        await ajustarStock(sucursalId, idProducto, -Number(cantidad.toFixed(3)), client);
      }
    }

    // 4. Registrar en pago_venta
    let totalEfectivo = 0;
    let totalDebito = 0;
    let totalCredito = 0;
    let totalQr = 0;
    let esFiado = Boolean(empleado_fiado_id);

    const queryPago = `
      INSERT INTO pago_venta (venta_id, medio_pago, monto, recargo) 
      VALUES ($1, $2, $3, $4);
    `;

    for (const p of pagos) {
      const medioRaw = String(p.medio_pago || p.forma_pago || '').toUpperCase().trim();
      const montoBase = Number(parseFloat(p.monto || 0).toFixed(2));
      const recargo = Number(parseFloat(p.recargo || 0).toFixed(2));
      const totalMedio = Number((montoBase + recargo).toFixed(2));

      let medioEnum = 'EFECTIVO';
      if (medioRaw.includes('DEBITO') || medioRaw.includes('DÉBITO')) {
        medioEnum = 'DEBITO';
        totalDebito += totalMedio;
      } else if (medioRaw.includes('CREDITO') || medioRaw.includes('CRÉDITO')) {
        medioEnum = 'CREDITO';
        totalCredito += totalMedio;
      } else if (medioRaw.includes('QR') || medioRaw.includes('TRANSFERENCIA')) {
        medioEnum = 'QR/Transf';
        totalQr += totalMedio;
      } else if (medioRaw.includes('FIADO')) {
        medioEnum = 'EFECTIVO';
        esFiado = true;
      } else {
        medioEnum = 'EFECTIVO';
        if (!esFiado) totalEfectivo += totalMedio;
      }

      await client.query(queryPago, [ventaId, medioEnum, montoBase, recargo]);
    }

    // 5. Asentar fiado en cuenta corriente si aplica
    if (esFiado && empleado_fiado_id) {
      await client.query(`
        INSERT INTO cuenta_corriente_empleado (empleado_id, venta_id, monto, fecha_hora)
        VALUES ($1, $2, $3, NOW());
      `, [empleado_fiado_id, ventaId, total]);
    }

    // 6. Impactar en el arqueo del turno_caja
    if (!esFiado) {
      await client.query(`
        UPDATE turno_caja 
        SET 
          monto_esperado_sistema = COALESCE(monto_esperado_sistema, 0) + $1,
          total_esperado_debito  = COALESCE(total_esperado_debito, 0) + $2,
          total_esperado_credito = COALESCE(total_esperado_credito, 0) + $3,
          total_esperado_qr      = COALESCE(total_esperado_qr, 0) + $4
        WHERE id = $5;
      `, [totalEfectivo, totalDebito, totalCredito, totalQr, turno_caja_id]);
    }

    await client.query('COMMIT');
    return resVenta.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Detalle expandible del historial
export async function obtenerDetalleVenta(venta_id) {
  const queryArticulos = `
    SELECT 
      dv.id,
      dv.producto_id,
      p.descripcion,
      p.es_combo,
      dv.cantidad,
      dv.precio_unitario,
      dv.subtotal
    FROM detalle_venta dv
    JOIN producto p ON dv.producto_id = p.id
    WHERE dv.venta_id = $1;
  `;

  const queryPagos = `
    SELECT medio_pago, monto, recargo, monto_total
    FROM pago_venta
    WHERE venta_id = $1;
  `;

  const [resArticulos, resPagos] = await Promise.all([
    pool.query(queryArticulos, [venta_id]),
    pool.query(queryPagos, [venta_id])
  ]);

  return {
    articulos: resArticulos.rows,
    pagos: resPagos.rows
  };
}

// Reembolso total de un ticket ya asentado
export async function reembolsarVentaTransaccional(venta_id) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const resVenta = await client.query(`
      SELECT id, turno_caja_id, terminal_id, total, estado
      FROM venta
      WHERE id = $1
      FOR UPDATE;
    `, [venta_id]);

    if (resVenta.rowCount === 0) throw new Error('La venta no existe.');
    const venta = resVenta.rows[0];

    if (venta.estado === 'REEMBOLSADA') {
      throw new Error('Esta venta ya fue reembolsada con anterioridad.');
    }

    const resSucursal = await client.query(`
      SELECT COALESCE(t.sucursal_id, cf.sucursal_id) AS sucursal_id
      FROM terminal t
      LEFT JOIN caja_fisica cf ON t.caja_fisica_id = cf.id
      WHERE t.id = $1;
    `, [venta.terminal_id]);
    const sucursalId = resSucursal.rows[0].sucursal_id;

    // Verificar medios de pago: Bloquear si se usó tarjeta o QR
    const resPagos = await client.query(`SELECT medio_pago, monto_total FROM pago_venta WHERE venta_id = $1;`, [venta_id]);
    let totalEfectivoReembolso = 0;
    let tieneElectronicos = false;

    for (const p of resPagos.rows) {
      if (p.medio_pago === 'EFECTIVO') {
        totalEfectivoReembolso += parseFloat(p.monto_total);
      } else if (p.medio_pago === 'DEBITO' || p.medio_pago === 'CREDITO') {
        tieneElectronicos = true;
      }
    }

    if (tieneElectronicos) {
      throw new Error('No es posible reembolsar desde la terminal ventas abonadas con Débito o Crédito. Comuníquese con el encargado.');
    }

    // Reintegrar mercadería al stock disponible
    const resDetalles = await client.query(`SELECT producto_id, cantidad FROM detalle_venta WHERE venta_id = $1;`, [venta_id]);
    for (const art of resDetalles.rows) {
      const cantidad = parseFloat(art.cantidad);

      const resCombo = await client.query(
        'SELECT producto_ingrediente_id, cantidad FROM combo_item WHERE combo_producto_id = $1',
        [art.producto_id]
      );

      if (resCombo.rowCount > 0) {
        for (const ing of resCombo.rows) {
          const delta = Number((parseFloat(ing.cantidad) * cantidad).toFixed(3));
          await client.query(`
            UPDATE stock_sucursal 
            SET cantidad_disponible = cantidad_disponible + $1
            WHERE sucursal_id = $2 AND producto_id = $3;
          `, [delta, sucursalId, ing.producto_ingrediente_id]);
        }
      } else {
        await client.query(`
          UPDATE stock_sucursal 
          SET cantidad_disponible = cantidad_disponible + $1
          WHERE sucursal_id = $2 AND producto_id = $3;
        `, [cantidad, sucursalId, art.producto_id]);
      }
    }

    // Descontar la salida de efectivo de la caja física
    if (totalEfectivoReembolso > 0) {
      await client.query(`
        UPDATE turno_caja
        SET monto_esperado_sistema = GREATEST(0, monto_esperado_sistema - $1)
        WHERE id = $2;
      `, [totalEfectivoReembolso, venta.turno_caja_id]);
    }

    // Anular fiado si correspondía
    await client.query(`DELETE FROM cuenta_corriente_empleado WHERE venta_id = $1;`, [venta_id]);

    // Marcar como reembolsada
    await client.query(`UPDATE venta SET estado = 'REEMBOLSADA' WHERE id = $1;`, [venta_id]);

    await client.query('COMMIT');
    return { ok: true, venta_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Historial del turno activo
export async function obtenerVentasPorTurnoo(turno_caja_id) {
  const query = `
    SELECT 
      v.id,
      v.fecha_hora,
      v.total,
      v.estado,
      v.tipo_operacion,
      u.nombre AS cajero_nombre,
      COALESCE(
        json_agg(
          json_build_object(
            'medio_pago', pv.medio_pago,
            'monto', pv.monto,
            'recargo', pv.recargo,
            'monto_total', pv.monto_total
          )
        ) FILTER (WHERE pv.id IS NOT NULL), '[]'
      ) AS pagos
    FROM venta v
    LEFT JOIN usuario u ON v.usuario_id = u.id
    LEFT JOIN pago_venta pv ON v.id = pv.venta_id
    WHERE v.turno_caja_id = $1
    GROUP BY v.id, u.nombre
    ORDER BY v.id DESC;
  `;
  const { rows } = await pool.query(query, [turno_caja_id]);
  return rows;
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

export async function obtenerVentasPorTurno(turno_caja_id) {
  const query = `
    WITH ventas_numeradas AS (
      SELECT 
        v.id,
        v.turno_caja_id,
        v.fecha_hora,
        v.total,
        COALESCE(v.estado, 'COMPLETADA') AS estado,
        COALESCE(v.tipo_operacion, 'VENTA') AS tipo_operacion,
        u.nombre AS cajero_nombre,
        ROW_NUMBER() OVER (PARTITION BY v.turno_caja_id ORDER BY v.fecha_hora ASC, v.id ASC) AS nro_ticket_turno
      FROM venta v
      LEFT JOIN usuario u ON v.usuario_id = u.id
      WHERE v.turno_caja_id = $1
    )
    SELECT 
      vn.id,
      vn.nro_ticket_turno,
      vn.fecha_hora,
      vn.total,
      vn.estado,
      vn.tipo_operacion,
      vn.cajero_nombre,
      COALESCE(
        json_agg(
          json_build_object(
            'medio_pago', pv.medio_pago,
            'monto', pv.monto,
            'recargo', pv.recargo,
            'monto_total', pv.monto_total
          )
        ) FILTER (WHERE pv.id IS NOT NULL), '[]'
      ) AS pagos
    FROM ventas_numeradas vn
    LEFT JOIN pago_venta pv ON vn.id = pv.venta_id
    GROUP BY vn.id, vn.nro_ticket_turno, vn.fecha_hora, vn.total, vn.estado, vn.tipo_operacion, vn.cajero_nombre
    ORDER BY vn.nro_ticket_turno DESC;
  `;
  const { rows } = await pool.query(query, [turno_caja_id]);
  return rows;
}