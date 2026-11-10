import { Router } from 'express';
import * as c from './controlador.pedido.mjs';
import * as cuenta from '../cuenta/controlador.cuenta.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = Router();
const ver = ['mayorista.ver', 'mayorista.vender', 'mayorista.preparar', 'mayorista.cargar_camioneta', 'mayorista.entregar', 'mayorista.cobrar'];

// Rutas fijas antes de /:id
r.get('/opciones', requirePermiso(...ver), c.obtenerOpciones);
r.get('/',         requirePermiso(...ver), c.listar);
r.post('/',        requirePermiso('mayorista.vender'), c.crear);
r.post('/pendientes/:id/acreditar', requirePermiso('mayorista.acreditar'), c.acreditarPendiente);

r.get('/:id',            requirePermiso(...ver), c.obtener);
r.put('/:id/items',      requirePermiso('mayorista.vender'), c.reemplazarItems);
r.post('/:id/preparar',  requirePermiso('mayorista.preparar'), c.preparar);
r.post('/:id/cancelar',  requirePermiso('mayorista.vender', 'mayorista.preparar'), c.cancelar);
r.post('/:id/cargar-camioneta', requirePermiso('mayorista.cargar_camioneta'), c.cargarCamioneta);
r.post('/:id/no-entregado',     requirePermiso('mayorista.entregar', 'mayorista.cargar_camioneta'), c.noEntregado);
r.post('/:id/entregar',         requirePermiso('mayorista.entregar'), c.entregar);
r.post('/:id/cobros',           requirePermiso('mayorista.entregar', 'mayorista.cobrar'), cuenta.cobrarPedido);

export default r;