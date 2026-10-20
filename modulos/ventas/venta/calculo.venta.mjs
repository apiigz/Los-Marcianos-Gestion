import { ErrorHttp } from '../../utils/errores.mjs';

export const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function normalizarMedio(p) {
  const m = String(p.medio_pago || p.forma_pago || '').toUpperCase();
  if (m.includes('DEBITO') || m.includes('DÉBITO')) return 'DEBITO';
  if (m.includes('CREDITO') || m.includes('CRÉDITO')) return 'CREDITO';
  if (m.includes('QR') || m.includes('TRANSF')) return 'QR';
  return 'EFECTIVO';
}

/**
 * subtotal: suma de renglones (> 0)
 * pagos:    [{ medio_pago|forma_pago, monto, recargo_porcentaje? }]  (monto = base, sin recargo)
 * cfg:      { debito, credito, maximo }
 * puede:    (permiso) => boolean
 * Devuelve { pagosFinal, total }. El efectivo queda NETO de vuelto.
 */
export function calcularPagos({ subtotal, pagos, cfg, userId, puede }) {
  const base = { EFECTIVO: 0, DEBITO: 0, CREDITO: 0, QR: 0 };
  const pct = { DEBITO: cfg.debito, CREDITO: cfg.credito };
  const modificado = { DEBITO: false, CREDITO: false };

  for (const p of pagos) {
    const medio = normalizarMedio(p);
    const monto = Number(p.monto);
    if (!Number.isFinite(monto) || monto < 0) throw new ErrorHttp(400, 'Monto de pago inválido.');
    base[medio] += monto;

    if ((medio === 'DEBITO' || medio === 'CREDITO') && p.recargo_porcentaje != null) {
      const v = Number(p.recargo_porcentaje);
      if (!Number.isFinite(v) || v < 0) throw new ErrorHttp(400, 'Porcentaje de recargo inválido.');
      const porDefecto = medio === 'DEBITO' ? cfg.debito : cfg.credito;
      if (Math.abs(v - porDefecto) > 0.0001) {
        if (!puede('venta.cambiar_recargo')) {
          throw new ErrorHttp(403, 'No tenés permiso para modificar el recargo.');
        }
        if (v > cfg.maximo) {
          throw new ErrorHttp(400, `El recargo máximo permitido es ${cfg.maximo}%.`);
        }
        pct[medio] = v;
        modificado[medio] = true;
      }
    }
  }

  const recDeb  = redondear(base.DEBITO  * pct.DEBITO  / 100);
  const recCred = redondear(base.CREDITO * pct.CREDITO / 100);
  const total   = redondear(subtotal + recDeb + recCred);
  const cobrado = redondear(base.EFECTIVO + base.DEBITO + recDeb + base.CREDITO + recCred + base.QR);

  if (cobrado < total - 0.005) throw new ErrorHttp(400, 'El pago no cubre el total.');

  const exceso = redondear(cobrado - total);
  if (exceso > 0.005) {
    if (exceso > base.EFECTIVO + 0.005) {
      throw new ErrorHttp(400, 'El importe con tarjeta o QR no puede superar el total de la venta.');
    }
    base.EFECTIVO = redondear(base.EFECTIVO - exceso);   // efectivo neto de vuelto
  }

  const pagosFinal = [
    { medio_pago: 'EFECTIVO', monto: base.EFECTIVO, recargo: 0, recargo_porcentaje: 0 },
    { medio_pago: 'DEBITO',   monto: base.DEBITO,   recargo: recDeb,  recargo_porcentaje: pct.DEBITO,
      modificado_por: modificado.DEBITO ? userId : null },
    { medio_pago: 'CREDITO',  monto: base.CREDITO,  recargo: recCred, recargo_porcentaje: pct.CREDITO,
      modificado_por: modificado.CREDITO ? userId : null },
    { medio_pago: 'QR',       monto: base.QR,       recargo: 0, recargo_porcentaje: 0 }
  ].filter(p => p.monto > 0);

  return { pagosFinal, total };
}