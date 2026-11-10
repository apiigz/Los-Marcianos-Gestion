import * as modelo from './modelo.cuenta.mjs';
import * as modeloConfig from '../../configuracion/modelo.configuracion.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { redondear } from '../../utils/dinero.mjs';

function responderError(res, e, generico) {
  if (e instanceof ErrorHttp) {
    return res.status(e.status).json({ error: e.message, message: e.message, codigo: e.codigo });
  }
  console.error(generico, e);
  return res.status(500).json({ error: generico });
}

const puede = (user, p) => user.es_admin || user.permisos.includes(p);
const aEntero = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export const resumen = async (req, res) => {
  try { res.json(await modelo.resumen()); }
  catch (e) { responderError(res, e, 'Error al obtener las cuentas'); }
};

export const obtener = async (req, res) => {
  try {
    const id = aEntero(req.params.clienteId);
    if (!id) throw new ErrorHttp(400, 'ID inválido.');
    const c = await modelo.obtenerCuenta(id);
    if (!c) throw new ErrorHttp(404, 'Cliente no encontrado.');
    res.json(c);
  } catch (e) { responderError(res, e, 'Error al obtener la cuenta'); }
};

// GET /opciones-cobro → medios habilitados y cuentas donde entran las transferencias
export const opcionesCobro = async (req, res) => {
  try {
    res.json({
      medios: await modeloConfig.obtenerMediosCobro(),
      cuentas: await modelo.opcionesCobro(),
      puede_verificar: puede(req.user, 'mayorista.verificar_transferencia')
    });
  } catch (e) { responderError(res, e, 'Error al obtener las opciones de cobro'); }
};

// POST /cuenta/:clienteId/pagos   { cobros: [{medio, monto, cuenta_cobro_id?, referencia?}] }
export const pagoACuenta = async (req, res) => {
  try {
    const clienteId = aEntero(req.params.clienteId);
    if (!clienteId) throw new ErrorHttp(400, 'ID inválido.');
    const r = await modelo.registrarPagoACuenta({
      clienteId, cobros: req.body.cobros, medios: await modeloConfig.obtenerMediosCobro(),
      usuarioId: req.user.id, puedeVerificar: puede(req.user, 'mayorista.verificar_transferencia')
    });
    res.status(201).json(r);
  } catch (e) { responderError(res, e, 'Error al registrar el pago'); }
};

// POST /pedidos/:id/cobros
export const cobrarPedido = async (req, res) => {
  try {
    const pedidoId = aEntero(req.params.id);
    if (!pedidoId) throw new ErrorHttp(400, 'ID inválido.');
    const r = await modelo.cobrarPedido({
      pedidoId, cobros: req.body.cobros, medios: await modeloConfig.obtenerMediosCobro(),
      usuarioId: req.user.id, puedeVerificar: puede(req.user, 'mayorista.verificar_transferencia')
    });
    res.status(201).json(r);
  } catch (e) { responderError(res, e, 'Error al registrar el cobro'); }
};

// POST /cuenta/:clienteId/ajustes   { monto, motivo }
export const ajustar = async (req, res) => {
  try {
    const clienteId = aEntero(req.params.clienteId);
    if (!clienteId) throw new ErrorHttp(400, 'ID inválido.');
    const monto = redondear(req.body.monto);
    if (!Number.isFinite(monto) || monto === 0) throw new ErrorHttp(400, 'El monto del ajuste debe ser distinto de cero.');
    const motivo = String(req.body.motivo ?? '').trim();
    if (motivo.length < 3 || motivo.length > 200) throw new ErrorHttp(400, 'Indicá el motivo (3 a 200 caracteres).');
    res.status(201).json(await modelo.ajustar({ clienteId, monto, motivo, usuarioId: req.user.id }));
  } catch (e) { responderError(res, e, 'Error al registrar el ajuste'); }
};

// POST /cuenta/:clienteId/reembolsos   { monto, medio, motivo }
export const solicitarReembolso = async (req, res) => {
  try {
    const clienteId = aEntero(req.params.clienteId);
    if (!clienteId) throw new ErrorHttp(400, 'ID inválido.');
    const monto = redondear(req.body.monto);
    if (!(monto > 0)) throw new ErrorHttp(400, 'El monto debe ser mayor a 0.');
    const medio = String(req.body.medio || '').toUpperCase();
    if (!['TRANSFERENCIA', 'EFECTIVO'].includes(medio)) throw new ErrorHttp(400, 'Medio de devolución inválido.');
    const motivo = String(req.body.motivo ?? '').trim();
    if (motivo.length < 3 || motivo.length > 200) throw new ErrorHttp(400, 'Indicá el motivo (3 a 200 caracteres).');
    res.status(201).json(await modelo.solicitarReembolso({ clienteId, monto, medio, motivo, usuarioId: req.user.id }));
  } catch (e) { responderError(res, e, 'Error al solicitar la devolución'); }
};

export const listarReembolsos = async (req, res) => {
  try { res.json(await modelo.listarReembolsos({ estado: req.query.estado })); }
  catch (e) { responderError(res, e, 'Error al listar las devoluciones'); }
};

// POST /cuenta/reembolsos/:id/pagar   { cuenta_cobro_id?, referencia? }
export const pagarReembolso = async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    if (!id) throw new ErrorHttp(400, 'ID inválido.');
    const referencia = String(req.body.referencia ?? '').trim();
    if (referencia.length > 100) throw new ErrorHttp(400, 'La referencia supera los 100 caracteres.');
    await modelo.pagarReembolso({
      id, cuentaCobroId: aEntero(req.body.cuenta_cobro_id), referencia: referencia || null, usuarioId: req.user.id
    });
    res.json({ ok: true });
  } catch (e) { responderError(res, e, 'Error al marcar la devolución como pagada'); }
};

// POST /cuenta/reembolsos/:id/cancelar   { motivo }
export const cancelarReembolso = async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    if (!id) throw new ErrorHttp(400, 'ID inválido.');
    const motivo = String(req.body.motivo ?? '').trim();
    if (motivo.length < 3 || motivo.length > 200) throw new ErrorHttp(400, 'Indicá el motivo (3 a 200 caracteres).');
    await modelo.cancelarReembolso({ id, motivo, usuarioId: req.user.id });
    res.json({ ok: true });
  } catch (e) { responderError(res, e, 'Error al cancelar la devolución'); }
};