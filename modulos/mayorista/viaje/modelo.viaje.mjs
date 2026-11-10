import pool from '../../bd/conexion.bd.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { enTransaccion } from '../../utils/transaccion.mjs';
import { calcularRendicion } from './calculo.viaje.mjs';

async function bloquearViaje(client, id) {
  const { rows } = await client.query('SELECT * FROM viaje WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new ErrorHttp(404, 'Viaje no encontrado.');
  return rows[0];
}

const pedidosEnReparto = (client, viajeId) => client.query(`
  SELECT p.id, p.remito_numero, c.razon_social
  FROM pedido_mayorista p JOIN cliente c ON c.id = p.cliente_id
  WHERE p.viaje_id = $1 AND p.estado = 'EN_REPARTO' ORDER BY p.id`, [viajeId]);

const remito = (n) => '#' + String(n).padStart(6, '0');

// Efectivo cobrado durante el reparto que todavía no se rindió
const efectivoPorRendir = (db, viajeId) => db.query(`
  SELECT c.id, c.monto FROM cobro_cliente c
  WHERE c.viaje_id = $1 AND c.medio = 'EFECTIVO'
    AND NOT EXISTS (SELECT 1 FROM rendicion_cobro rc WHERE rc.cobro_id = c.id)
  ORDER BY c.id`, [viajeId]);

// ---------- Lecturas ----------
export async function opciones() {
  const [v, e] = await Promise.all([
    pool.query('SELECT id, nombre, patente FROM vehiculo WHERE activo ORDER BY nombre'),
    pool.query('SELECT id, nombre, apellido FROM usuario WHERE activo ORDER BY apellido, nombre')
  ]);
  return { vehiculos: v.rows, encargados: e.rows };
}

export async function listar({ estado }) {
  const { rows } = await pool.query(`
    SELECT v.id, v.fecha, v.estado, ve.nombre AS vehiculo,
           u.nombre || ' ' || u.apellido AS encargado,
           (SELECT count(*) FROM pedido_mayorista p WHERE p.viaje_id = v.id)::int AS pedidos
    FROM viaje v
    JOIN vehiculo ve ON ve.id = v.vehiculo_id
    JOIN usuario u ON u.id = v.encargado_id
    WHERE ($1::text IS NULL OR v.estado = $1)
    ORDER BY v.id DESC LIMIT 100`, [estado || null]);
  return rows;
}

export async function obtener(id) {
  const { rows } = await pool.query(`
    SELECT v.*, ve.nombre AS vehiculo, u.nombre || ' ' || u.apellido AS encargado
    FROM viaje v
    JOIN vehiculo ve ON ve.id = v.vehiculo_id
    JOIN usuario u ON u.id = v.encargado_id
    WHERE v.id = $1`, [id]);
  const viaje = rows[0];
  if (!viaje) return null;

  const pedidos = await pool.query(`
    SELECT p.id, p.remito_numero, p.estado, p.total, c.razon_social AS cliente, c.direccion,
           COALESCE((SELECT SUM(monto) FROM cobro_cliente WHERE pedido_id = p.id), 0) AS cobrado
    FROM pedido_mayorista p JOIN cliente c ON c.id = p.cliente_id
    WHERE p.viaje_id = $1 ORDER BY p.id`, [id]);

  const cobros = await pool.query(
    'SELECT medio, SUM(monto) AS total FROM cobro_cliente WHERE viaje_id = $1 GROUP BY medio', [id]);

  const porRendir = await efectivoPorRendir(pool, id);
  const rendicion = await pool.query(`
    SELECT r.*, e.nombre || ' ' || e.apellido AS entregado_por_nombre,
           rc.nombre || ' ' || rc.apellido AS recibido_por_nombre
    FROM rendicion r
    JOIN usuario e ON e.id = r.entregado_por
    JOIN usuario rc ON rc.id = r.recibido_por
    WHERE r.viaje_id = $1`, [id]);

  // Pedidos listos para cargar (solo mientras el viaje se está armando)
  const preparados = viaje.estado === 'ABIERTO' ? (await pool.query(`
    SELECT p.id, p.remito_numero, p.total, c.razon_social AS cliente, s.nombre AS sucursal
    FROM pedido_mayorista p
    JOIN cliente c ON c.id = p.cliente_id
    JOIN sucursal s ON s.id = p.sucursal_origen_id
    WHERE p.estado = 'PREPARADO' ORDER BY p.id`)).rows : [];

  return {
    ...viaje, pedidos: pedidos.rows, cobros: cobros.rows,
    efectivo_por_rendir: porRendir.rows.reduce((a, c) => a + Number(c.monto), 0),
    rendicion: rendicion.rows[0] || null, preparados
  };
}

// ---------- Escrituras ----------
export const crear = ({ vehiculoId, encargadoId, observaciones, usuarioId }) =>
  enTransaccion(async (client) => {
    const v = await client.query('SELECT 1 FROM vehiculo WHERE id = $1 AND activo', [vehiculoId]);
    if (!v.rowCount) throw new ErrorHttp(400, 'El vehículo no existe o está inactivo.');
    const u = await client.query('SELECT 1 FROM usuario WHERE id = $1 AND activo', [encargadoId]);
    if (!u.rowCount) throw new ErrorHttp(400, 'El encargado no existe o está inactivo.');

    const { rows } = await client.query(`
      INSERT INTO viaje (vehiculo_id, encargado_id, observaciones, creado_por)
      VALUES ($1,$2,$3,$4) RETURNING id`, [vehiculoId, encargadoId, observaciones, usuarioId]);
    return rows[0].id;
  });

export const salir = (id) =>
  enTransaccion(async (client) => {
    const v = await bloquearViaje(client, id);
    if (v.estado !== 'ABIERTO') throw new ErrorHttp(409, `El viaje ya no está abierto (está ${v.estado}).`, 'ESTADO_INVALIDO');
    if (!(await pedidosEnReparto(client, id)).rowCount) {
      throw new ErrorHttp(400, 'Cargá al menos un pedido antes de salir.');
    }
    await client.query("UPDATE viaje SET estado = 'EN_CURSO', salida_at = now() WHERE id = $1", [id]);
  });

export const regresar = (id) =>
  enTransaccion(async (client) => {
    const v = await bloquearViaje(client, id);
    if (v.estado !== 'EN_CURSO') throw new ErrorHttp(409, `El viaje no está en curso (está ${v.estado}).`, 'ESTADO_INVALIDO');

    const pend = await pedidosEnReparto(client, id);
    if (pend.rowCount) {
      const lista = pend.rows.map(p => `${remito(p.remito_numero)} (${p.razon_social})`).join(', ');
      throw new ErrorHttp(409,
        `Quedan pedidos sin resolver: ${lista}. Registrá la entrega o "No se pudo entregar" en cada uno.`,
        'PEDIDOS_SIN_RESOLVER');
    }
    await client.query("UPDATE viaje SET estado = 'REGRESADO', regreso_at = now() WHERE id = $1", [id]);
  });

export const cancelar = (id) =>
  enTransaccion(async (client) => {
    const v = await bloquearViaje(client, id);
    if (v.estado !== 'ABIERTO') throw new ErrorHttp(409, 'Solo se cancela un viaje que todavía no salió.', 'ESTADO_INVALIDO');
    if ((await pedidosEnReparto(client, id)).rowCount) {
      throw new ErrorHttp(409, 'Quitá primero los pedidos cargados en este viaje.');
    }
    await client.query("UPDATE viaje SET estado = 'CANCELADO' WHERE id = $1", [id]);
  });

// Administración cuenta el efectivo y firma. El servidor calcula lo esperado y la diferencia.
export const rendir = ({ id, contado, observaciones, usuarioId }) =>
  enTransaccion(async (client) => {
    const v = await bloquearViaje(client, id);
    if (v.estado !== 'REGRESADO') {
      throw new ErrorHttp(409, 'Solo se rinde un viaje que ya regresó (o ya fue rendido).', 'ESTADO_INVALIDO');
    }
    if (v.encargado_id === usuarioId) {
      throw new ErrorHttp(403, 'El encargado del viaje no puede recibir su propia rendición: tiene que hacerlo otra persona.');
    }

    const { rows: cobros } = await efectivoPorRendir(client, id);
    const r = calcularRendicion(cobros.map(c => c.monto), contado, observaciones);

    const ins = await client.query(`
      INSERT INTO rendicion (viaje_id, efectivo_esperado, efectivo_contado, diferencia,
                             entregado_por, recibido_por, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [id, r.esperado, r.contado, r.diferencia, v.encargado_id, usuarioId, r.observaciones]);

    if (cobros.length) {
      await client.query(
        'INSERT INTO rendicion_cobro (rendicion_id, cobro_id) SELECT $1, unnest($2::int[])',
        [ins.rows[0].id, cobros.map(c => c.id)]);
    }
    await client.query("UPDATE viaje SET estado = 'RENDIDO' WHERE id = $1", [id]);
    return { esperado: r.esperado, contado: r.contado, diferencia: r.diferencia };
  });