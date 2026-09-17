import * as modelo from './modelo.estadisticas.mjs';

function normalizarFechas(query) {
  let { fecha_desde, fecha_hasta } = query;
  if (!fecha_desde || !fecha_hasta) {
    const ahora = new Date();
    const haceSieteDias = new Date();
    haceSieteDias.setDate(ahora.getDate() - 7);
    fecha_desde = haceSieteDias.toISOString().split('T')[0] + ' 00:00:00';
    fecha_hasta = ahora.toISOString().split('T')[0] + ' 23:59:59';
  } else {
    fecha_desde = `${fecha_desde} 00:00:00`;
    fecha_hasta = `${fecha_hasta} 23:59:59`;
  }
  return { fecha_desde, fecha_hasta };
}

export const obtenerDashboardConsolidado = async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = normalizarFechas(req.query);
    const { sucursal_id } = req.query;

    const [kpis, topProductos, empleados, mediosPago] = await Promise.all([
      modelo.obtenerResumenKPIs({ fecha_desde, fecha_hasta, sucursal_id }),
      modelo.obtenerTopProductos({ fecha_desde, fecha_hasta, limite: 8 }),
      modelo.obtenerAuditoriaEmpleados({ fecha_desde, fecha_hasta }),
      modelo.obtenerDesgloseMediosPago({ fecha_desde, fecha_hasta })
    ]);

    res.status(200).json({
      periodo: { fecha_desde, fecha_hasta },
      kpis,
      topProductos,
      empleados,
      mediosPago
    });
  } catch (error) {
    console.error('Error al generar estadísticas:', error);
    res.status(500).json({ error: error.message || 'Error interno al consultar estadísticas.' });
  }
};