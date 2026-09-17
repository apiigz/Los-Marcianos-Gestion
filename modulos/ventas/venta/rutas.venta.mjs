import { Router } from "express";
import * as controlador from "./controlador.venta.mjs";
const rutasVenta = new Router();
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.mjs';

rutasVenta.post('/', verifyToken, checkRole('ADMINISTRADOR', 'CAJERO'), controlador.crearUno);

//Rutas para ventas
rutasVenta.get("/", controlador.obtenerVentas);
rutasVenta.get("/:id", controlador.obtenerUno);
rutasVenta.post("/", verifyToken, controlador.crearUno);
rutasVenta.put("/:id", controlador.actualizarUno);
rutasVenta.delete("/:id", controlador.eliminarUno);
rutasVenta.post('/', controlador.crearUno);
rutasVenta.get('/turno/:turnoId', controlador.obtenerPorTurno);
rutasVenta.get('/:id/detalle', controlador.obtenerDetalle);
rutasVenta.post('/:id/reembolso', controlador.reembolsar);

export default rutasVenta;