import { Router } from 'express';
import { obtenerResumenOperativo } from './controlador.dashboard.mjs';

const rutasDashboard = Router();

rutasDashboard.get('/resumen', obtenerResumenOperativo);

export default rutasDashboard;