import pool from '../../bd/conexion.bd.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { enTransaccion } from '../../utils/transaccion.mjs';
import { redondear } from '../../utils/dinero.mjs';
import { ajustarStock } from '../../productos/stock_sucursal/modelo.stock_sucursal.mjs';
import { requerimientos } from './calculo.pedido.mjs';
import { calcularEntrega, validarPendientes } from './calculo.entrega.mjs';
import { normalizarCobros } from '../cuenta/calculo.cuenta.mjs';
import * as cuenta from '../cuenta/modelo.cuenta.mjs';

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

  const cobros = await pool.query(`
    SELECT c.id, c.medio, c.monto, c.referencia, c.created_at, cc.nombre AS cuenta,
           u.nombre || ' ' || u.apellido AS cobrado_por
    FROM cobro_cliente c
    LEFT JOIN cuenta_cobro cc ON cc.id = c.cuenta_cobro_id
    JOIN usuario u ON u.id = c.cobrado_por
    WHERE c.pedido_id = $1 ORDER BY c.id`, [id]);
  const cobrado = redondear(cobros.rows.reduce((a, c) => a + Number(c.monto), 0));

  const pendientes = await pool.query(`
    SELECT pe.id, pe.cantidad_restante, pr.descripcion, ped.remito_numero
    FROM pendiente_entrega pe
    JOIN producto pr ON pr.id = pe.producto_id
    JOIN pedido_mayorista ped ON ped.id = pe.pedido_id
    WHERE pe.cliente_id = $1 AND pe.estado = 'PENDIENTE' ORDER BY pe.id`, [rows[0].cliente_id]);

  return {
    ...rows[0], items: items.rows, eventos: eventos.rows,
    cobros: cobros.rows, cobrado, falta_cobrar: redondear(Number(rows[0].total) - cobrado),
    pendientes_cliente: pendientes.rows
  };
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

  const remitoTxt = (n) => String(n).padStart(6, '0');

// PREPARADO -> EN_REPARTO dentro de un viaje que todavía no salió. El stock ya estaba descontado.
export const cargarCamioneta = (id, viajeId, usuarioId) =>
  enTransaccion(async (client) => {
    const ped = await bloquearPedido(client, id);
    if (ped.estado !== 'PREPARADO') {
      throw new ErrorHttp(409, `Solo se carga un pedido PREPARADO (está ${ped.estado}).`, 'ESTADO_INVALIDO');
    }
    // FOR SHARE: el viaje no puede salir mientras se le carga este pedido
    const v = await client.query('SELECT estado FROM viaje WHERE id = $1 FOR SHARE', [viajeId]);
    if (!v.rowCount) throw new ErrorHttp(404, 'El viaje no existe.');
    if (v.rows[0].estado !== 'ABIERTO') {
      throw new ErrorHttp(409, 'Ese viaje ya salió o está cerrado: elegí un viaje abierto.', 'VIAJE_CERRADO');
    }
    await client.query(
      "UPDATE pedido_mayorista SET estado = 'EN_REPARTO', viaje_id = $2, updated_at = now() WHERE id = $1", [id, viajeId]);
    await evento(client, id, 'EN_REPARTO', usuarioId, `Cargado en el viaje #${viajeId}.`);
  });

// EN_REPARTO -> PREPARADO (volvió sin entregar o se quitó del viaje). La mercadería sigue reservada.
export const noEntregado = (id, usuarioId, motivo) =>
  enTransaccion(async (client) => {
    const ped = await bloquearPedido(client, id);
    if (ped.estado !== 'EN_REPARTO') {
      throw new ErrorHttp(409, `Solo se puede devolver un pedido EN_REPARTO (está ${ped.estado}).`, 'ESTADO_INVALIDO');
    }
    await client.query(
      "UPDATE pedido_mayorista SET estado = 'PREPARADO', viaje_id = NULL, updated_at = now() WHERE id = $1", [id]);
    await evento(client, id, 'NO_ENTREGADO', usuarioId,
      `${motivo}${ped.viaje_id ? ` (viaje #${ped.viaje_id})` : ''}`.slice(0, 500));
  });

// EN_REPARTO -> ENTREGADO. Todo en una transacción:
// cargo del total + faltantes pendientes + entrega de faltantes viejos + cobros.
export const entregar = ({ id, usuarioId, entregas, pendientes, cobros, medios, puedeVerificar }) =>
  enTransaccion(async (client) => {
    const ped = await bloquearPedido(client, id);
    if (ped.estado !== 'EN_REPARTO') {
      throw new ErrorHttp(409, `Solo se entrega un pedido EN_REPARTO (está ${ped.estado}).`, 'ESTADO_INVALIDO');
    }
    await cuenta.bloquearCliente(client, ped.cliente_id);   // orden de bloqueo: pedido -> cliente

    const { rows: items } = await client.query(
      'SELECT producto_id, cantidad, precio_unitario FROM pedido_item WHERE pedido_id = $1', [id]);
    const { faltantes } = calcularEntrega(items, entregas);

    // Faltantes de entregas anteriores que se entregan hoy
    let entregadosAntes = 0;
    if (pendientes && pendientes.length) {
      const ids = pendientes.map(p => Number(p.pendiente_id)).filter(Number.isInteger);
      const { rows: disponibles } = await client.query(`
        SELECT id, cantidad_restante FROM pendiente_entrega
        WHERE cliente_id = $1 AND estado = 'PENDIENTE' AND id = ANY($2::int[])
        ORDER BY id FOR UPDATE`, [ped.cliente_id, ids]);
      for (const p of validarPendientes(disponibles, pendientes)) {
        await client.query(`
          UPDATE pendiente_entrega SET
            cantidad_restante = cantidad_restante - $1,
            estado = CASE WHEN cantidad_restante - $1 <= 0 THEN 'ENTREGADO' ELSE 'PENDIENTE' END,
            resuelto_at = CASE WHEN cantidad_restante - $1 <= 0 THEN now() ELSE NULL END
          WHERE id = $2`, [p.cantidad, p.id]);
        entregadosAntes++;
      }
    }

    // Lo cobrado y no entregado queda pendiente para la próxima visita
    for (const f of faltantes) {
      await client.query(`
        INSERT INTO pendiente_entrega (cliente_id, pedido_id, producto_id, cantidad, cantidad_restante, precio_unitario)
        VALUES ($1,$2,$3,$4,$4,$5)`, [ped.cliente_id, id, f.producto_id, f.cantidad, f.precio_unitario]);
    }

    // Se cobra SIEMPRE el total del pedido
    const total = Number(ped.total);
    await cuenta.registrarMovimiento(client, {
      clienteId: ped.cliente_id, pedidoId: id, tipo: 'CARGO', monto: total,
      detalle: `Remito #${remitoTxt(ped.remito_numero)}`, usuarioId
    });

    const falta = redondear(total - await cuenta.cobradoDePedido(client, id));
    const { cobros: lista, total: totalCobros } = normalizarCobros(cobros ?? [], { medios, tope: falta });
    for (const c of lista) {
      await cuenta.registrarCobro(client, {
        clienteId: ped.cliente_id, pedidoId: id, viajeId: ped.viaje_id, cobro: c, usuarioId, puedeVerificar,
        detalle: `Cobro ${c.medio} remito #${remitoTxt(ped.remito_numero)}${c.referencia ? ` · ${c.referencia}` : ''}`
      });
    }

    await client.query("UPDATE pedido_mayorista SET estado = 'ENTREGADO', updated_at = now() WHERE id = $1", [id]);

    const partes = [
      faltantes.length ? `ENTREGA PARCIAL: ${faltantes.length} renglón(es) con faltante, quedan pendientes` : 'Entrega completa',
      entregadosAntes ? `entregó ${entregadosAntes} faltante(s) anterior(es)` : null,
      `cobrado ahora $ ${fmt(totalCobros)}`,
      `saldo del pedido en cuenta corriente $ ${fmt(redondear(falta - totalCobros))}`
    ].filter(Boolean);
    await evento(client, id, faltantes.length ? 'ENTREGADO_PARCIAL' : 'ENTREGADO', usuarioId, partes.join(' · ').slice(0, 500));
  });

// Faltante que el cliente ya no va a recibir: se repone el stock y se le acredita el importe
export const acreditarPendiente = ({ pendienteId, usuarioId, motivo }) =>
  enTransaccion(async (client) => {
    const base = await client.query('SELECT cliente_id FROM pendiente_entrega WHERE id = $1', [pendienteId]);
    if (!base.rowCount) throw new ErrorHttp(404, 'Faltante no encontrado.');

    await cuenta.bloquearCliente(client, base.rows[0].cliente_id);   // orden: cliente -> pendiente

    const { rows } = await client.query(`
      SELECT pe.*, ped.sucursal_origen_id, ped.remito_numero
      FROM pendiente_entrega pe JOIN pedido_mayorista ped ON ped.id = pe.pedido_id
      WHERE pe.id = $1 FOR UPDATE OF pe`, [pendienteId]);
    const p = rows[0];
    if (p.estado !== 'PENDIENTE') throw new ErrorHttp(409, 'Este faltante ya se resolvió.', 'ESTADO_INVALIDO');

    // El stock reservado vuelve a la sucursal de despacho (los combos reponen sus ingredientes)
    const restante = Number(p.cantidad_restante);
    const combos = await cargarCombos(client, [p.producto_id]);
    const req = requerimientos([{ producto_id: p.producto_id, cantidad: restante }], combos);
    for (const pid of [...req.keys()].sort((a, b) => a - b)) {
      await ajustarStock(p.sucursal_origen_id, pid, req.get(pid), client);
    }

    const importe = redondear(restante * Number(p.precio_unitario));
    await client.query(`
      UPDATE pendiente_entrega SET cantidad_restante = 0, estado = 'ACREDITADO', resuelto_at = now()
      WHERE id = $1`, [pendienteId]);

    await cuenta.registrarMovimiento(client, {
      clienteId: p.cliente_id, pedidoId: p.pedido_id, tipo: 'DEVOLUCION', monto: -importe, usuarioId,
      detalle: `Faltante acreditado remito #${remitoTxt(p.remito_numero)}: ${motivo}`.slice(0, 300)
    });
    await evento(client, p.pedido_id, 'FALTANTE_ACREDITADO', usuarioId, `$ ${fmt(importe)} · ${motivo}`.slice(0, 500));
    return { importe };
  });