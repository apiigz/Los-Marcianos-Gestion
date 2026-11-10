import * as modelo from './modelo.cliente.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { cuitValido, soloDigitos } from '../../utils/cuit.mjs';

const CONDICIONES = ['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL'];

function responderError(res, e, generico) {
  if (e instanceof ErrorHttp) {
    return res.status(e.status).json({ error: e.message, message: e.message, codigo: e.codigo });
  }
  console.error(generico, e);
  return res.status(500).json({ error: generico });
}

const texto = (v, max) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new ErrorHttp(400, `Un campo supera los ${max} caracteres.`);
  return s || null;
};

// Valida y normaliza el body (nunca se confía en lo que manda el front)
function validar(b) {
  const razon = texto(b.razon_social, 150);
  if (!razon) throw new ErrorHttp(400, 'La razón social es obligatoria.');

  const condicion = b.condicion_iva || 'CONSUMIDOR_FINAL';
  if (!CONDICIONES.includes(condicion)) throw new ErrorHttp(400, 'Condición de IVA inválida.');

  let cuit = soloDigitos(b.cuit) || null;
  if (cuit && !cuitValido(cuit)) throw new ErrorHttp(400, 'El CUIT no es válido (revisá el dígito verificador).');
  if (condicion !== 'CONSUMIDOR_FINAL' && !cuit) {
    throw new ErrorHttp(400, 'Para esa condición de IVA el CUIT es obligatorio.');
  }

  let limite = null;
  if (b.limite_credito !== null && b.limite_credito !== undefined && b.limite_credito !== '') {
    limite = Number(b.limite_credito);
    if (!Number.isFinite(limite) || limite < 0) throw new ErrorHttp(400, 'El límite de crédito debe ser un número mayor o igual a 0 (vacío = sin límite).');
  }

  return {
    razon_social: razon, cuit, condicion_iva: condicion,
    telefono: texto(b.telefono, 50), direccion: texto(b.direccion, 200),
    limite_credito: limite, observaciones: texto(b.observaciones, 500),
    activo: b.activo === undefined ? true : Boolean(b.activo)
  };
}

export const obtenerTodos = async (req, res) => {
  try { res.json(await modelo.obtenerTodos()); }
  catch (e) { responderError(res, e, 'Error al obtener los clientes'); }
};

export const obtenerUno = async (req, res) => {
  try {
    const c = await modelo.obtenerUno(Number(req.params.id));
    if (!c) throw new ErrorHttp(404, 'Cliente no encontrado.');
    res.json(c);
  } catch (e) { responderError(res, e, 'Error al obtener el cliente'); }
};

export const crearUno = async (req, res) => {
  try { res.status(201).json(await modelo.crearUno(validar(req.body))); }
  catch (e) { responderError(res, e, 'Error al crear el cliente'); }
};

export const actualizarUno = async (req, res) => {
  try {
    const c = await modelo.actualizarUno(Number(req.params.id), validar(req.body));
    if (!c) throw new ErrorHttp(404, 'Cliente no encontrado.');
    res.json(c);
  } catch (e) { responderError(res, e, 'Error al actualizar el cliente'); }
};

export const cambiarEstado = async (req, res) => {
  try {
    if (typeof req.body.activo !== 'boolean') throw new ErrorHttp(400, 'El campo "activo" debe ser true o false.');
    const c = await modelo.cambiarEstado(Number(req.params.id), req.body.activo);
    if (!c) throw new ErrorHttp(404, 'Cliente no encontrado.');
    res.json(c);
  } catch (e) { responderError(res, e, 'Error al cambiar el estado del cliente'); }
};