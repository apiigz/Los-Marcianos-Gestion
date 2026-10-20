import { Router } from "express";
import * as controlador from "./controlador.proveedores.mjs";
import { requirePermiso } from "../../middlewares/auth.middleware.mjs";

const rutasProveedores = new Router();

rutasProveedores.get("/", requirePermiso("admin.acceder"),controlador.obtenerTodos);
rutasProveedores.get("/:id", requirePermiso("admin.acceder"), controlador.obtenerUno);
rutasProveedores.post("/", requirePermiso("proveedores.gestionar"), controlador.crearUno);
rutasProveedores.put("/:id", requirePermiso("proveedores.gestionar"), controlador.actualizarUno);
rutasProveedores.delete("/:id", requirePermiso("proveedores.gestionar"), controlador.eliminarUno);
rutasProveedores.patch('/:id/estado', requirePermiso("proveedores.gestionar"), controlador.cambiarEstado)

export default rutasProveedores;