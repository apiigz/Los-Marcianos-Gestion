import { ErrorHttp } from '../../utils/errores.mjs';
import { redondear } from '../../utils/dinero.mjs';

// montos: cobros en efectivo del viaje que todavía no se rindieron
export function calcularRendicion(montos, contado, observaciones) {
  const c = Number(contado);
  if (contado === '' || contado === null || !Number.isFinite(c) || c < 0) {
    throw new ErrorHttp(400, 'El efectivo contado debe ser un número mayor o igual a 0.');
  }
  const esperado = redondear(montos.reduce((a, m) => a + Number(m), 0));
  const contadoR = redondear(c);
  const diferencia = redondear(contadoR - esperado);

  const obs = String(observaciones ?? '').trim();
  if (obs.length > 300) throw new ErrorHttp(400, 'Las observaciones superan los 300 caracteres.');
  if (Math.abs(diferencia) > 0.004 && obs.length < 3) {
    throw new ErrorHttp(400, 'Hay diferencia entre lo esperado y lo contado: explicá el motivo en observaciones.');
  }
  return { esperado, contado: contadoR, diferencia, observaciones: obs || null };
}