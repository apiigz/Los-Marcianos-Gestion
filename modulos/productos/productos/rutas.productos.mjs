import { Router } from 'express';
import * as c from './controlador.productos.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = new Router();

// --- Búsquedas del POS (rutas fijas ANTES de /:id) ---
r.get('/buscar',          requirePermiso('pos.acceder', 'productos.ver'), c.buscarProductos);
r.get('/codigo/:codigo',  requirePermiso('pos.acceder', 'productos.ver'), c.obtenerPorCodigo);

// --- Catálogo (admin) ---
r.get('/',                requirePermiso('productos.ver'),    c.obtenerTodos);
r.get('/:id',             requirePermiso('productos.ver'),    c.obtenerUno);
r.get('/:id/componentes', requirePermiso('productos.ver'),    c.obtenerComponentes);

r.post('/',                requirePermiso('productos.editar'), c.crearUno);
r.put('/:id',              requirePermiso('productos.editar'), c.actualizarUno);
r.delete('/:id',           requirePermiso('productos.editar'), c.eliminarUno);
r.patch('/:id/estado',     requirePermiso('productos.editar'), c.cambiarEstado);
r.put('/:id/estado',       requirePermiso('productos.editar'), c.cambiarEstado);
r.post('/:id/componentes', requirePermiso('productos.editar'), c.guardarComponentes);

export default r;