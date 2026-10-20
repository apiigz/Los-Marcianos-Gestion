import { Router } from 'express';
import * as c from './controlador.venta.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = new Router();

r.post('/',               requirePermiso('venta.crear'),      c.crearUno);
r.get('/',                requirePermiso('ventas.ver_todas'), c.obtenerVentas);
r.get('/turno/:turnoId',  requirePermiso('pos.acceder'),      c.obtenerPorTurno);
r.get('/:id/detalle',     requirePermiso('pos.acceder'),      c.obtenerDetalle);
r.post('/:id/reembolso',  requirePermiso('venta.reembolsar'), c.reembolsar);

export default r;