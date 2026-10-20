import { Router } from "express";
import * as controlador from "./controlador.terminal.mjs";
import { requirePermiso } from "../../middlewares/auth.middleware.mjs";

const rutasTerminal = new Router();

rutasTerminal.get("/",    requirePermiso("pos.acceder", "sucursales.gestionar"), controlador.obtenerTodos);
rutasTerminal.get("/:id", requirePermiso("pos.acceder", "sucursales.gestionar"), controlador.obtenerUno);
rutasTerminal.post("/",       requirePermiso("sucursales.gestionar"), controlador.crearUno);
rutasTerminal.put("/:id",     requirePermiso("sucursales.gestionar"), controlador.actualizarUno);
rutasTerminal.delete("/:id",  requirePermiso("sucursales.gestionar"), controlador.eliminarUno);

export default rutasTerminal;