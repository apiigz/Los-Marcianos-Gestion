import pool from '../../bd/conexion.bd.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';

// Un cajero cuenta como "activo" si dio señales de vida en los últimos N minutos.
// El POS manda un latido cada 60 s, así que 10 min tolera cortes cortos de internet.
export const VENTANA_ACTIVIDAD_MIN = 10;

const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ÚNICA fuente de verdad de los horarios (confirmar con los jefes)
export function calcularTurnoSegunHora() {
  const hora = parseInt(
    new Intl.DateTimeFormat('es-AR', {
      hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Cordoba'
    }).format(new Date()), 10);
  if (hora >= 6 && hora < 14) return 'MAÑANA';
  if (hora >= 14 && hora < 22) return 'TARDE';
  return 'NOCHE';
}

// ---------- Utilidades internas ----------
function traducirErrorBd(e) {
  if (e.code === '23505') {
    if (e.constraint === 'uq_turno_cajero_terminal_activo') {
      return new ErrorHttp(409, 'Esa terminal está siendo usada por otro cajero.', 'TERMINAL_EN_USO');
    }
    if (e.constraint === 'uq_turno_activo_por_caja') {
      return new ErrorHttp(409, 'Esta caja ya tiene un turno abierto o pendiente de arqueo.', 'CAJA_CON_TURNO');
    }
  }
  return e;
}

async function enTransaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (e) {
    await client.query('ROLLBACK');
    throw traducirErrorBd(e);
  } finally {
    client.release();
  }
}

async function bloquearTurnoAbierto(client, id) {
  const { rows } = await client.query('SELECT * FROM turno_caja WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new ErrorHttp(404, `No se encontró el turno #${id}.`);
  if (rows[0].estado !== 'ABIERTO') {
    throw new ErrorHttp(409, 'El turno ya no está abierto.', 'TURNO_NO_ABIERTO');
  }
  return rows[0];
}

const liberarPresencias = (client, turnoId) =>
  client.query('UPDATE turno_cajero SET egreso = now() WHERE turno_caja_id = $1 AND egreso IS NULL', [turnoId]);

// Check-in / latido. Debe correr dentro de una transacción.
async function marcarPresencia(client, { turnoId, usuarioId, terminalId }) {
  // 1. Liberar presencias "colgadas" (navegador cerrado sin salir)
  await client.query(`
    UPDATE turno_cajero SET egreso = ultima_actividad
    WHERE egreso IS NULL
      AND ultima_actividad < now() - make_interval(mins => $1::int)`, [VENTANA_ACTIVIDAD_MIN]);

  // 2. Un usuario no puede estar en dos turnos a la vez
  await client.query(`
    UPDATE turno_cajero SET egreso = now()
    WHERE usuario_id = $1 AND egreso IS NULL AND turno_caja_id <> $2`, [usuarioId, turnoId]);

  // 3. Alta o latido
  await client.query(`
    INSERT INTO turno_cajero (turno_caja_id, usuario_id, terminal_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (turno_caja_id, usuario_id) WHERE egreso IS NULL
    DO UPDATE SET ultima_actividad = now(), terminal_id = EXCLUDED.terminal_id`,
    [turnoId, usuarioId, terminalId]);
}

// ---------- Lecturas ----------
export async function obtenerTodos() {
  const { rows } = await pool.query(`
    SELECT tc.id, tc.caja_fisica_id, tc.nombre_turno, tc.fecha_apertura, tc.fecha_cierre,
           tc.monto_inicial_efectivo, tc.monto_esperado_sistema,
           tc.total_esperado_debito, tc.total_esperado_credito, tc.total_esperado_qr,
           tc.monto_real_arqueo, tc.diferencia, tc.estado,
           cf.nombre AS caja_nombre, s.id AS sucursal_id, s.nombre AS sucursal_nombre
    FROM turno_caja tc
    LEFT JOIN caja_fisica cf ON tc.caja_fisica_id = cf.id
    LEFT JOIN sucursal s ON cf.sucursal_id = s.id
    ORDER BY tc.id DESC`);
  return rows;
}

export async function obtenerPorId(id) {
  const { rows } = await pool.query(`
    SELECT tc.*, cf.nombre AS caja_nombre, s.id AS sucursal_id, s.nombre AS sucursal_nombre
    FROM turno_caja tc
    JOIN caja_fisica cf ON tc.caja_fisica_id = cf.id
    JOIN sucursal s ON cf.sucursal_id = s.id
    WHERE tc.id = $1`, [id]);
  return rows[0];
}

// Turno vivo de la caja a la que pertenece la terminal
export async function obtenerTurnoActivoPorTerminal(terminalId) {
  const { rows } = await pool.query(`
    SELECT tc.id, tc.caja_fisica_id, tc.nombre_turno, tc.fecha_apertura, tc.fecha_cierre,
           tc.monto_inicial_efectivo, tc.monto_esperado_sistema, tc.monto_real_arqueo,
           tc.diferencia, tc.estado, tc.total_esperado_debito, tc.total_esperado_credito,
           tc.total_esperado_qr
    FROM turno_caja tc
    JOIN terminal t ON t.caja_fisica_id = tc.caja_fisica_id
    WHERE t.id = $1 AND tc.estado IN ('ABIERTO', 'EN_CIERRE')
    ORDER BY tc.id DESC LIMIT 1`, [terminalId]);
  return rows[0] || null;
}

export async function usuarioEstaEnTurno(turnoId, usuarioId) {
  const { rowCount } = await pool.query(`
    SELECT 1 FROM turno_cajero
    WHERE turno_caja_id = $1 AND usuario_id = $2 AND egreso IS NULL`, [turnoId, usuarioId]);
  return rowCount > 0;
}

// ¿Hay OTRO cajero activo en el turno con permiso para cerrarlo? (regla del novato)
export async function hayCajeroConPermisoDeCierre(turnoId, excluirUsuarioId) {
  const { rowCount } = await pool.query(`
    SELECT 1 FROM turno_cajero tj
    JOIN usuario u ON u.id = tj.usuario_id
    JOIN rol r ON r.id = u.rol_id
    WHERE tj.turno_caja_id = $1
      AND tj.egreso IS NULL
      AND tj.usuario_id <> $2
      AND tj.ultima_actividad > now() - make_interval(mins => $3::int)
      AND (r.es_admin OR EXISTS (
            SELECT 1 FROM rol_permiso rp
            WHERE rp.rol_id = r.id AND rp.permiso_codigo = 'turno.cerrar'))
    LIMIT 1`, [turnoId, excluirUsuarioId, VENTANA_ACTIVIDAD_MIN]);
  return rowCount > 0;
}

// ---------- Escrituras ----------
export const abrirTurno = ({ terminalId, usuarioId, montoInicial }) =>
  enTransaccion(async (client) => {
    const t = await client.query('SELECT caja_fisica_id FROM terminal WHERE id = $1', [terminalId]);
    if (!t.rowCount) throw new ErrorHttp(404, 'La terminal indicada no existe.', 'TERMINAL_INVALIDA');
    const cajaId = t.rows[0].caja_fisica_id;

    const existente = await client.query(`
      SELECT id, estado FROM turno_caja
      WHERE caja_fisica_id = $1 AND estado IN ('ABIERTO', 'EN_CIERRE') LIMIT 1`, [cajaId]);
    if (existente.rowCount) {
      throw new ErrorHttp(409,
        `La caja ya posee el turno #${existente.rows[0].id} en estado ${existente.rows[0].estado}. Debe cerrarse antes de abrir uno nuevo.`,
        'CAJA_CON_TURNO');
    }

    const inicial = redondear(montoInicial);
    const { rows } = await client.query(`
      INSERT INTO turno_caja (
        caja_fisica_id, nombre_turno, fecha_apertura, monto_inicial_efectivo,
        monto_esperado_sistema, total_esperado_debito, total_esperado_credito,
        total_esperado_qr, estado, usuario_apertura_id)
      VALUES ($1, $2, NOW(), $3, $3, 0, 0, 0, 'ABIERTO', $4)
      RETURNING *`, [cajaId, calcularTurnoSegunHora(), inicial, usuarioId]);

    await marcarPresencia(client, { turnoId: rows[0].id, usuarioId, terminalId });
    return rows[0];
  });

export const registrarPresencia = ({ turnoId, usuarioId, terminalId }) =>
  enTransaccion(async (client) => {
    const { rows } = await client.query(`
      SELECT tc.estado, tc.caja_fisica_id AS caja_turno, t.caja_fisica_id AS caja_terminal
      FROM turno_caja tc, terminal t
      WHERE tc.id = $1 AND t.id = $2`, [turnoId, terminalId]);
    const x = rows[0];
    if (!x) throw new ErrorHttp(404, 'Turno o terminal inexistente.', 'TERMINAL_INVALIDA');
    if (x.estado !== 'ABIERTO') throw new ErrorHttp(409, 'El turno ya no está abierto.', 'TURNO_NO_ABIERTO');
    if (x.caja_turno !== x.caja_terminal) {
      throw new ErrorHttp(409, 'La terminal no pertenece a la caja de este turno.', 'TERMINAL_INVALIDA');
    }
    await marcarPresencia(client, { turnoId, usuarioId, terminalId });
  });

export async function salirDelTurno(usuarioId) {
  await pool.query('UPDATE turno_cajero SET egreso = now() WHERE usuario_id = $1 AND egreso IS NULL', [usuarioId]);
}

// Cierre definitivo: el cajero cuenta el efectivo y se calcula la diferencia
export const cerrarTurnoDefinitivo = (id, montoReal, usuarioId) =>
  enTransaccion(async (client) => {
    const turno = await bloquearTurnoAbierto(client, id);
    const real = redondear(montoReal);
    const diferencia = redondear(real - Number(turno.monto_esperado_sistema || 0));

    const { rows } = await client.query(`
      UPDATE turno_caja
      SET monto_real_arqueo = $1, diferencia = $2, fecha_cierre = NOW(),
          estado = 'CERRADO', usuario_cierre_id = $3
      WHERE id = $4 RETURNING *`, [real, diferencia, usuarioId, id]);

    await liberarPresencias(client, id);
    return rows[0];
  });

// Cierre rápido (lo usa el cajero y el "Forzar cierre" del admin): queda EN_CIERRE para auditar
export const cerrarTurnoRapido = (id, usuarioId) =>
  enTransaccion(async (client) => {
    await bloquearTurnoAbierto(client, id);
    const { rows } = await client.query(`
      UPDATE turno_caja
      SET monto_real_arqueo = NULL, diferencia = NULL, fecha_cierre = NOW(),
          estado = 'EN_CIERRE', usuario_cierre_id = $2
      WHERE id = $1 RETURNING *`, [id, usuarioId]);

    await liberarPresencias(client, id);
    return rows[0];
  });

// Arqueo auditado por el admin: la diferencia la calcula el SERVIDOR
export const asentarArqueo = (id, montoReal) =>
  enTransaccion(async (client) => {
    const { rows: ts } = await client.query('SELECT * FROM turno_caja WHERE id = $1 FOR UPDATE', [id]);
    const t = ts[0];
    if (!t) return null;
    if (t.estado === 'ABIERTO') throw new ErrorHttp(409, 'El turno sigue abierto: primero debe cerrarse.');

    const real = redondear(montoReal);
    const diferencia = redondear(real - Number(t.monto_esperado_sistema || 0));

    const { rows } = await client.query(`
      UPDATE turno_caja
      SET monto_real_arqueo = $1, diferencia = $2, estado = 'CERRADO',
          fecha_cierre = COALESCE(fecha_cierre, NOW())
      WHERE id = $3 RETURNING *`, [real, diferencia, id]);

    await liberarPresencias(client, id);
    return rows[0];
  });