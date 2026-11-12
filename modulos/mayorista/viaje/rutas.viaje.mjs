import { Router } from 'express';
import * as c from './controlador.viaje.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = Router();
const ver = ['mayorista.ver', 'mayorista.cargar_camioneta', 'mayorista.entregar', 'mayorista.rendir'];

// Rutas fijas antes de /:id
r.get('/opciones', requirePermiso(...ver), c.opciones);
r.get('/',         requirePermiso(...ver), c.listar);
r.post('/',        requirePermiso('mayorista.cargar_camioneta'), c.crear);

r.get('/:id',            requirePermiso(...ver), c.obtener);
r.post('/:id/salir',     requirePermiso('mayorista.cargar_camioneta'), c.salir);
r.post('/:id/regresar',  requirePermiso('mayorista.cargar_camioneta', 'mayorista.entregar'), c.regresar);
r.post('/:id/cancelar',  requirePermiso('mayorista.cargar_camioneta'), c.cancelar);
r.post('/:id/rendir',    requirePermiso('mayorista.rendir'), c.rendir);

export default r;