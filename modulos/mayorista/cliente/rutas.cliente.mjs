import { Router } from 'express';
import * as c from './controlador.cliente.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = Router();

r.get('/',    requirePermiso('cliente.gestionar', 'mayorista.ver', 'mayorista.vender'), c.obtenerTodos);
r.get('/:id', requirePermiso('cliente.gestionar', 'mayorista.ver', 'mayorista.vender'), c.obtenerUno);

r.post('/',            requirePermiso('cliente.gestionar'), c.crearUno);
r.put('/:id',          requirePermiso('cliente.gestionar'), c.actualizarUno);
r.patch('/:id/estado', requirePermiso('cliente.gestionar'), c.cambiarEstado);

export default r;