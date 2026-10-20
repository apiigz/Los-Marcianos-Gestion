import { Router } from 'express';
import * as c from './controlador.turno_caja.mjs';
import { requirePermiso } from '../../middlewares/auth.middleware.mjs';

const r = Router();

// --- Rutas fijas primero (antes que /:id) ---
r.post('/abrir',  requirePermiso('turno.abrir'),   c.abrirTurno);
r.get('/activo',  requirePermiso('pos.acceder'),   c.obtenerTurnoActivo);
r.post('/salir',  requirePermiso('pos.acceder'),   c.salir);

// --- Administración ---
r.get('/',        requirePermiso('turno.ver_todos'), c.obtenerTurnos);
r.get('/:id',     requirePermiso('turno.ver_todos'), c.obtenerTurnoPorId);

// --- Operación del POS ---
r.post('/:id/presencia', requirePermiso('pos.acceder'), c.registrarPresencia);
r.put('/:id/cierre',     requirePermiso('turno.cerrar', 'turno.cerrar_si_esta_solo'), c.procesarCierreTurno);

// --- Auditoría ---
r.patch('/:id/cierre-rapido', requirePermiso('turno.auditar'), c.cierreRapido);
r.patch('/:id/arqueo',        requirePermiso('turno.auditar'), c.declararArqueo);

export default r;