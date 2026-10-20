import { Router } from 'express';
import * as controlador from './controlador.estadisticas.mjs';
import { requirePermiso } from "../middlewares/auth.middleware.mjs";

const rutasEstadisticas = Router();

// Panel general protegido (exclusivo para usuarios autenticados con rol administrativo)
rutasEstadisticas.get('/dashboard', requirePermiso("admin.acceder"), controlador.obtenerDashboardConsolidado);

export default rutasEstadisticas;