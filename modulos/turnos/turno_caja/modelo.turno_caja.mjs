import pool from "../../bd/conexion.bd.mjs";

// Obtener todos los turnos con JOINs informativos para la grilla del admin
export const obtenerTodos = async () => {
  const query = `
    SELECT 
  tc.id,
  tc.caja_fisica_id,
  tc.nombre_turno,
  tc.fecha_apertura,
  tc.fecha_cierre,
  tc.monto_inicial_efectivo,
  tc.monto_esperado_sistema,
  tc.total_esperado_debito,
  tc.total_esperado_credito,
  tc.total_esperado_qr,
  tc.monto_real_arqueo,
  tc.diferencia,
  tc.estado,
  cf.nombre AS caja_nombre,
  s.nombre AS sucursal_nombre
FROM turno_caja tc
LEFT JOIN caja_fisica cf ON tc.caja_fisica_id = cf.id
LEFT JOIN sucursal s ON cf.sucursal_id = s.id
ORDER BY tc.id DESC;
  `;
  const { rows } = await pool.query(query);
  return rows;
};

// Obtener un turno específico por ID
export const obtenerPorId = async (id) => {
  const query = `
    SELECT 
      tc.id,
      tc.caja_fisica_id,
      tc.nombre_turno,
      tc.fecha_apertura,
      tc.fecha_cierre,
      tc.monto_inicial_efectivo,
      tc.monto_esperado_sistema,
      tc.monto_real_arqueo,
      tc.diferencia,
      tc.estado,
      cf.nombre AS caja_nombre,
      s.id AS sucursal_id,
      s.nombre AS sucursal_nombre
    FROM turno_caja tc
    JOIN caja_fisica cf ON tc.caja_fisica_id = cf.id
    JOIN sucursal s ON cf.sucursal_id = s.id
    WHERE tc.id = $1;
  `;
  const { rows } = await pool.query(query, [id]);
  return rows[0];
};

// Apertura de un nuevo turno
export async function abrirTurnoo({ caja_fisica_id, usuario_id, monto_apertura }) {
  const apertura = Number(parseFloat(monto_apertura || 0).toFixed(2));

  const query = `
    INSERT INTO turno_caja (
      caja_fisica_id, 
      usuario_id, 
      monto_apertura, 
      monto_esperado_sistema, 
      total_esperado_debito, 
      total_esperado_credito, 
      total_esperado_qr,
      fecha_hora_apertura,
      estado
    ) 
    VALUES ($1, $2, $3, $3, 0.00, 0.00, 0.00, NOW(), 'ABIERTO') 
    RETURNING *;
  `;

  const { rows } = await pool.query(query, [caja_fisica_id, usuario_id, apertura]);
  return rows[0];
}

//Cerrar turno tradicional
export async function cerrarTurno({ turno_id, monto_real, observaciones = null }) {
  const conteoReal = Number(parseFloat(monto_real || 0).toFixed(2));

  // 1. Obtenemos los totales acumulados actuales
  const { rows } = await pool.query(`
    SELECT monto_esperado_sistema, total_esperado_debito, total_esperado_credito, total_esperado_qr
    FROM turno_caja 
    WHERE id = $1;
  `, [turno_id]);

  if (rows.length === 0) throw new Error('Turno no encontrado');

  const esperadoEfectivo = Number(parseFloat(rows[0].monto_esperado_sistema || 0).toFixed(2));
  
  // 2. La diferencia aplica únicamente sobre el efectivo físico
  const diferencia = Number((conteoReal - esperadoEfectivo).toFixed(2));

  // 3. Persistimos el cierre
  const queryCierre = `
    UPDATE turno_caja 
    SET 
      monto_real = $1,
      diferencia = $2,
      observaciones = $3,
      fecha_hora_cierre = NOW(),
      estado = 'CERRADO'
    WHERE id = $4
    RETURNING *;
  `;

  const resultado = await pool.query(queryCierre, [conteoReal, diferencia, observaciones, turno_id]);
  return resultado.rows[0];
}

// Cierre Rápido (por el cajero): pasa a EN_CIERRE y estampa fecha de cierre
export const registrarCierreRapido = async (id, monto_esperado_sistema) => {
  const query = `
    UPDATE turno_caja
    SET 
      fecha_cierre = NOW(),
      monto_esperado_sistema = COALESCE($1, monto_esperado_sistema),
      estado = 'EN_CIERRE'
    WHERE id = $2 AND estado = 'ABIERTO'
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [monto_esperado_sistema, id]);
  return rows[0];
};

// Declarar Arqueo (por el Administrador): audita monto real, diferencia y pasa a CERRADO
export const asentarArqueo = async (id, { monto_real_arqueo, diferencia, estado }) => {
  const query = `
    UPDATE turno_caja
    SET 
      monto_real_arqueo = $1,
      diferencia = $2,
      estado = $3,
      fecha_cierre = COALESCE(fecha_cierre, NOW())
    WHERE id = $4
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [
    monto_real_arqueo,
    diferencia,
    estado || 'CERRADO',
    id
  ]);
  return rows[0];
};

// Verificar si una caja física ya tiene un turno abierto
export const obtenerTurnoAbiertoPorCaja = async (caja_fisica_id) => {
  const query = `
    SELECT * FROM turno_caja 
    WHERE caja_fisica_id = $1 AND estado IN ('ABIERTO', 'EN_CIERRE')
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [caja_fisica_id]);
  return rows[0];
};

//TESTING:

export const obtenerOCrearTurnoDemo = async (terminal_id, usuario_id) => {
  // 1. Buscar si ya hay un turno ABIERTO para esta terminal
  const queryBuscar = `
    SELECT id, terminal_id, usuario_id, estado 
    FROM turno_caja 
    WHERE terminal_id = $1 AND estado = 'ABIERTO'
    ORDER BY id DESC LIMIT 1;
  `;
  const { rows } = await pool.query(queryBuscar, [terminal_id]);

  if (rows.length > 0) {
    return rows[0].id;
  }

  // 2. Si no hay ninguno abierto (típico en testing), creamos uno automático
  const queryCrear = `
    INSERT INTO turno_caja (terminal_id, usuario_id, fecha_inicio, saldo_inicial, estado)
    VALUES ($1, $2, CURRENT_TIMESTAMP, 10000.00, 'ABIERTO')
    RETURNING id;
  `;
  const nuevoTurno = await pool.query(queryCrear, [terminal_id, usuario_id]);
  return nuevoTurno.rows[0].id;
};

//Funciones que agregue a último momento para que funcione la lógica de los turnos. Después unifico todo bien

// 1. Obtener el turno activo (o en cierre) de la caja a la que pertenece la terminal
export async function obtenerTurnoActivoPorCaja(caja_fisica_id) {
  const query = `
    SELECT 
      id,
      caja_fisica_id,
      nombre_turno,
      fecha_apertura,
      fecha_cierre,
      monto_inicial_efectivo,
      monto_esperado_sistema,
      monto_real_arqueo,
      diferencia,
      estado,
      total_esperado_debito,
      total_esperado_credito,
      total_esperado_qr
    FROM turno_caja
    WHERE caja_fisica_id = $1 
      AND estado IN ('ABIERTO', 'EN_CIERRE')
    ORDER BY id DESC 
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [caja_fisica_id]);
  return rows[0] || null;
}

// 2. Abrir nuevo turno con fondo de inicio
export async function abrirTurno({ caja_fisica_id, monto_inicial_efectivo, nombre_turno = 'MAÑANA' }) {
  const inicial = Number(parseFloat(monto_inicial_efectivo || 0).toFixed(2));

  const query = `
    INSERT INTO turno_caja (
      caja_fisica_id,
      nombre_turno,
      fecha_apertura,
      monto_inicial_efectivo,
      monto_esperado_sistema,
      total_esperado_debito,
      total_esperado_credito,
      total_esperado_qr,
      estado
    ) 
    VALUES ($1, $2, NOW(), $3, $3, 0.00, 0.00, 0.00, 'ABIERTO')
    RETURNING *;
  `;

  const { rows } = await pool.query(query, [caja_fisica_id, nombre_turno, inicial]);
  return rows[0];
}

// 3. Cierre Definitivo (Cajero cuenta el efectivo y se calcula diferencia)
export async function cerrarTurnoDefinitivo(id, monto_real_arqueo) {
  const realNum = Number(parseFloat(monto_real_arqueo).toFixed(2));

  const turnoRes = await pool.query("SELECT monto_esperado_sistema FROM turno_caja WHERE id = $1", [id]);
  if (turnoRes.rows.length === 0) throw new Error('Turno no encontrado');

  const esperado = Number(parseFloat(turnoRes.rows[0].monto_esperado_sistema || 0).toFixed(2));
  const diferencia = Number((realNum - esperado).toFixed(2));

  const query = `
    UPDATE turno_caja 
    SET 
      monto_real_arqueo = $1,
      diferencia = $2,
      fecha_cierre = NOW(),
      estado = 'CERRADO'
    WHERE id = $3
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [realNum, diferencia, id]);
  return rows[0];
}

// 4. Cierre Rápido (El cajero entrega la caja sin contar; queda para auditoría del admin)
export async function cerrarTurnoRapido(id) {
  const query = `
    UPDATE turno_caja 
    SET 
      monto_real_arqueo = NULL,
      diferencia = NULL,
      fecha_cierre = NOW(),
      estado = 'EN_CIERRE'
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [id]);
  return rows[0];
}