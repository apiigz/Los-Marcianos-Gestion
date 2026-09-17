import { Router } from 'express';
import * as controlador from './controlador.productos.mjs';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.mjs';

const rutasProducto = new Router();

// Middleware común: solo usuarios logueados con rol cajero o admin
rutasProducto.use(verifyToken, checkRole('CAJERO', 'ADMINISTRADOR'));

// Rutas de búsqueda para el POS:
rutasProducto.get('/buscar', controlador.buscarProductos);        // GET /api/productos/buscar?q=coca
rutasProducto.get('/codigo/:codigo', controlador.obtenerPorCodigo); // GET /api/productos/codigo/779123456

// Aquí siguen tus rutas CRUD previas:
rutasProducto.get("/:id", controlador.obtenerUno);

rutasProducto.get("/", controlador.obtenerTodos);
rutasProducto.post("/", controlador.crearUno);
rutasProducto.put("/:id", controlador.actualizarUno);
rutasProducto.delete("/:id", controlador.eliminarUno);
rutasProducto.patch('/:id/estado', controlador.cambiarEstado);
rutasProducto.put('/:id/estado', controlador.cambiarEstado);
rutasProducto.get('/:id/componentes', controlador.obtenerComponentes);
rutasProducto.post('/:id/componentes', controlador.guardarComponentes);

export default rutasProducto;