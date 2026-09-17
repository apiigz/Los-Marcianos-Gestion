import { Router } from 'express';
import * as controlador from './controlador.estadisticas.mjs';

const rutasEstadisticas = Router();

// Panel general protegido (exclusivo para usuarios autenticados con rol administrativo)
rutasEstadisticas.get('/dashboard', controlador.obtenerDashboardConsolidado);

export default rutasEstadisticas;