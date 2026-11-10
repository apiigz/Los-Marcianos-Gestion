import pool from '../../bd/conexion.bd.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { enTransaccion } from '../../utils/transaccion.mjs';
import { ajustarStock } from '../../productos/stock_sucursal/modelo.stock_sucursal.mjs';
import { requerimientos } from './calculo.pedido.mjs';

const ESTADOS_ABIERTOS = ['PENDIENTE', 'PREPARADO', 'EN_REPARTO'];
const fmt = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Helpers internos ----------
async function evento(client, pedidoId, tipo, usuarioId, detalle = null) {
  await client.query(
    'INSERT INTO pedido_evento (pedido_id, tipo, usuario_id, detalle) VALUES ($1,$2,$3,$4)',
    [pedidoId, tipo, usuarioId, detalle]);
}

async function bloquearPedido(client, id) {
  const { rows } = await client.query('SELECT * FROM pedido_mayorista WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new ErrorHttp(404, 'Pedido no encontrado.');
  return rows[0];
}

// Deuda actual del cliente + pedidos abiertos que todavía no generaron cargo
async function exposicion(client, clienteId, excluirPedidoId = 0) {
  const s = await client.query(
    'SELECT COALESCE(SUM(monto),0) AS saldo FROM movimiento_cuenta_cliente WHERE cliente_id = $1', [clienteId]);
  const p = await client.query(`
    SELECT COALESCE(SUM(total),0) AS pendiente FROM pedido_mayorista
    WHERE cliente_id = $1 AND id <> $2 AND estado = ANY($3::text[])`,
    [clienteId, excluirPedidoId, ESTADOS_ABIERTOS]);
  return Number(s.rows[0].saldo) + Number(p.rows[0].pendiente);
}

// Devuelve true si se excedió y estaba autorizado; lanza error si se excedió sin permiso
async function verificarLimite(client, cliente, total, excluirPedidoId, puedeExceder) {
  if (cliente.limite_credito === null) return false;
  const limite = Number(cliente.limite_credito);
  const usado = await exposicion(client, cliente.id, excluirPedidoId);
  if (usado + total <= limite) return false;
  if (!puedeExceder) {
    throw new ErrorHttp(409,
      `El pedido supera el límite de crédito del cliente (límite $ ${fmt(limite)}, ya comprometido $ ${fmt(usado)}, este pedido $ ${fmt(total)}). Requiere autorización.`,
      'LIMITE_EXCEDIDO');
  }
  return true;
}

async function cargarCombos(client, productoIds) {
  const { rows } = await client.query(
    'SELECT combo_producto_id, producto_ingrediente_id, cantidad FROM combo_item WHERE combo_producto_id = ANY($1::int[])',
    [productoIds]);
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.combo_producto_id)) m.set(r.combo_producto_id, []);
    m.get(r.combo_producto_id).push(r);
  }
  return m;
}

async function insertarItems(client, pedidoId, lineas) {
  for (const l of lineas) {
    await client.query(`
      INSERT INTO pedido_item (pedido_id, producto_id, cantidad, precio_unitario, alicuota_iva, subtotal)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [pedidoId, l.producto_id, l.cantidad, l.precio_unitario, l.alicuota_iva, l.subtotal]);
  }
}

// ---------- Lecturas ----------
export async function obtenerOpciones(canalesConfig) {
  const { rows } = await pool.query(
    'SELECT id, nombre, es_deposito_central FROM sucursal ORDER BY es_deposito_central DESC, nombre');
  return {
    sucursales: rows,
    sucursal_por_defecto_id: rows.find(s => s.es_deposito_central)?.id ?? null,
    canales: String(canalesConfig || '').split(',').map(s => s.trim()).filter(Boolean)
  };
}

export async function listar({ estado }) {
  const { rows } = await pool.query(`
    SELECT p.id, p.remito_numero, p.estado, p.canal, p.total, p.created_at,
           c.razon_social AS cliente, s.nombre AS sucursal,
           u.nombre || ' ' || u.apellido AS creado_por_nombre
    FROM pedido_mayorista p
    JOIN cliente c ON c.id = p.cliente_id
    JOIN sucursal s ON s.id = p.sucursal_origen_id
    JOIN usuario u ON u.id = p.creado_por
    WHERE ($1::text IS NULL OR p.estado = $1)
    ORDER BY p.id DESC LIMIT 200`, [estado || null]);
  return rows;
}

export async function obtener(id) {
  const { rows } = await pool.query(`
    SELECT p.*, c.razon_social AS cliente, c.cuit AS cliente_cuit, c.limite_credito,
           s.nombre AS sucursal, u.nombre || ' ' || u.apellido AS creado_por_nombre
    FROM pedido_mayorista p
    JOIN cliente c ON c.id = p.cliente_id
    JOIN sucursal s ON s.id = p.sucursal_origen_id
    JOIN usuario u ON u.id = p.creado_por
    WHERE p.id = $1`, [id]);
  if (!rows[0]) return null;

  const items = await pool.query(`
    SELECT i.producto_id, pr.descripcion, pr.codigo_interno, i.cantidad, i.precio_unitario,
           i.alicuota_iva, i.subtotal
    FROM pedido_item i JOIN producto pr ON pr.id = i.producto_id
    WHERE i.pedido_id = $1 ORDER BY i.id`, [id]);

  const eventos = await pool.query(`
    SELECT e.tipo, e.detalle, e.created_at, u.nombre || ' ' || u.apellido AS usuario
    FROM pedido_evento e JOIN usuario u ON u.id = e.usuario_id
    WHERE e.pedido_id = $1 ORDER BY e.id`, [id]);

  return { ...rows[0], items: items.rows, eventos: eventos.rows };
}

// ---------- Escrituras ----------
export const crear = ({ clienteId, sucursalId, canal, observaciones, lineas, total, usuarioId, puedeExceder }) =>
  enTransaccion(async (client) => {
    // Bloquear al cliente serializa los pedidos simultáneos y hace confiable el control del límite
    const cli = await client.query('SELECT * FROM cliente WHERE id = $1 FOR UPDATE', [clienteId]);
    if (!cli.rows[0]) throw new ErrorHttp(404, 'El cliente no existe.');
    if (!cli.rows[0].activo) throw new ErrorHttp(409, 'El cliente está inactivo.');

    const suc = await client.query('SELECT 1 FROM sucursal WHERE id = $1', [sucursalId]);
    if (!suc.rowCount) throw new ErrorHttp(400, 'La sucursal de despacho no existe.');

    const excedido = await verificarLimite(client, cli.rows[0], total, 0, puedeExceder);

    const { rows } = await client.query(`
      INSERT INTO pedido_mayorista (cliente_id, sucursal_origen_id, canal, total, observaciones, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [clienteId, sucursalId, canal, total, observaciones, usuarioId]);
    const id = rows[0].id;

    await insertarItems(client, id, lineas);
    await evento(client, id, 'CREADO', usuarioId, `Canal ${canal} · ${lineas.length} renglones · $ ${fmt(total)}`);
    if (excedido) await evento(client, id, 'LIMITE_EXCEDIDO_AUTORIZADO', usuarioId, 'Superó el límite de crédito con autorización.');
    return id;
  });

export const reemplazarItems = ({ id, lineas, total, usuarioId, puedeExceder }) =>
  enTransaccion(async (client) => {
    const ped = await bloquearPedido(client, id);
    if (ped.estado !== 'PENDIENTE') {
      throw new ErrorHttp(409, `Solo se puede modificar un pedido PENDIENTE (está ${ped.estado}).`, 'ESTADO_INVALIDO');
    }
    const cli = await client.query('SELECT * FROM cliente WHERE id = $1 FOR UPDATE', [ped.cliente_id]);
    const excedido = await verificarLimite(client, cli.rows[0], total, id, puedeExceder);

    await client.query('DELETE FROM pedido_item WHERE pedido_id = $1', [id]);
    await insertarItems(client, id, lineas);
    await client.query('UPDATE pedido_mayorista SET total = $1, updated_at = now() WHERE id = $2', [total, id]);
    await evento(client, id, 'ITEMS_MODIFICADOS', usuarioId, `${lineas.length} renglones · $ ${fmt(total)}`);
    if (excedido) await evento(client, id, 'LIMITE_EXCEDIDO_AUTORIZADO', usuarioId, 'Superó el límite de crédito con autorización.');
  });

// PENDIENTE -> PREPARADO: descuenta TODO el stock o no hace nada.
// forzar: permite preparar aunque falte stock (queda negativo y se registra).
export const preparar = (id, usuarioId, { forzar = false, motivo = null } = {}) =>
  enTransaccion(async (client) => {
    const ped = await bloquearPedido(client, id);
    if (ped.estado !== 'PENDIENTE') {
      throw new ErrorHttp(409, `El pedido ya no está pendiente (está ${ped.estado}).`, 'ESTADO_INVALIDO');
    }
    if (ped.stock_descontado) {
      throw new ErrorHttp(409, 'Inconsistencia: el pedido ya tiene el stock descontado. Avisá al administrador.', 'STOCK_YA_DESCONTADO');
    }

    const { rows: items } = await client.query(
      'SELECT producto_id, cantidad FROM pedido_item WHERE pedido_id = $1', [id]);
    if (!items.length) throw new ErrorHttp(400, 'El pedido no tiene renglones.');

    const lineas = items.map(i => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad) }));
    const combos = await cargarCombos(client, lineas.map(l => l.producto_id));
    const req = requerimientos(lineas, combos);
    const ids = [...req.keys()].sort((a, b) => a - b);

    const { rows: stock } = await client.query(`
      SELECT producto_id, cantidad_disponible FROM stock_sucursal
      WHERE sucursal_id = $1 AND producto_id = ANY($2::int[])
      ORDER BY producto_id FOR UPDATE`, [ped.sucursal_origen_id, ids]);
    const disponible = new Map(stock.map(s => [s.producto_id, Number(s.cantidad_disponible)]));

    const faltantes = ids.filter(pid => (disponible.get(pid) ?? 0) < req.get(pid));
    let detalleFaltantes = null;
    if (faltantes.length) {
      const nombres = await client.query(
        'SELECT id, descripcion FROM producto WHERE id = ANY($1::int[])', [faltantes]);
      const nom = new Map(nombres.rows.map(r => [r.id, r.descripcion]));
      detalleFaltantes = faltantes
        .map(pid => `${nom.get(pid)} (necesita ${req.get(pid)}, hay ${disponible.get(pid) ?? 0})`)
        .join('; ');

      if (!forzar) {
        throw new ErrorHttp(409,
          `Stock insuficiente en la sucursal de despacho: ${detalleFaltantes}.`, 'STOCK_INSUFICIENTE');
      }
    }

    for (const pid of ids) {
      await ajustarStock(ped.sucursal_origen_id, pid, -req.get(pid), client);
    }

    await client.query(
      "UPDATE pedido_mayorista SET estado = 'PREPARADO', stock_descontado = true, updated_at = now() WHERE id = $1", [id]);

    if (detalleFaltantes) {
      await evento(client, id, 'PREPARADO_SIN_STOCK', usuarioId,
        `Motivo: ${motivo}. Stock negativo en: ${detalleFaltantes}`.slice(0, 500));
    } else {
      await evento(client, id, 'PREPARADO', usuarioId, 'Stock descontado de la sucursal de despacho.');
    }
  });

// PENDIENTE o PREPARADO -> CANCELADO. Si ya había descontado stock, lo repone.
export const cancelar = ({ id, usuarioId, motivo, puedeCancelarPreparado }) =>
  enTransaccion(async (client) => {
    const ped = await bloquearPedido(client, id);
    if (!['PENDIENTE', 'PREPARADO'].includes(ped.estado)) {
      throw new ErrorHttp(409, `No se puede cancelar un pedido ${ped.estado}.`, 'ESTADO_INVALIDO');
    }
    if (ped.estado === 'PREPARADO' && !puedeCancelarPreparado) {
      throw new ErrorHttp(403, 'Cancelar un pedido ya preparado requiere permiso de preparación.');
    }

    if (ped.stock_descontado) {
      const { rows: items } = await client.query(
        'SELECT producto_id, cantidad FROM pedido_item WHERE pedido_id = $1', [id]);
      const lineas = items.map(i => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad) }));
      const combos = await cargarCombos(client, lineas.map(l => l.producto_id));
      const req = requerimientos(lineas, combos);
      for (const pid of [...req.keys()].sort((a, b) => a - b)) {
        await ajustarStock(ped.sucursal_origen_id, pid, req.get(pid), client);
      }
    }

    await client.query(
      "UPDATE pedido_mayorista SET estado = 'CANCELADO', stock_descontado = false, updated_at = now() WHERE id = $1", [id]);
    await evento(client, id, 'CANCELADO', usuarioId,
      `${motivo}${ped.stock_descontado ? ' (stock repuesto)' : ''}`);
  });