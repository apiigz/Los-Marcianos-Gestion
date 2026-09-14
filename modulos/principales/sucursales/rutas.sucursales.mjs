import { Router } from "express";
import * as controlador from "./controlador.sucursales.mjs";
const rutasSucursales = new Router();

rutasSucursales.get("/", controlador.obtenerTodos);
rutasSucursales.get("/:id", controlador.obtenerUno);
rutasSucursales.post("/", controlador.crearUno);
rutasSucursales.put("/:id", controlador.actualizarUno);
rutasSucursales.delete("/:id", controlador.eliminarUno);

export default rutasSucursales;