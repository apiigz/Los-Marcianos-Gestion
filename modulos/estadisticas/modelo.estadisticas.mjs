import pool from '../bd/conexion.bd.mjs';

// 1. KPIs Generales de Facturación y Rentabilidad
export async function obtenerResumenKPIs({ fecha_desde, fecha_hasta, sucursal_id }) {
  const params = [];
  let whereSucursalVenta = '';
  let whereSucursalTurno = '';

  if (fecha_desde && fecha_hasta) {
    params.push(fecha_desde, fecha_hasta);
  } else {
    // Si no se especifica rango, toma los últimos 30 días por defecto
    params.push(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString());
  }

  if (sucursal_id && sucursal_id !== 'TODAS') {
    params.push(Number(sucursal_id));
    const paramIdx = params.length;
    whereSucursalVenta = ` AND COALESCE(term.sucursal_id, cf.sucursal_id) = $${paramIdx} `;
    whereSucursalTurno = ` AND cf_t.sucursal_id = $${paramIdx} `;
  }

  const queryKPIs = `
    WITH ventas_filtradas AS (
      SELECT 
        v.id,
        v.total,
        v.tipo_operacion
      FROM venta v
      JOIN terminal term ON v.terminal_id = term.id
      LEFT JOIN caja_fisica cf ON term.caja_fisica_id = cf.id
      WHERE v.fecha_hora BETWEEN $1 AND $2
        AND v.estado = 'COMPLETADA'
        ${whereSucursalVenta}
    ),
    ganancia_calculada AS (
      SELECT 
        COALESCE(SUM(dv.subtotal - (p.precio_costo * dv.cantidad)), 0) AS ganancia_bruta
      FROM detalle_venta dv
      JOIN producto p ON dv.producto_id = p.id
      JOIN ventas_filtradas vf ON dv.venta_id = vf.id
    ),
    arqueos_filtrados AS (
      SELECT 
        COALESCE(SUM(CASE WHEN tc.diferencia < 0 THEN tc.diferencia ELSE 0 END), 0) AS total_faltantes,
        COALESCE(SUM(CASE WHEN tc.diferencia > 0 THEN tc.diferencia ELSE 0 END), 0) AS total_sobrantes
      FROM turno_caja tc
      JOIN caja_fisica cf_t ON tc.caja_fisica_id = cf_t.id
      WHERE tc.fecha_apertura BETWEEN $1 AND $2
        AND tc.estado = 'CERRADO'
        ${whereSucursalTurno}
    ),
    deuda_empleados AS (
      SELECT COALESCE(SUM(monto), 0) AS total_deuda_fiados
      FROM cuenta_corriente_empleado
      WHERE fecha_hora BETWEEN $1 AND $2
    )
    SELECT 
      COALESCE(SUM(vf.total), 0) AS facturacion_total,
      COUNT(vf.id) AS cantidad_tickets,
      gc.ganancia_bruta,
      af.total_faltantes,
      af.total_sobrantes,
      de.total_deuda_fiados
    FROM ventas_filtradas vf
    CROSS JOIN ganancia_calculada gc
    CROSS JOIN arqueos_filtrados af
    CROSS JOIN deuda_empleados de
    GROUP BY gc.ganancia_bruta, af.total_faltantes, af.total_sobrantes, de.total_deuda_fiados;
  `;

  const { rows } = await pool.query(queryKPIs, params);
  return rows[0] || {
    facturacion_total: 0,
    cantidad_tickets: 0,
    ganancia_bruta: 0,
    total_faltantes: 0,
    total_sobrantes: 0,
    total_deuda_fiados: 0
  };
}

// 2. Ranking de Productos Más Vendidos
export async function obtenerTopProductos({ fecha_desde, fecha_hasta, limite = 10 }) {
  const query = `
    SELECT 
      p.id,
      p.descripcion,
      p.es_combo,
      COALESCE(c.nombre, 'Sin Categoría') AS categoria,
      COALESCE(c.unidad_medida, 'UNIDAD') AS unidad_medida,
      SUM(dv.cantidad) AS unidades_vendidas,
      SUM(dv.subtotal) AS total_recaudado,
      SUM(dv.subtotal - (p.precio_costo * dv.cantidad)) AS ganancia_neta
    FROM detalle_venta dv
    JOIN producto p ON dv.producto_id = p.id
    LEFT JOIN categoria c ON p.categoria_id = c.id
    JOIN venta v ON dv.venta_id = v.id
    WHERE v.fecha_hora BETWEEN $1 AND $2
      AND v.estado = 'COMPLETADA'
    GROUP BY p.id, p.descripcion, p.es_combo, c.nombre, c.unidad_medida
    ORDER BY unidades_vendidas DESC
    LIMIT $3;
  `;
  const { rows } = await pool.query(query, [fecha_desde, fecha_hasta, limite]);
  return rows;
}

// 3. Auditoría de Cajas y Rendimiento por Empleado
export async function obtenerAuditoriaEmpleados({ fecha_desde, fecha_hasta }) {
  const query = `
    SELECT 
      u.id AS empleado_id,
      u.nombre || ' ' || u.apellido AS nombre_completo,
      u.dni,
      COUNT(DISTINCT v.id) AS tickets_emitidos,
      COALESCE(SUM(v.total), 0) AS total_vendido,
      COALESCE(fiados.total_fiado, 0) AS total_consumo_personal,
      COALESCE(arqueo.balance_arqueos, 0) AS balance_arqueos,
      COALESCE(arqueo.total_faltante, 0) AS total_faltante
    FROM usuario u
    LEFT JOIN venta v ON v.usuario_id = u.id AND v.fecha_hora BETWEEN $1 AND $2 AND v.estado = 'COMPLETADA'
    LEFT JOIN (
      SELECT empleado_id, SUM(monto) AS total_fiado
      FROM cuenta_corriente_empleado
      WHERE fecha_hora BETWEEN $1 AND $2
      GROUP BY empleado_id
    ) fiados ON fiados.empleado_id = u.id
    LEFT JOIN (
      SELECT 
        v_sub.usuario_id,
        SUM(tc.diferencia) AS balance_arqueos,
        SUM(CASE WHEN tc.diferencia < 0 THEN tc.diferencia ELSE 0 END) AS total_faltante
      FROM turno_caja tc
      JOIN (SELECT DISTINCT turno_caja_id, usuario_id FROM venta) v_sub ON tc.id = v_sub.turno_caja_id
      WHERE tc.fecha_apertura BETWEEN $1 AND $2 AND tc.estado = 'CERRADO'
      GROUP BY v_sub.usuario_id
    ) arqueo ON arqueo.usuario_id = u.id
    WHERE u.activo = true
    GROUP BY u.id, u.nombre, u.apellido, u.dni, fiados.total_fiado, arqueo.balance_arqueos, arqueo.total_faltante
    ORDER BY total_vendido DESC;
  `;
  const { rows } = await pool.query(query, [fecha_desde, fecha_hasta]);
  return rows;
}

// 4. Desglose de Medios de Pago Utilizados
export async function obtenerDesgloseMediosPago({ fecha_desde, fecha_hasta }) {
  const query = `
    SELECT 
      pv.medio_pago,
      COUNT(pv.id) AS cantidad_operaciones,
      SUM(pv.monto_total) AS total_monto
    FROM pago_venta pv
    JOIN venta v ON pv.venta_id = v.id
    WHERE v.fecha_hora BETWEEN $1 AND $2
      AND v.estado = 'COMPLETADA'
    GROUP BY pv.medio_pago
    ORDER BY total_monto DESC;
  `;
  const { rows } = await pool.query(query, [fecha_desde, fecha_hasta]);
  return rows;
}