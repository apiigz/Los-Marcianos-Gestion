import { Router } from 'express';
import * as controlador from './controlador.turno_caja.mjs';
import {verifyToken} from '../../middlewares/auth.middleware.mjs'
// Middlewares de autenticación si o si acá

const rutasTurnos = Router();

//Abrir turno
rutasTurnos.post('/abrir', verifyToken, controlador.abrirTurno);

//Verificar turno activo
rutasTurnos.get('/activo', verifyToken, controlador.obtenerTurnoActivo);

//Cierre de turno
rutasTurnos.put('/:id/cierre', verifyToken, controlador.procesarCierreTurno);

// Listado general (consumido por turnos.js)
rutasTurnos.get('/', controlador.obtenerTurnos);

// Detalle de un turno
rutasTurnos.get('/:id', controlador.obtenerTurnoPorId);

//Cierre tradicional de turno
rutasTurnos.put('/:id/cierre', controlador.cerrarTurno)

// Cierre rápido desde terminal de ventas (pasa a EN_CIERRE)
rutasTurnos.patch('/:id/cierre-rapido', controlador.cierreRapido);

// Asentar arqueo auditado desde el panel admin (pasa a CERRADO)
rutasTurnos.patch('/:id/arqueo', controlador.declararArqueo);



export default rutasTurnos;