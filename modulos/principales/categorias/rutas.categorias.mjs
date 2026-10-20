import { Router } from "express";
import * as controlador from "./controlador.categorias.mjs";
import { requirePermiso } from "../../middlewares/auth.middleware.mjs";
const rutasCategorias = new Router();

rutasCategorias.get("/", requirePermiso("admin.acceder"), controlador.obtenerTodos);
rutasCategorias.get("/:id", requirePermiso("admin.acceder"), controlador.obtenerUno);
rutasCategorias.post("/", requirePermiso("categorias.gestionar"), controlador.crearUno);
rutasCategorias.put("/:id", requirePermiso("categorias.gestionar"), controlador.actualizarUno);
rutasCategorias.delete("/:id", requirePermiso("categorias.gestionar"), controlador.eliminarUno);

export default rutasCategorias;