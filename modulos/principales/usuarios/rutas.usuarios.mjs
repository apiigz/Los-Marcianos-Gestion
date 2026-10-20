import { Router } from "express";
import * as controlador from "./controlador.usuarios.mjs";
import { requirePermiso } from "../../middlewares/auth.middleware.mjs";

const rutasUsuarios = new Router();

// Ruta fija ANTES de /:id
rutasUsuarios.get("/operadores", requirePermiso("venta.fiado", "ventas.ver_todas"), controlador.obtenerOperadores);

rutasUsuarios.get("/",          requirePermiso("usuarios.gestionar"), controlador.obtenerTodos);
rutasUsuarios.get("/:id",       requirePermiso("usuarios.gestionar"), controlador.obtenerUno);
rutasUsuarios.post("/",         requirePermiso("usuarios.gestionar"), controlador.crearUno);
rutasUsuarios.put("/:id",       requirePermiso("usuarios.gestionar"), controlador.actualizarUno);
rutasUsuarios.delete("/:id",    requirePermiso("usuarios.gestionar"), controlador.eliminarUno);
rutasUsuarios.patch("/:id/estado", requirePermiso("usuarios.gestionar"), controlador.cambiarEstado);

export default rutasUsuarios;