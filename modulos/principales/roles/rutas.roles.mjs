import { Router } from "express";
import * as controlador from "./controlador.roles.mjs";
const rutasRoles = new Router();

rutasRoles.get("/", controlador.obtenerTodos);
rutasRoles.get("/:id", controlador.obtenerUno);
rutasRoles.post("/", controlador.crearUno);
rutasRoles.put("/:id", controlador.actualizarUno);
rutasRoles.delete("/:id", controlador.eliminarUno);

export default rutasRoles;