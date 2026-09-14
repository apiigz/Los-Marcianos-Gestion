import { Router } from "express";
import * as controlador from "./controlador.categorias.mjs";
const rutasCategorias = new Router();

rutasCategorias.get("/", controlador.obtenerTodos);
rutasCategorias.get("/:id", controlador.obtenerUno);
rutasCategorias.post("/", controlador.crearUno);
rutasCategorias.put("/:id", controlador.actualizarUno);
rutasCategorias.delete("/:id", controlador.eliminarUno);

export default rutasCategorias;