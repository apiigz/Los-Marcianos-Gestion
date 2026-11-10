import { ErrorHttp } from '../../utils/errores.mjs';

export const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Valida las líneas que manda el front y junta las repetidas
export function agruparLineas(articulos) {
  const m = new Map();
  for (const a of articulos) {
    const id = Number(a.producto_id ?? a.id);
    const cant = Number(a.cantidad);
    if (!Number.isInteger(id) || id <= 0) throw new ErrorHttp(400, 'Producto inválido en el pedido.');
    if (!Number.isFinite(cant) || cant <= 0 || cant > 99999) {
      throw new ErrorHttp(400, 'Cantidad inválida: debe ser mayor a 0.');
    }
    m.set(id, Number(((m.get(id) || 0) + cant).toFixed(3)));
  }
  return [...m].map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
}

// Cuánto stock de cada producto hay que mover (los combos se expanden a sus ingredientes)
// combos: Map(comboId -> [{ producto_ingrediente_id, cantidad }])
export function requerimientos(lineas, combos) {
  const req = new Map();
  const sumar = (id, c) => req.set(id, Number(((req.get(id) || 0) + c).toFixed(3)));
  for (const l of lineas) {
    const ingredientes = combos.get(l.producto_id);
    if (ingredientes?.length) {
      for (const i of ingredientes) sumar(i.producto_ingrediente_id, Number(i.cantidad) * l.cantidad);
    } else {
      sumar(l.producto_id, l.cantidad);
    }
  }
  return req;
}