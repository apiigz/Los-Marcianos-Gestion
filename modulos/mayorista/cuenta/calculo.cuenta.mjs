import { ErrorHttp } from '../../utils/errores.mjs';
import { redondear } from '../../utils/dinero.mjs';

// Valida y normaliza los cobros que manda el front.
// tope: lo que falta cobrar de un pedido (null = pago suelto, sin tope)
export function normalizarCobros(cobros, { medios, tope = null }) {
  if (!Array.isArray(cobros)) throw new ErrorHttp(400, 'Formato de cobros inválido.');

  const normalizados = cobros.map((c) => {
    const medio = String(c.medio || '').toUpperCase();
    if (!medios.includes(medio)) throw new ErrorHttp(400, `Medio de cobro no habilitado: ${medio || '(vacío)'}.`);

    const monto = redondear(c.monto);
    if (!(monto > 0)) throw new ErrorHttp(400, 'El monto de cada cobro debe ser mayor a 0.');

    let cuenta = null;
    if (medio === 'TRANSFERENCIA') {
      cuenta = Number(c.cuenta_cobro_id);
      if (!Number.isInteger(cuenta) || cuenta <= 0) {
        throw new ErrorHttp(400, 'Indicá a qué cuenta entró la transferencia.');
      }
    }

    const referencia = String(c.referencia ?? '').trim();
    if (referencia.length > 100) throw new ErrorHttp(400, 'La referencia supera los 100 caracteres.');

    return { medio, monto, cuenta_cobro_id: cuenta, referencia: referencia || null };
  });

  const total = redondear(normalizados.reduce((a, c) => a + c.monto, 0));
  if (tope !== null && total > redondear(tope) + 0.004) {
    throw new ErrorHttp(400,
      `Los cobros ($ ${total}) superan lo que falta cobrar del pedido ($ ${redondear(tope)}). El excedente se registra como pago a cuenta.`);
  }
  return { cobros: normalizados, total };
}