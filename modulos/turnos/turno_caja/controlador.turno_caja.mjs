import * as modelo from './modelo.turno_caja.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';

function responderError(res, e, generico) {
  if (e instanceof ErrorHttp) {
    return res.status(e.status).json({ error: e.message, message: e.message, codigo: e.codigo });
  }
  console.error(generico, e);
  return res.status(500).json({ error: generico });
}

const aEntero = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const aMonto = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// GET /turno_caja
export const obtenerTurnos = async (req, res) => {
  try {
    res.json((await modelo.obtenerTodos()) || []);
  } catch (e) { responderError(res, e, 'Error al obtener los turnos'); }
};

// GET /turno_caja/:id
export const obtenerTurnoPorId = async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    if (!id) throw new ErrorHttp(400, 'ID de turno inválido.');
    const turno = await modelo.obtenerPorId(id);
    if (!turno) throw new ErrorHttp(404, 'Turno no encontrado');
    res.json(turno);
  } catch (e) { responderError(res, e, 'Error interno del servidor'); }
};

// GET /turno_caja/activo?terminal_id=X
export const obtenerTurnoActivo = async (req, res) => {
  try {
    const terminalId = aEntero(req.query.terminal_id);
    if (!terminalId) throw new ErrorHttp(400, 'El parámetro terminal_id es requerido.');
    res.json(await modelo.obtenerTurnoActivoPorTerminal(terminalId));
  } catch (e) { responderError(res, e, 'Error al consultar el turno activo'); }
};

// POST /turno_caja/abrir   { terminal_id, monto_inicial_efectivo }
export const abrirTurno = async (req, res) => {
  try {
    const terminalId = aEntero(req.body.terminal_id);
    const monto = aMonto(req.body.monto_inicial_efectivo);
    if (!terminalId) throw new ErrorHttp(400, 'terminal_id es obligatorio.');
    if (monto === null) throw new ErrorHttp(400, 'El monto inicial debe ser un número mayor o igual a 0.');

    const turno = await modelo.abrirTurno({ terminalId, usuarioId: req.user.id, montoInicial: monto });
    res.status(201).json(turno);
  } catch (e) { responderError(res, e, 'Error al abrir el turno'); }
};

// POST /turno_caja/:id/presencia   { terminal_id }   (check-in y latido)
export const registrarPresencia = async (req, res) => {
  try {
    const turnoId = aEntero(req.params.id);
    const terminalId = aEntero(req.body.terminal_id);
    if (!turnoId || !terminalId) throw new ErrorHttp(400, 'Faltan turno o terminal.');
    await modelo.registrarPresencia({ turnoId, usuarioId: req.user.id, terminalId });
    res.json({ ok: true });
  } catch (e) { responderError(res, e, 'Error al registrar la presencia'); }
};

// POST /turno_caja/salir
export const salir = async (req, res) => {
  try {
    await modelo.salirDelTurno(req.user.id);
    res.json({ ok: true });
  } catch (e) { responderError(res, e, 'Error al registrar la salida'); }
};

// PUT /turno_caja/:id/cierre   { tipo: 'RAPIDO' | 'DEFINITIVO', monto_real }
export const procesarCierreTurno = async (req, res) => {
  try {
    const turnoId = aEntero(req.params.id);
    if (!turnoId) throw new ErrorHttp(400, 'El ID del turno no es válido.');
    const { tipo, monto_real } = req.body;
    const user = req.user;

    // 1. Solo cierra quien participa del turno (el admin puede cerrar cualquiera)
    if (!user.es_admin && !(await modelo.usuarioEstaEnTurno(turnoId, user.id))) {
      throw new ErrorHttp(403, 'No participás de este turno.');
    }

    // 2. Regla del novato: solo cierra si no hay un cajero con permiso de cierre activo
    const puedeCerrarSiempre = user.es_admin || user.permisos.includes('turno.cerrar');
    if (!puedeCerrarSiempre) {
      if (!user.permisos.includes('turno.cerrar_si_esta_solo')) {
        throw new ErrorHttp(403, 'No tenés permiso para cerrar el turno.');
      }
      if (await modelo.hayCajeroConPermisoDeCierre(turnoId, user.id)) {
        throw new ErrorHttp(403,
          'Hay un cajero experimentado en el turno: debe cerrarlo él.', 'HAY_CAJERO_EXPERIMENTADO');
      }
    }

    // 3. Cierre
    let turno;
    if (tipo === 'RAPIDO') {
      turno = await modelo.cerrarTurnoRapido(turnoId, user.id);
    } else {
      const monto = aMonto(monto_real);
      if (monto === null) {
        throw new ErrorHttp(400, 'Debe ingresar el efectivo contado (número mayor o igual a 0).');
      }
      turno = await modelo.cerrarTurnoDefinitivo(turnoId, monto, user.id);
    }
    res.json(turno);
  } catch (e) { responderError(res, e, 'Error al cerrar el turno'); }
};

// PATCH /turno_caja/:id/cierre-rapido   (admin: "Forzar cierre")
export const cierreRapido = async (req, res) => {
  try {
    const turnoId = aEntero(req.params.id);
    if (!turnoId) throw new ErrorHttp(400, 'ID de turno inválido.');
    res.json(await modelo.cerrarTurnoRapido(turnoId, req.user.id));
  } catch (e) { responderError(res, e, 'Error al procesar el cierre rápido'); }
};

// PATCH /turno_caja/:id/arqueo   { monto_real_arqueo }   (admin)
export const declararArqueo = async (req, res) => {
  try {
    const turnoId = aEntero(req.params.id);
    const monto = aMonto(req.body.monto_real_arqueo);
    if (!turnoId) throw new ErrorHttp(400, 'ID de turno inválido.');
    if (monto === null) throw new ErrorHttp(400, 'Debe ingresar un monto_real_arqueo numérico válido.');

    const turno = await modelo.asentarArqueo(turnoId, monto);
    if (!turno) throw new ErrorHttp(404, 'Turno no encontrado para asentar arqueo');
    res.json(turno);
  } catch (e) { responderError(res, e, 'Error al registrar el arqueo del turno'); }
};