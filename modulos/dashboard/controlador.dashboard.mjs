import * as modelo from './modelo.dashboard.mjs';

export const obtenerResumenOperativo = async (req, res) => {
  try {
    const [alertasStock, estadoCajas, flashDiario] = await Promise.all([
      modelo.obtenerAlertasStock(),
      modelo.obtenerEstadoCajasTurnos(),
      modelo.obtenerFlashDiario()
    ]);

    res.status(200).json({
      alertasStock,
      estadoCajas,
      flashDiario
    });
  } catch (error) {
    console.error('Error al generar resumen del dashboard:', error);
    res.status(500).json({ error: 'Error al consultar datos del dashboard.' });
  }
};