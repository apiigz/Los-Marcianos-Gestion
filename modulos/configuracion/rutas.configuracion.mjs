import { Router } from 'express';
import * as c from './controlador.configuracion.mjs';
import { requirePermiso } from '../middlewares/auth.middleware.mjs';

const r = Router();

r.get('/pos',      requirePermiso('pos.acceder'),      c.obtenerParaPOS);
r.put('/recargos', requirePermiso('config.gestionar'), c.guardarRecargos);

export default r;