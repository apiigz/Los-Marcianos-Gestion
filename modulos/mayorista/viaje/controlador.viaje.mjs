import * as modelo from './modelo.viaje.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';

function responderError(res, e, generico) {
  if (e instanceof ErrorHttp) {
    return res.status(e.status).json({ error: e.message, message: e.message, codigo: e.codigo });
  }
  console.error(generico, e);
  return res.status(500).json({ error: generico });
}

const aEntero = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const idDe = (req) => {
  const id = aEntero(req.params.id);
  if (!id) throw new ErrorHttp(400, 'ID inválido.');
  return id;
};

export const opciones = async (req, res) => {
  try { res.json(await modelo.opciones()); }
  catch (e) { responderError(res, e, 'Error al obtener las opciones'); }
};

export const listar = async (req, res) => {
  try { res.json(await modelo.listar({ estado: req.query.estado })); }
  catch (e) { responderError(res, e, 'Error al listar los viajes'); }
};

export const obtener = async (req, res) => {
  try {
    const v = await modelo.obtener(idDe(req));
    if (!v) throw new ErrorHttp(404, 'Viaje no encontrado.');
    res.json(v);
  } catch (e) { responderError(res, e, 'Error al obtener el viaje'); }
};

// POST /viajes   { vehiculo_id, encargado_id, observaciones? }
export const crear = async (req, res) => {
  try {
    const vehiculoId = aEntero(req.body.vehiculo_id);
    const encargadoId = aEntero(req.body.encargado_id);
    if (!vehiculoId) throw new ErrorHttp(400, 'Elegí el vehículo.');
    if (!encargadoId) throw new ErrorHttp(400, 'Elegí el encargado del viaje.');
    const obs = String(req.body.observaciones ?? '').trim();
    if (obs.length > 300) throw new ErrorHttp(400, 'Las observaciones superan los 300 caracteres.');

    const id = await modelo.crear({ vehiculoId, encargadoId, observaciones: obs || null, usuarioId: req.user.id });
    res.status(201).json(await modelo.obtener(id));
  } catch (e) { responderError(res, e, 'Error al crear el viaje'); }
};

const accion = (fn, generico) => async (req, res) => {
  try {
    const id = idDe(req);
    await fn(id);
    res.json(await modelo.obtener(id));
  } catch (e) { responderError(res, e, generico); }
};

export const salir = accion((id) => modelo.salir(id), 'Error al registrar la salida');
export const regresar = accion((id) => modelo.regresar(id), 'Error al registrar el regreso');
export const cancelar = accion((id) => modelo.cancelar(id), 'Error al cancelar el viaje');

// POST /viajes/:id/rendir   { efectivo_contado, observaciones? }
export const rendir = async (req, res) => {
  try {
    const id = idDe(req);
    const r = await modelo.rendir({
      id, contado: req.body.efectivo_contado, observaciones: req.body.observaciones, usuarioId: req.user.id
    });
    res.status(201).json(r);
  } catch (e) { responderError(res, e, 'Error al registrar la rendición'); }
};