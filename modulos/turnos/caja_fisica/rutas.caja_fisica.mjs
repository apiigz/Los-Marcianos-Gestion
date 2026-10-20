import { Router } from "express";
import * as controlador from "./controlador.caja_fisica.mjs";
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const rutasCajaFisica = new Router();

//Rutas para caja_fisica
rutasCajaFisica.get("/", requirePermiso("pos.acceder"), controlador.obtenerTodos);
rutasCajaFisica.get("/:id", requirePermiso("pos.acceder"), controlador.obtenerUno);
rutasCajaFisica.post("/", requirePermiso("sucursales.gestionar"), controlador.crearUno);
rutasCajaFisica.put("/:id", requirePermiso("sucursales.gestionar"), controlador.actualizarUno);
rutasCajaFisica.delete("/:id", requirePermiso("sucursales.gestionar"), controlador.eliminarUno);

export default rutasCajaFisica;