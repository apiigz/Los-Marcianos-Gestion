import { Router } from "express";
import * as controlador from "./controlador.roles.mjs";
import { requirePermiso } from "../../middlewares/auth.middleware.mjs";
const rutasRoles = new Router();

rutasRoles.get("/", requirePermiso("roles.gestionar"), controlador.obtenerTodos);

rutasRoles.get('/',                   requirePermiso('roles.gestionar', 'usuarios.gestionar'), controlador.obtenerTodos);
rutasRoles.get('/catalogo-permisos',  requirePermiso('roles.gestionar'), controlador.obtenerCatalogo);
rutasRoles.get('/:id',                requirePermiso('roles.gestionar'), controlador.obtenerUno);
rutasRoles.get('/:id/permisos',       requirePermiso('roles.gestionar'), controlador.obtenerPermisos);
rutasRoles.put('/:id/permisos',       requirePermiso('roles.gestionar'), controlador.guardarPermisos);
rutasRoles.post('/',                  requirePermiso('roles.gestionar'), controlador.crearUno);
rutasRoles.put('/:id',                requirePermiso('roles.gestionar'), controlador.actualizarUno);
rutasRoles.delete('/:id',             requirePermiso('roles.gestionar'), controlador.eliminarUno);

rutasRoles.get("/:id", requirePermiso("roles.gestionar"), controlador.obtenerUno);
rutasRoles.post("/", requirePermiso("roles.gestionar"), controlador.crearUno);
rutasRoles.put("/:id", requirePermiso("roles.gestionar"), controlador.actualizarUno);
rutasRoles.delete("/:id", requirePermiso("roles.gestionar"), controlador.eliminarUno);

export default rutasRoles;