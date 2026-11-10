import { Router } from 'express';
import * as c from './controlador.pedido.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = Router();
const ver = ['mayorista.ver', 'mayorista.vender', 'mayorista.preparar'];

// Rutas fijas antes de /:id
r.get('/opciones', requirePermiso(...ver), c.obtenerOpciones);
r.get('/',         requirePermiso(...ver), c.listar);
r.post('/',        requirePermiso('mayorista.vender'), c.crear);

r.get('/:id',            requirePermiso(...ver), c.obtener);
r.put('/:id/items',      requirePermiso('mayorista.vender'), c.reemplazarItems);
r.post('/:id/preparar',  requirePermiso('mayorista.preparar'), c.preparar);
r.post('/:id/cancelar',  requirePermiso('mayorista.vender', 'mayorista.preparar'), c.cancelar);

export default r;