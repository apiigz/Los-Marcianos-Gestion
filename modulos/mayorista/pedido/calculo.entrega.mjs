import { ErrorHttp } from '../../utils/errores.mjs';

const r3 = (n) => Number(Number(n).toFixed(3));

// items: [{producto_id, cantidad, precio_unitario}]
// entregas: [{producto_id, cantidad}] o undefined (= se entregó todo)
// Devuelve los faltantes (lo cobrado pero no entregado)
export function calcularEntrega(items, entregas) {
  const entregadas = new Map();

  if (entregas === undefined || entregas === null) {
    for (const i of items) entregadas.set(i.producto_id, r3(i.cantidad));
  } else {
    if (!Array.isArray(entregas)) throw new ErrorHttp(400, 'Formato de entrega inválido.');
    for (const e of entregas) {
      const id = Number(e.producto_id);
      const c = Number(e.cantidad);
      if (!Number.isInteger(id) || !Number.isFinite(c) || c < 0) throw new ErrorHttp(400, 'Cantidad entregada inválida.');
      if (entregadas.has(id)) throw new ErrorHttp(400, 'Hay un producto repetido en la entrega.');
      entregadas.set(id, r3(c));
    }
    const idsPedido = new Set(items.map(i => i.producto_id));
    for (const id of entregadas.keys()) {
      if (!idsPedido.has(id)) throw new ErrorHttp(400, 'La entrega incluye un producto que no está en el pedido.');
    }
    for (const i of items) {
      if (!entregadas.has(i.producto_id)) throw new ErrorHttp(400, 'Falta indicar la cantidad entregada de un renglón.');
    }
  }

  const faltantes = [];
  let hayEntrega = false;
  for (const i of items) {
    const pedida = r3(i.cantidad);
    const entregada = entregadas.get(i.producto_id);
    if (entregada > pedida) {
      throw new ErrorHttp(400, 'No se puede entregar más de lo pedido: cargá un pedido nuevo por la diferencia.');
    }
    if (entregada > 0) hayEntrega = true;
    const falta = r3(pedida - entregada);
    if (falta > 0) faltantes.push({ producto_id: i.producto_id, cantidad: falta, precio_unitario: Number(i.precio_unitario) });
  }
  if (!hayEntrega) throw new ErrorHttp(400, 'No se entregó nada: usá "No se pudo entregar".');
  return { faltantes };
}

// disponibles: filas de pendiente_entrega del cliente; solicitados: [{pendiente_id, cantidad}]
export function validarPendientes(disponibles, solicitados) {
  if (!solicitados || !solicitados.length) return [];
  const porId = new Map(disponibles.map(p => [p.id, p]));
  const vistos = new Set();
  const salida = [];

  for (const s of solicitados) {
    const id = Number(s.pendiente_id);
    const cantidad = r3(s.cantidad);
    const p = porId.get(id);
    if (!p) throw new ErrorHttp(400, 'Hay un faltante que no existe, no es de este cliente o ya se resolvió.');
    if (vistos.has(id)) throw new ErrorHttp(400, 'Hay un faltante repetido en la entrega.');
    if (!(cantidad > 0) || cantidad > r3(p.cantidad_restante)) throw new ErrorHttp(400, 'Cantidad de faltante inválida.');
    vistos.add(id);
    salida.push({ id, cantidad });
  }
  return salida;
}