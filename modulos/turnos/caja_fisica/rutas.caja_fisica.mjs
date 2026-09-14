import { Router } from "express";
import * as controlador from "./controlador.caja_fisica.mjs";
const rutasCajaFisica = new Router();

//Rutas para caja_fisica
rutasCajaFisica.get("/", controlador.obtenerTodos);
rutasCajaFisica.get("/:id", controlador.obtenerUno);
rutasCajaFisica.post("/", controlador.crearUno);
rutasCajaFisica.put("/:id", controlador.actualizarUno);
rutasCajaFisica.delete("/:id", controlador.eliminarUno);

export default rutasCajaFisica;