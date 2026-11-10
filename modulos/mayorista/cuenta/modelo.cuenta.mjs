import pool from '../../bd/conexion.bd.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { enTransaccion } from '../../utils/transaccion.mjs';
import { redondear } from '../../utils/dinero.mjs';
import { normalizarCobros } from './calculo.cuenta.mjs';

const ESTADOS_ABIERTOS = ['PENDIENTE', 'PREPARADO', 'EN_REPARTO'];

// ---------- Funciones que reutilizan otros módulos dentro de SU transacción (reciben client) ----------

// Bloquear al cliente serializa todo lo que toca su cuenta
export async function bloquearCliente(client, id) {
  const { rows } = await client.query('SELECT * FROM cliente WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new ErrorHttp(404, 'El cliente no existe.');
  return rows[0];
}

export async function saldoCliente(db, clienteId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(monto), 0) AS saldo FROM movimiento_cuenta_cliente WHERE cliente_id = $1', [clienteId]);
  return redondear(rows[0].saldo);
}

export async function cobradoDePedido(client, pedidoId) {
  const { rows } = await client.query(
    'SELECT COALESCE(SUM(monto), 0) AS cobrado FROM cobro_cliente WHERE pedido_id = $1', [pedidoId]);
  return redondear(rows[0].cobrado);
}

export async function registrarMovimiento(client, { clienteId, pedidoId = null, tipo, monto, detalle, usuarioId, cobroId = null, reembolsoId = null }) {
  await client.query(`
    INSERT INTO movimiento_cuenta_cliente (cliente_id, pedido_id, tipo, monto, detalle, usuario_id, cobro_id, reembolso_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [clienteId, pedidoId, tipo, monto, detalle, usuarioId, cobroId, reembolsoId]);
}

// Guarda el cobro y su pago en el libro. La transferencia exige permiso de verificación.
// viajeId: el cobro se hizo durante el reparto (entra en la rendición de ese viaje).
export async function registrarCobro(client, { clienteId, pedidoId = null, viajeId = null, cobro, usuarioId, puedeVerificar, detalle }) {
  let verificador = null;
  if (cobro.medio === 'TRANSFERENCIA') {
    if (!puedeVerificar) {
      throw new ErrorHttp(403, 'Registrar una transferencia requiere permiso para verificarla.');
    }
    const cta = await client.query('SELECT 1 FROM cuenta_cobro WHERE id = $1 AND activa', [cobro.cuenta_cobro_id]);
    if (!cta.rowCount) throw new ErrorHttp(400, 'La cuenta de cobro indicada no existe o está inactiva.');
    verificador = usuarioId;
  }

  const { rows } = await client.query(`
    INSERT INTO cobro_cliente (cliente_id, pedido_id, viaje_id, medio, monto, cuenta_cobro_id,
                               verificado_por, verificado_at, referencia, cobrado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7::int IS NULL THEN NULL ELSE now() END,$8,$9)
    RETURNING id`,
    [clienteId, pedidoId, viajeId, cobro.medio, cobro.monto, cobro.cuenta_cobro_id, verificador, cobro.referencia, usuarioId]);

  await registrarMovimiento(client, {
    clienteId, pedidoId, tipo: 'PAGO', monto: -cobro.monto, usuarioId, cobroId: rows[0].id,
    detalle: detalle || `Cobro ${cobro.medio}${cobro.referencia ? ` · ${cobro.referencia}` : ''}`
  });
  return rows[0].id;
}

// ---------- Operaciones propias del módulo ----------

// Pago suelto: baja el saldo sin asignarse a un remito
export const registrarPagoACuenta = ({ clienteId, cobros, medios, usuarioId, puedeVerificar }) =>
  enTransaccion(async (client) => {
    await bloquearCliente(client, clienteId);
    const { cobros: lista } = normalizarCobros(cobros, { medios });
    if (!lista.length) throw new ErrorHttp(400, 'Indicá al menos un cobro.');
    for (const c of lista) {
      await registrarCobro(client, { clienteId, cobro: c, usuarioId, puedeVerificar, detalle: `Pago a cuenta ${c.medio}${c.referencia ? ` · ${c.referencia}` : ''}` });
    }
    return { saldo: await saldoCliente(client, clienteId) };
  });

// Cobro contra un pedido (anticipo, en la entrega o después)
export const cobrarPedido = ({ pedidoId, cobros, medios, usuarioId, puedeVerificar }) =>
  enTransaccion(async (client) => {
    const { rows } = await client.query(
      'SELECT id, cliente_id, total, estado, remito_numero, viaje_id FROM pedido_mayorista WHERE id = $1 FOR UPDATE', [pedidoId]);
    const ped = rows[0];
    if (!ped) throw new ErrorHttp(404, 'Pedido no encontrado.');
    if (!['PREPARADO', 'EN_REPARTO', 'ENTREGADO'].includes(ped.estado)) {
      throw new ErrorHttp(409, 'Solo se cobran pedidos preparados, en reparto o entregados.', 'ESTADO_INVALIDO');
    }

    await bloquearCliente(client, ped.cliente_id);
    const falta = redondear(Number(ped.total) - await cobradoDePedido(client, pedidoId));
    const { cobros: lista } = normalizarCobros(cobros, { medios, tope: falta });
    if (!lista.length) throw new ErrorHttp(400, 'Indicá al menos un cobro.');

    const remito = String(ped.remito_numero).padStart(6, '0');
    for (const c of lista) {
        await registrarCobro(client, { clienteId: ped.cliente_id, pedidoId,
            viajeId: ped.estado === 'EN_REPARTO' ? ped.viaje_id : null,   // solo lo cobrado en la calle se rinde
            cobro: c, usuarioId, puedeVerificar,
            detalle: `Cobro ${c.medio} remito #${remito}${c.referencia ? ` · ${c.referencia}` : ''}` });
    }
    return { falta_cobrar: redondear(falta - lista.reduce((a, c) => a + c.monto, 0)) };
  });

// Corrección manual con motivo. monto > 0: el cliente debe más; monto < 0: se le descuenta.
export const ajustar = ({ clienteId, monto, motivo, usuarioId }) =>
  enTransaccion(async (client) => {
    await bloquearCliente(client, clienteId);
    await registrarMovimiento(client, { clienteId, tipo: 'AJUSTE', monto, detalle: motivo, usuarioId });
    return { saldo: await saldoCliente(client, clienteId) };
  });

// ---------- Lecturas ----------
export async function resumen() {
  const { rows } = await pool.query(`
    SELECT c.id, c.razon_social, c.limite_credito, c.activo,
           COALESCE(SUM(m.monto), 0) AS saldo
    FROM cliente c LEFT JOIN movimiento_cuenta_cliente m ON m.cliente_id = c.id
    GROUP BY c.id
    HAVING c.activo OR COALESCE(SUM(m.monto), 0) <> 0
    ORDER BY saldo DESC, c.razon_social`);
  return rows;
}

export async function obtenerCuenta(clienteId) {
  const cli = (await pool.query('SELECT * FROM cliente WHERE id = $1', [clienteId])).rows[0];
  if (!cli) return null;

  const saldo = await saldoCliente(pool, clienteId);
  const comprometido = redondear((await pool.query(
    'SELECT COALESCE(SUM(total), 0) AS t FROM pedido_mayorista WHERE cliente_id = $1 AND estado = ANY($2::text[])',
    [clienteId, ESTADOS_ABIERTOS])).rows[0].t);

  const movimientos = (await pool.query(`
    SELECT m.id, m.tipo, m.monto, m.detalle, m.created_at, p.remito_numero,
           u.nombre || ' ' || u.apellido AS usuario
    FROM movimiento_cuenta_cliente m
    LEFT JOIN pedido_mayorista p ON p.id = m.pedido_id
    JOIN usuario u ON u.id = m.usuario_id
    WHERE m.cliente_id = $1 ORDER BY m.id DESC LIMIT 300`, [clienteId])).rows;

  const pendientes = (await pool.query(`
    SELECT pe.id, pe.cantidad_restante, pe.precio_unitario, pr.descripcion, ped.remito_numero
    FROM pendiente_entrega pe
    JOIN producto pr ON pr.id = pe.producto_id
    JOIN pedido_mayorista ped ON ped.id = pe.pedido_id
    WHERE pe.cliente_id = $1 AND pe.estado = 'PENDIENTE' ORDER BY pe.id`, [clienteId])).rows;

  return {
    cliente: cli, saldo, comprometido,
    disponible: cli.limite_credito === null ? null : redondear(Number(cli.limite_credito) - saldo - comprometido),
    movimientos, pendientes
  };
}

export async function opcionesCobro() {
  const { rows } = await pool.query('SELECT id, nombre, alias, titular FROM cuenta_cobro WHERE activa ORDER BY nombre');
  return rows;
}

// ---------- Devolución de saldo a favor ----------

// Resta el saldo en el momento; el encargado transfiere después y lo marca pagado
export const solicitarReembolso = ({ clienteId, monto, medio, motivo, usuarioId }) =>
  enTransaccion(async (client) => {
    await bloquearCliente(client, clienteId);
    const aFavor = redondear(-(await saldoCliente(client, clienteId)));
    if (!(aFavor > 0)) throw new ErrorHttp(409, 'El cliente no tiene saldo a favor.');
    if (monto > aFavor + 0.004) {
      throw new ErrorHttp(409, `Solo tiene $ ${aFavor.toLocaleString('es-AR', { minimumFractionDigits: 2 })} a favor.`);
    }

    const { rows } = await client.query(`
      INSERT INTO reembolso_cliente (cliente_id, monto, medio, motivo, solicitado_por)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`, [clienteId, monto, medio, motivo, usuarioId]);

    await registrarMovimiento(client, {
      clienteId, tipo: 'REEMBOLSO', monto, usuarioId, reembolsoId: rows[0].id,
      detalle: `Devolución #${rows[0].id} (${medio}): ${motivo}`.slice(0, 300)
    });
    return { id: rows[0].id, saldo: await saldoCliente(client, clienteId) };
  });

export const pagarReembolso = ({ id, cuentaCobroId, referencia, usuarioId }) =>
  enTransaccion(async (client) => {
    const { rows } = await client.query('SELECT * FROM reembolso_cliente WHERE id = $1 FOR UPDATE', [id]);
    const r = rows[0];
    if (!r) throw new ErrorHttp(404, 'Devolución no encontrada.');
    if (r.estado !== 'PENDIENTE') throw new ErrorHttp(409, `La devolución ya está ${r.estado}.`, 'ESTADO_INVALIDO');

    let cuenta = null;
    if (r.medio === 'TRANSFERENCIA') {
      const c = await client.query('SELECT 1 FROM cuenta_cobro WHERE id = $1 AND activa', [cuentaCobroId]);
      if (!c.rowCount) throw new ErrorHttp(400, 'Indicá desde qué cuenta se hizo la transferencia.');
      cuenta = cuentaCobroId;
    }
    await client.query(`
      UPDATE reembolso_cliente
      SET estado = 'PAGADO', cuenta_cobro_id = $2, referencia = $3, pagado_por = $4, pagado_at = now()
      WHERE id = $1`, [id, cuenta, referencia, usuarioId]);
  });

// Solo mientras esté pendiente: devuelve el saldo a favor al cliente
export const cancelarReembolso = ({ id, motivo, usuarioId }) =>
  enTransaccion(async (client) => {
    const base = await client.query('SELECT cliente_id FROM reembolso_cliente WHERE id = $1', [id]);
    if (!base.rowCount) throw new ErrorHttp(404, 'Devolución no encontrada.');
    await bloquearCliente(client, base.rows[0].cliente_id);   // mismo orden que al solicitar: cliente primero

    const { rows } = await client.query('SELECT * FROM reembolso_cliente WHERE id = $1 FOR UPDATE', [id]);
    const r = rows[0];
    if (r.estado !== 'PENDIENTE') throw new ErrorHttp(409, `Solo se cancela una devolución pendiente (está ${r.estado}).`, 'ESTADO_INVALIDO');

    await client.query("UPDATE reembolso_cliente SET estado = 'CANCELADO' WHERE id = $1", [id]);
    await registrarMovimiento(client, {
      clienteId: r.cliente_id, tipo: 'AJUSTE', monto: -Number(r.monto), usuarioId, reembolsoId: id,
      detalle: `Devolución #${id} cancelada: ${motivo}`.slice(0, 300)
    });
  });

export async function listarReembolsos({ estado }) {
  const { rows } = await pool.query(`
    SELECT r.id, r.cliente_id, c.razon_social, r.monto, r.medio, r.motivo, r.estado, r.referencia,
           r.created_at, r.pagado_at, u.nombre || ' ' || u.apellido AS solicitado_por_nombre
    FROM reembolso_cliente r
    JOIN cliente c ON c.id = r.cliente_id
    JOIN usuario u ON u.id = r.solicitado_por
    WHERE ($1::text IS NULL OR r.estado = $1)
    ORDER BY r.id DESC LIMIT 100`, [estado || null]);
  return rows;
}