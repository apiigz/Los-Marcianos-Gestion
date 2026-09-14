import * as modelo from './modelo.turno_caja.mjs';

// GET /api/v1/turnos
export const obtenerTurnos = async (req, res) => {
  try {
    const turnos = await modelo.obtenerTodos();
    return res.status(200).json(turnos || []);
  } catch (error) {
    console.error('Error al listar turnos:', error);
    return res.status(500).json({ error: 'Error al obtener los turnos' });
  }
};

// GET /api/v1/turnos/:id
export const obtenerTurnoPorId = async (req, res) => {
  const { id } = req.params;
  try {
    const turno = await modelo.obtenerPorId(Number(id));
    if (!turno) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }
    return res.status(200).json(turno);
  } catch (error) {
    console.error('Error al obtener turno por ID:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/v1/turnos (Apertura)
export const abrirTurnoo = async (req, res) => {
  const { caja_fisica_id, nombre_turno, monto_inicial_efectivo } = req.body;

  try {
    if (!caja_fisica_id || !nombre_turno || monto_inicial_efectivo === undefined) {
      return res.status(400).json({ 
        error: 'caja_fisica_id, nombre_turno y monto_inicial_efectivo son obligatorios' 
      });
    }

    // Regla de negocio: No permitir abrir un turno si la caja ya tiene uno ABIERTO o EN_CIERRE
    const turnoExistente = await modelo.obtenerTurnoAbiertoPorCaja(Number(caja_fisica_id));
    if (turnoExistente) {
      return res.status(409).json({ 
        error: `La caja ya posee el turno #${turnoExistente.id} en estado ${turnoExistente.estado}. Debe cerrarse antes de abrir uno nuevo.` 
      });
    }

    const nuevoTurno = await modelo.abrirTurno({
      caja_fisica_id: Number(caja_fisica_id),
      nombre_turno: String(nombre_turno).trim(),
      monto_inicial_efectivo: parseFloat(monto_inicial_efectivo) || 0
    });

    return res.status(201).json(nuevoTurno);
  } catch (error) {
    console.error('Error al abrir turno:', error);
    return res.status(500).json({ error: error.message || 'Error al abrir el turno' });
  }
};

//PUT /api/v1/turnos/:id/cierre
export async function cerrarTurno(req, res) {
  const { id } = req.params;
  const { monto_real, observaciones } = req.body;

  // 1. Validar ID de turno
  const turnoId = parseInt(id, 10);
  if (isNaN(turnoId) || turnoId <= 0) {
    return res.status(400).json({ error: 'El ID del turno proporcionado no es válido.' });
  }

  // 2. Validar monto_real ingresado por el cajero
  if (monto_real === undefined || monto_real === null || monto_real === '') {
    return res.status(400).json({ error: 'Debe ingresar el monto real de efectivo contado en caja.' });
  }

  const montoRealNum = parseFloat(monto_real);
  if (isNaN(montoRealNum) || montoRealNum < 0) {
    return res.status(400).json({ error: 'El monto real de efectivo debe ser un número mayor o igual a 0.' });
  }

  try {
    // 3. Ejecutar el arqueo y cierre en el modelo
    const turnoCerrado = await modelo.cerrarTurno({
      turno_id: turnoId,
      monto_real: montoRealNum,
      observaciones: observaciones ? String(observaciones).trim() : null
    });

    if (!turnoCerrado) {
      return res.status(404).json({ error: `No se encontró el turno con ID ${turnoId}.` });
    }

    return res.status(200).json({
      mensaje: 'Turno cerrado y arqueo de caja registrado exitosamente.',
      turno: turnoCerrado
    });

  } catch (error) {
    console.error(`Error al cerrar el turno #${turnoId}:`, error);

    if (error.message.includes('Turno no encontrado')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ 
      error: error.message || 'Ocurrió un error interno al intentar procesar el arqueo del turno.' 
    });
  }
}

// PATCH /api/v1/turnos/:id/cierre-rapido (Pasa a EN_CIERRE)
export const cierreRapido = async (req, res) => {
  const { id } = req.params;
  const { monto_esperado_sistema } = req.body;

  try {
    const turnoActualizado = await modelo.registrarCierreRapido(
      Number(id),
      monto_esperado_sistema ? parseFloat(monto_esperado_sistema) : null
    );

    if (!turnoActualizado) {
      return res.status(400).json({ 
        error: 'El turno no existe o no se encuentra en estado ABIERTO para efectuar un cierre rápido' 
      });
    }

    return res.status(200).json(turnoActualizado);
  } catch (error) {
    console.error('Error en cierre rápido:', error);
    return res.status(500).json({ error: 'Error al procesar el cierre rápido' });
  }
};

// PATCH /api/v1/turnos/:id/arqueo (Utilizado por turnos.js en el panel admin)
export const declararArqueo = async (req, res) => {
  const { id } = req.params;
  const { monto_real_arqueo, diferencia, estado } = req.body;

  try {
    if (monto_real_arqueo === undefined || isNaN(parseFloat(monto_real_arqueo))) {
      return res.status(400).json({ error: 'Debe ingresar un monto_real_arqueo numérico válido' });
    }

    const turnoActualizado = await modelo.asentarArqueo(Number(id), {
      monto_real_arqueo: parseFloat(monto_real_arqueo),
      diferencia: parseFloat(diferencia),
      estado: estado || 'CERRADO'
    });

    if (!turnoActualizado) {
      return res.status(404).json({ error: 'Turno no encontrado para asentar arqueo' });
    }

    return res.status(200).json(turnoActualizado);
  } catch (error) {
    console.error('Error al declarar arqueo:', error);
    return res.status(500).json({ error: error.message || 'Error al registrar arqueo del turno' });
  }
};

//Controlador de las últimas funciones que agregue de emergencia en modelo.turno_caja.mjs

// GET /api/v1/turno_caja/activo?caja_fisica_id=X
export async function obtenerTurnoActivo(req, res) {
  try {
    const cajaFisicaId = req.query.caja_fisica_id || req.query.caja_id;

    if (!cajaFisicaId) {
      return res.status(400).json({ error: 'El parámetro caja_fisica_id es requerido.' });
    }

    const turno = await modelo.obtenerTurnoActivoPorCaja(Number(cajaFisicaId));
    return res.status(200).json(turno);
  } catch (error) {
    console.error('Error en obtenerTurnoActivo:', error);
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/v1/turno_caja/abrir
export async function abrirTurno(req, res) {
  try {
    const { caja_fisica_id, monto_inicial_efectivo, nombre_turno } = req.body;

    if (!caja_fisica_id || monto_inicial_efectivo === undefined) {
      return res.status(400).json({ error: 'caja_fisica_id y monto_inicial_efectivo son obligatorios.' });
    }

    const nuevoTurno = await modelo.abrirTurno({
      caja_fisica_id: Number(caja_fisica_id),
      monto_inicial_efectivo: parseFloat(monto_inicial_efectivo),
      nombre_turno: nombre_turno || 'MAÑANA'
    });

    return res.status(201).json(nuevoTurno);
  } catch (error) {
    console.error('Error al abrir turno:', error);
    return res.status(500).json({ error: error.message });
  }
}

// PUT /api/v1/turno_caja/:id/cierre
export async function procesarCierreTurno(req, res) {
  try {
    const { id } = req.params;
    const { tipo, monto_real } = req.body;

    if (tipo === 'RAPIDO') {
      const turno = await modelo.cerrarTurnoRapido(Number(id));
      return res.status(200).json(turno);
    }

    if (monto_real === undefined || monto_real === null || isNaN(parseFloat(monto_real))) {
      return res.status(400).json({ error: 'Debe ingresar el efectivo contado para el cierre definitivo.' });
    }

    const turno = await modelo.cerrarTurnoDefinitivo(Number(id), monto_real);
    return res.status(200).json(turno);
  } catch (error) {
    console.error('Error en cierre de turno:', error);
    return res.status(500).json({ error: error.message });
  }
}