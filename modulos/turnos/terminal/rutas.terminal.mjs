import { Router } from "express";
import * as controlador from "./controlador.terminal.mjs";
const rutasTerminal = new Router();

//Rutas para terminal
rutasTerminal.get("/", controlador.obtenerTodos);
rutasTerminal.get("/:id", controlador.obtenerUno);
rutasTerminal.post("/", controlador.crearUno);
rutasTerminal.put("/:id", controlador.actualizarUno);
rutasTerminal.delete("/:id", controlador.eliminarUno);

export default rutasTerminal;