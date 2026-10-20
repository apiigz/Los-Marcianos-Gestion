import pool from "../../bd/conexion.bd.mjs";
import { ajustarStock } from "../../productos/stock_sucursal/modelo.stock_sucursal.mjs";
import { ErrorHttp } from "../../utils/errores.mjs";

const MEDIO_ENUM = {
  EFECTIVO: 'EFECTIVO',
  DEBITO: 'DEBITO',
  CREDITO: 'CREDITO',
  QR: 'QR/Transf',
  FIADO_EMPLEADO: 'EFECTIVO'   // el fiado no mueve caja: se distingue por cuenta_corriente_empleado
};


//Registrar una venta, con detalles y medio de pago
export async function crearVentaTransaccional({
  turno_caja_id, terminal_id, usuario_id, total, articulos, pagos,
  empleado_fiado_id = null, tipo_operacion = 'VENTA'
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Turno y terminal: el turno debe estar ABIERTO y ser de la caja de esta terminal.
    //    FOR UPDATE serializa las ventas concurrentes sobre el mismo turno.
    const { rows: chk } = await client.query(`
      SELECT tc.estado, tc.caja_fisica_id, t.caja_fisica_id AS caja_terminal, t.sucursal_id
      FROM turno_caja tc
      JOIN terminal t ON t.id = $2
      WHERE tc.id = $1
      FOR UPDATE OF tc`, [turno_caja_id, terminal_id]);

    if (!chk[0]) throw new ErrorHttp(404, 'Turno o terminal inexistente.');
    if (chk[0].estado !== 'ABIERTO') throw new ErrorHttp(409, 'El turno ya no está abierto.', 'TURNO_NO_ABIERTO');
    if (chk[0].caja_fisica_id !== chk[0].caja_terminal) {
      throw new ErrorHttp(409, 'La terminal no corresponde a la caja del turno.', 'TERMINAL_INVALIDA');
    }
    const sucursalId = chk[0].sucursal_id;

    // 2. Empleado del fiado
    if (empleado_fiado_id) {
      const emp = await client.query('SELECT 1 FROM usuario WHERE id = $1 AND activo = true', [empleado_fiado_id]);
      if (!emp.rowCount) throw new ErrorHttp(400, 'El empleado elegido para el fiado no existe o está inactivo.');
    }

    // 3. Cabecera
    const resVenta = await client.query(`
      INSERT INTO venta (turno_caja_id, terminal_id, usuario_id, fecha_hora, total, tipo_operacion)
      VALUES ($1, $2, $3, NOW(), $4, $5)
      RETURNING id, fecha_hora, total, tipo_operacion;`,
      [turno_caja_id, terminal_id, usuario_id, total, tipo_operacion]);
    const ventaId = resVenta.rows[0].id;

    // 4. Renglones + stock (los combos descuentan sus ingredientes)
    for (const l of articulos) {
      await client.query(`
        INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, alicuota_iva, subtotal)
        VALUES ($1, $2, $3, $4, $5, $6);`,
        [ventaId, l.producto_id, l.cantidad, l.precio_unitario, l.alicuota_iva, l.subtotal]);

      const resCombo = await client.query(
        'SELECT producto_ingrediente_id, cantidad FROM combo_item WHERE combo_producto_id = $1',
        [l.producto_id]);

      // cantidad > 0 resta stock; cantidad < 0 (devolución) lo repone
      if (resCombo.rowCount > 0) {
        for (const ing of resCombo.rows) {
          const delta = Number((parseFloat(ing.cantidad) * l.cantidad).toFixed(3));
          await ajustarStock(sucursalId, ing.producto_ingrediente_id, -delta, client);
        }
      } else {
        await ajustarStock(sucursalId, l.producto_id, -l.cantidad, client);
      }
    }

    // 5. Pagos y acumulados esperados del turno
    const esFiado = Boolean(empleado_fiado_id);
    let totalEfectivo = 0, totalDebito = 0, totalCredito = 0, totalQr = 0;

    for (const p of pagos) {
      const medioEnum = MEDIO_ENUM[p.medio_pago];
      if (!medioEnum) throw new ErrorHttp(400, `Medio de pago desconocido: ${p.medio_pago}`);

      await client.query(`
        INSERT INTO pago_venta (venta_id, medio_pago, monto, recargo, recargo_porcentaje, recargo_modificado_por)
        VALUES ($1, $2, $3, $4, $5, $6);`,
        [ventaId, medioEnum, p.monto, p.recargo, p.recargo_porcentaje ?? 0, p.modificado_por ?? null]);

      const totalMedio = Number((p.monto + p.recargo).toFixed(2));
      if (p.medio_pago === 'EFECTIVO') totalEfectivo += totalMedio;
      else if (p.medio_pago === 'DEBITO') totalDebito += totalMedio;
      else if (p.medio_pago === 'CREDITO') totalCredito += totalMedio;
      else if (p.medio_pago === 'QR') totalQr += totalMedio;
    }

    // 6. Fiado → cuenta corriente del empleado (no toca la caja)
    if (esFiado) {
      await client.query(`
        INSERT INTO cuenta_corriente_empleado (empleado_id, venta_id, monto, fecha_hora)
        VALUES ($1, $2, $3, NOW());`, [empleado_fiado_id, ventaId, total]);
    } else {
      await client.query(`
        UPDATE turno_caja SET
          monto_esperado_sistema = COALESCE(monto_esperado_sistema, 0) + $1,
          total_esperado_debito  = COALESCE(total_esperado_debito, 0)  + $2,
          total_esperado_credito = COALESCE(total_esperado_credito, 0) + $3,
          total_esperado_qr      = COALESCE(total_esperado_qr, 0)      + $4
        WHERE id = $5;`, [totalEfectivo, totalDebito, totalCredito, totalQr, turno_caja_id]);
    }

    // 7. Cada venta cuenta como señal de vida del cajero (regla del novato)
    await client.query(`
      UPDATE turno_cajero SET ultima_actividad = now()
      WHERE turno_caja_id = $1 AND usuario_id = $2 AND egreso IS NULL;`, [turno_caja_id, usuario_id]);

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

// Reembolso total de un ticket. El efectivo sale del turno ABIERTO de la terminal que lo hace.
export async function reembolsarVentaTransaccional(venta_id, terminal_id) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Turno abierto de la caja de ESTA terminal (ahí impacta la salida de efectivo)
    const resTurno = await client.query(`
      SELECT tc.id, t.sucursal_id
      FROM terminal t
      JOIN turno_caja tc ON tc.caja_fisica_id = t.caja_fisica_id AND tc.estado = 'ABIERTO'
      WHERE t.id = $1
      FOR UPDATE OF tc`, [terminal_id]);
    if (!resTurno.rowCount) throw new ErrorHttp(409, 'No hay un turno abierto en esta terminal.');
    const turnoActualId = resTurno.rows[0].id;
    const sucursalTerminal = resTurno.rows[0].sucursal_id;

    // 2. La venta
    const resVenta = await client.query(`
      SELECT v.id, v.estado, v.tipo_operacion, t.sucursal_id
      FROM venta v JOIN terminal t ON t.id = v.terminal_id
      WHERE v.id = $1
      FOR UPDATE OF v`, [venta_id]);
    if (!resVenta.rowCount) throw new ErrorHttp(404, 'La venta no existe.');
    const venta = resVenta.rows[0];

    if (venta.estado === 'REEMBOLSADA') throw new ErrorHttp(409, 'Esta venta ya fue reembolsada con anterioridad.');
    if (venta.tipo_operacion !== 'VENTA') throw new ErrorHttp(409, 'Solo se pueden reembolsar ventas, no devoluciones.');
    if (venta.sucursal_id !== sucursalTerminal) {
      throw new ErrorHttp(409, 'Solo se puede reembolsar en la sucursal donde se realizó la venta.');
    }
    const sucursalId = venta.sucursal_id;

    // 3. Medios de pago: bloquear tarjeta; el fiado no mueve efectivo
    const esFiado = (await client.query(
      'SELECT 1 FROM cuenta_corriente_empleado WHERE venta_id = $1', [venta_id])).rowCount > 0;

    const resPagos = await client.query(
      'SELECT medio_pago, monto_total FROM pago_venta WHERE venta_id = $1', [venta_id]);
    let totalEfectivoReembolso = 0;
    for (const p of resPagos.rows) {
      if (p.medio_pago === 'DEBITO' || p.medio_pago === 'CREDITO') {
        throw new ErrorHttp(409, 'No es posible reembolsar desde la terminal ventas abonadas con Débito o Crédito. Comuníquese con el encargado.');
      }
      if (p.medio_pago === 'EFECTIVO' && !esFiado) totalEfectivoReembolso += parseFloat(p.monto_total);
    }

    // 4. Devolver la mercadería al stock
    const resDetalles = await client.query(
      'SELECT producto_id, cantidad FROM detalle_venta WHERE venta_id = $1', [venta_id]);
    for (const art of resDetalles.rows) {
      const cantidad = parseFloat(art.cantidad);
      const resCombo = await client.query(
        'SELECT producto_ingrediente_id, cantidad FROM combo_item WHERE combo_producto_id = $1',
        [art.producto_id]);

      if (resCombo.rowCount > 0) {
        for (const ing of resCombo.rows) {
          const delta = Number((parseFloat(ing.cantidad) * cantidad).toFixed(3));
          await ajustarStock(sucursalId, ing.producto_ingrediente_id, delta, client);
        }
      } else {
        await ajustarStock(sucursalId, art.producto_id, Number(cantidad.toFixed(3)), client);
      }
    }

    // 5. Salida de efectivo en el turno ACTUAL (no en el de la venta original)
    if (totalEfectivoReembolso > 0) {
      await client.query(
        'UPDATE turno_caja SET monto_esperado_sistema = monto_esperado_sistema - $1 WHERE id = $2',
        [totalEfectivoReembolso, turnoActualId]);
    }

    // 6. Anular el fiado y marcar la venta
    await client.query('DELETE FROM cuenta_corriente_empleado WHERE venta_id = $1', [venta_id]);
    await client.query("UPDATE venta SET estado = 'REEMBOLSADA' WHERE id = $1", [venta_id]);

    await client.query('COMMIT');
    return { ok: true, venta_id, turno_id: turnoActualId };
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