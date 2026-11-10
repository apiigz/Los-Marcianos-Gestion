import { Router } from 'express';
import * as c from './controlador.cuenta.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = Router();
const vista = ['mayorista.ver', 'mayorista.cobrar', 'mayorista.reembolsar', 'mayorista.pagar_reembolso'];

// Rutas fijas antes de /:clienteId
r.get('/opciones-cobro', requirePermiso(...vista, 'mayorista.entregar'), c.opcionesCobro);
r.get('/reembolsos',     requirePermiso(...vista), c.listarReembolsos);
r.post('/reembolsos/:id/pagar',    requirePermiso('mayorista.pagar_reembolso'), c.pagarReembolso);
r.post('/reembolsos/:id/cancelar', requirePermiso('mayorista.reembolsar'), c.cancelarReembolso);

r.get('/',           requirePermiso(...vista), c.resumen);
r.get('/:clienteId', requirePermiso(...vista), c.obtener);
r.post('/:clienteId/pagos',      requirePermiso('mayorista.cobrar'),    c.pagoACuenta);
r.post('/:clienteId/ajustes',    requirePermiso('mayorista.acreditar'), c.ajustar);
r.post('/:clienteId/reembolsos', requirePermiso('mayorista.reembolsar'), c.solicitarReembolso);

export default r;