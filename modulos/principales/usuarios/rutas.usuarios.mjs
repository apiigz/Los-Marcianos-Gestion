import { Router } from "express";
import * as controlador from "./controlador.usuarios.mjs";
const rutasUsuarios = new Router();

rutasUsuarios.get("/", controlador.obtenerTodos);
rutasUsuarios.get("/:id", controlador.obtenerUno);
rutasUsuarios.post("/", controlador.crearUno);
rutasUsuarios.put("/:id", controlador.actualizarUno);
rutasUsuarios.delete("/:id", controlador.eliminarUno);
rutasUsuarios.patch("/:id/estado", controlador.cambiarEstado);

export default rutasUsuarios;