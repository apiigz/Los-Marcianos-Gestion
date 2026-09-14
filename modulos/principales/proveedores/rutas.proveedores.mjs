import { Router } from "express";
import * as controlador from "./controlador.proveedores.mjs";
const rutasProveedores = new Router();

rutasProveedores.get("/", controlador.obtenerTodos);
rutasProveedores.get("/:id", controlador.obtenerUno);
rutasProveedores.post("/", controlador.crearUno);
rutasProveedores.put("/:id", controlador.actualizarUno);
rutasProveedores.delete("/:id", controlador.eliminarUno);
rutasProveedores.patch('/:id/estado', controlador.cambiarEstado)

export default rutasProveedores;