import { Router } from "express";
import * as controlador from "./controlador.sucursales.mjs";
import { requirePermiso } from "../../middlewares/auth.middleware.mjs";

const rutasSucursales = new Router();

rutasSucursales.get("/", requirePermiso("admin.acceder"), controlador.obtenerTodos);
rutasSucursales.get("/:id", requirePermiso("admin.acceder"), controlador.obtenerUno);
rutasSucursales.post("/", requirePermiso("sucursales.gestionar"), controlador.crearUno);
rutasSucursales.put("/:id", requirePermiso("sucursales.gestionar"), controlador.actualizarUno);
rutasSucursales.delete("/:id", requirePermiso("sucursales.gestionar"), controlador.eliminarUno);

export default rutasSucursales;