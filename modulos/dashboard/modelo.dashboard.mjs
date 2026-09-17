import pool from '../bd/conexion.bd.mjs';

/**
 * 1. Alertas de Stock Crítico y Quiebre de Inventario
 * Tablas: stock_sucursal, producto, sucursal
 */
export async function obtenerAlertasStock() {
  const query = `
    SELECT 
      p.id AS producto_id,
      p.codigo_barra,
      p.descripcion,
      s.id AS sucursal_id,
      s.nombre AS sucursal_nombre,
      st.cantidad_disponible,
      st.stock_minimo,
      CASE 
        WHEN st.cantidad_disponible <= 0 THEN 'AGOTADO'
        WHEN st.cantidad_disponible <= st.stock_minimo THEN 'BAJO'
        ELSE 'NORMAL'
      END AS estado_alerta
    FROM stock_sucursal st
    JOIN producto p ON st.producto_id = p.id
    JOIN sucursal s ON st.sucursal_id = s.id
    WHERE p.activo = true 
      AND (st.cantidad_disponible <= st.stock_minimo OR st.cantidad_disponible <= 0)
    ORDER BY 
      CASE WHEN st.cantidad_disponible <= 0 THEN 1 ELSE 2 END,
      (st.cantidad_disponible - st.stock_minimo) ASC
    LIMIT 15;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

/**
 * 2. Estado de Cajas y Turnos en Vivo
 * Tablas: turno_caja, caja_fisica, sucursal, venta, usuario
 * - Resuelve el nombre del turno con tc.nombre_turno::text
 * - Resuelve el cajero mediante subquery a venta y usuario
 * - Sin columnas inexistentes (tc.fecha_apertura / tc.fecha_cierre)
 */
export async function obtenerEstadoCajasTurnos() {
  const query = `
    SELECT 
      tc.id AS turno_id,
      tc.nombre_turno::text AS franja_horaria,
      tc.estado::text AS estado,
      tc.fecha_apertura,
      tc.fecha_cierre,
      tc.diferencia,
      cf.nombre AS caja_nombre,
      s.nombre AS sucursal_nombre,
      -- Concatenación de cajeros asignados (Apertura + Segundo Cajero) 
      -- combinados con quienes hayan registrado ventas en el turno:
      COALESCE(
        (
          SELECT STRING_AGG(DISTINCT (u.nombre || ' ' || u.apellido), ' / ')
          FROM usuario u
          WHERE u.id IN (
            tc.usuario_apertura_id,
            tc.segundo_cajero_id,
            tc.usuario_cierre_id
          )
        ),
        (
          -- Fallback si es un turno previo a esta migración:
          SELECT STRING_AGG(DISTINCT (u.nombre || ' ' || u.apellido), ' / ')
          FROM venta v
          JOIN usuario u ON v.usuario_id = u.id
          WHERE v.turno_caja_id = tc.id
        ),
        'Sin cajeros asignados'
      ) AS cajero_nombre,
      -- Quién ejecutó el cierre si ya está cerrado/en arqueo:
      u_cierre.nombre || ' ' || u_cierre.apellido AS cerrado_por
    FROM turno_caja tc
    JOIN caja_fisica cf ON tc.caja_fisica_id = cf.id
    JOIN sucursal s ON cf.sucursal_id = s.id
    LEFT JOIN usuario u_cierre ON tc.usuario_cierre_id = u_cierre.id
    WHERE tc.estado::text IN ('ABIERTO', 'EN_CIERRE')
       OR (
         tc.estado::text = 'CERRADO' 
         AND tc.fecha_cierre >= NOW() - INTERVAL '24 hours' 
         AND tc.diferencia < 0
       )
    ORDER BY 
      CASE tc.estado::text 
        WHEN 'EN_CIERRE' THEN 1 
        WHEN 'ABIERTO' THEN 2 
        ELSE 3 
      END,
      tc.fecha_apertura DESC;
  `;
  const { rows } = await pool.query(query);
  return rows;
}

/**
 * 3. Métricas Flash del Día de Hoy
 * Tablas: venta, pago_venta, turno_caja
 * - Convierte medio_pago a text antes de agrupar o hacer COALESCE
 * - Usa v.fecha_hora y tc.fecha_apertura (columnas reales)
 */
export async function obtenerFlashDiario() {
  const query = `
    WITH ventas_hoy AS (
      SELECT 
        v.id,
        v.total
      FROM venta v
      WHERE v.fecha_hora >= CURRENT_DATE
        AND v.estado = 'COMPLETADA'
    ),
    medios_hoy AS (
      SELECT 
        pv.medio_pago::text AS medio_pago_txt,
        SUM(pv.monto_total) AS total_medio
      FROM pago_venta pv
      JOIN venta v ON pv.venta_id = v.id
      WHERE v.fecha_hora >= CURRENT_DATE 
        AND v.estado = 'COMPLETADA'
      GROUP BY pv.medio_pago::text
      ORDER BY total_medio DESC
      LIMIT 1
    ),
    turnos_resumen AS (
      SELECT 
        COUNT(CASE WHEN estado::text = 'ABIERTO' THEN 1 END) AS cajas_activas,
        COUNT(CASE WHEN estado::text = 'EN_CIERRE' THEN 1 END) AS pendientes_arqueo
      FROM turno_caja
      WHERE fecha_apertura >= CURRENT_DATE - INTERVAL '1 day'
    )
    SELECT 
      COALESCE(SUM(vh.total), 0) AS total_facturado_hoy,
      COUNT(vh.id) AS tickets_hoy,
      COALESCE((SELECT medio_pago_txt FROM medios_hoy), 'SIN VENTAS') AS medio_lider,
      COALESCE((SELECT total_medio FROM medios_hoy), 0) AS monto_medio_lider,
      tr.cajas_activas,
      tr.pendientes_arqueo
    FROM turnos_resumen tr
    LEFT JOIN ventas_hoy vh ON true
    GROUP BY tr.cajas_activas, tr.pendientes_arqueo;
  `;
  const { rows } = await pool.query(query);
  return rows[0] || {
    total_facturado_hoy: 0,
    tickets_hoy: 0,
    medio_lider: 'SIN VENTAS',
    monto_medio_lider: 0,
    cajas_activas: 0,
    pendientes_arqueo: 0
  };
}