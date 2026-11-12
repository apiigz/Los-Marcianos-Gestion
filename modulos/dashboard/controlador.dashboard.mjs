import * as modelo from './modelo.dashboard.mjs';

// Cada consulta es independiente: si una falla, las otras se siguen mostrando
// y el log dice exactamente cuál rompió y por qué.
export const obtenerResumenOperativo = async (req, res) => {
  const [alertas, cajas, flash] = await Promise.allSettled([
    modelo.obtenerAlertasStock(),
    modelo.obtenerEstadoCajasTurnos(),
    modelo.obtenerFlashDiario()
  ]);

  const valor = (r, nombre) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`Dashboard: falló "${nombre}":`, r.reason?.message || r.reason);
    return null;
  };

  res.status(200).json({
    alertasStock: valor(alertas, 'alertas de stock'),
    estadoCajas: valor(cajas, 'cajas y turnos'),
    flashDiario: valor(flash, 'resumen del día')
  });
};