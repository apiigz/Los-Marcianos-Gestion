import * as modelo from './modelo.pedido.mjs';
import * as modeloProductos from '../../productos/productos/modelo.productos.mjs';
import * as modeloConfig from '../../configuracion/modelo.configuracion.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { agruparLineas, redondear } from './calculo.pedido.mjs';

function responderError(res, e, generico) {
  if (e instanceof ErrorHttp) {
    return res.status(e.status).json({ error: e.message, message: e.message, codigo: e.codigo });
  }
  console.error(generico, e);
  return res.status(500).json({ error: generico });
}

const puede = (user, p) => user.es_admin || user.permisos.includes(p);
const aEntero = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// Precio e IVA SIEMPRE desde la base (precio mayorista único)
async function valorizar(articulos) {
  if (!Array.isArray(articulos) || !articulos.length) {
    throw new ErrorHttp(400, 'El pedido debe tener al menos un renglón.');
  }
  const agrupadas = agruparLineas(articulos);
  const productos = new Map(
    (await modeloProductos.obtenerPorIds(agrupadas.map(l => l.producto_id))).map(p => [p.id, p]));

  const lineas = agrupadas.map(l => {
    const p = productos.get(l.producto_id);
    if (!p || !p.activo) throw new ErrorHttp(400, 'Hay un producto inexistente o inactivo en el pedido.');
    if (!p.vende_mayorista) throw new ErrorHttp(400, `"${p.descripcion}" no está habilitado para venta mayorista.`);
    const precio = Number(p.precio_mayorista);
    if (!(precio > 0)) throw new ErrorHttp(400, `"${p.descripcion}" no tiene precio mayorista cargado.`);
    return {
      producto_id: p.id, cantidad: l.cantidad, precio_unitario: precio,
      alicuota_iva: Number(p.alicuota_iva), subtotal: redondear(l.cantidad * precio)
    };
  });
  const total = redondear(lineas.reduce((a, l) => a + l.subtotal, 0));
  return { lineas, total };
}

// GET /mayorista/pedidos/opciones
export const obtenerOpciones = async (req, res) => {
  try {
    const canales = await modeloConfig.obtenerValor('mayorista.canales', 'TELEFONO,WHATSAPP,PRESENCIAL,EN_ENTREGA');
    res.json(await modelo.obtenerOpciones(canales));
  } catch (e) { responderError(res, e, 'Error al obtener las opciones'); }
};

export const listar = async (req, res) => {
  try { res.json(await modelo.listar({ estado: req.query.estado })); }
  catch (e) { responderError(res, e, 'Error al listar los pedidos'); }
};

export const obtener = async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    if (!id) throw new ErrorHttp(400, 'ID inválido.');
    const p = await modelo.obtener(id);
    if (!p) throw new ErrorHttp(404, 'Pedido no encontrado.');
    res.json(p);
  } catch (e) { responderError(res, e, 'Error al obtener el pedido'); }
};

// POST /mayorista/pedidos   { cliente_id, sucursal_origen_id?, canal, observaciones?, articulos:[{producto_id,cantidad}] }
export const crear = async (req, res) => {
  try {
    const clienteId = aEntero(req.body.cliente_id);
    if (!clienteId) throw new ErrorHttp(400, 'Elegí un cliente.');

    const opciones = await modelo.obtenerOpciones(
      await modeloConfig.obtenerValor('mayorista.canales', 'TELEFONO,WHATSAPP,PRESENCIAL,EN_ENTREGA'));
    const canal = String(req.body.canal || '').toUpperCase();
    if (!opciones.canales.includes(canal)) throw new ErrorHttp(400, 'Canal de pedido inválido.');

    const sucursalId = aEntero(req.body.sucursal_origen_id) ?? opciones.sucursal_por_defecto_id;
    if (!sucursalId) throw new ErrorHttp(400, 'No hay sucursal de despacho: marcá un depósito central o elegí una.');

    const obs = String(req.body.observaciones ?? '').trim();
    if (obs.length > 500) throw new ErrorHttp(400, 'Las observaciones superan los 500 caracteres.');

    const { lineas, total } = await valorizar(req.body.articulos);

    const id = await modelo.crear({
      clienteId, sucursalId, canal, observaciones: obs || null, lineas, total,
      usuarioId: req.user.id, puedeExceder: puede(req.user, 'mayorista.exceder_limite')
    });
    res.status(201).json(await modelo.obtener(id));
  } catch (e) { responderError(res, e, 'Error al crear el pedido'); }
};

// PUT /mayorista/pedidos/:id/items   { articulos }
export const reemplazarItems = async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    if (!id) throw new ErrorHttp(400, 'ID inválido.');
    const { lineas, total } = await valorizar(req.body.articulos);
    await modelo.reemplazarItems({
      id, lineas, total, usuarioId: req.user.id,
      puedeExceder: puede(req.user, 'mayorista.exceder_limite')
    });
    res.json(await modelo.obtener(id));
  } catch (e) { responderError(res, e, 'Error al modificar el pedido'); }
};

export const preparar = async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    if (!id) throw new ErrorHttp(400, 'ID inválido.');

    const forzar = req.body?.forzar === true;
    let motivo = null;
    if (forzar) {
      if (!puede(req.user, 'mayorista.preparar_sin_stock')) {
        throw new ErrorHttp(403, 'No tenés permiso para preparar pedidos sin stock suficiente.');
      }
      motivo = String(req.body?.motivo ?? '').trim();
      if (motivo.length < 3 || motivo.length > 200) {
        throw new ErrorHttp(400, 'Indicá el motivo (3 a 200 caracteres).');
      }
    }

    await modelo.preparar(id, req.user.id, { forzar, motivo });
    res.json(await modelo.obtener(id));
  } catch (e) { responderError(res, e, 'Error al preparar el pedido'); }
};

// POST /mayorista/pedidos/:id/cancelar   { motivo }
export const cancelar = async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    if (!id) throw new ErrorHttp(400, 'ID inválido.');
    const motivo = String(req.body.motivo ?? '').trim();
    if (motivo.length < 3 || motivo.length > 300) throw new ErrorHttp(400, 'Indicá el motivo de la cancelación (3 a 300 caracteres).');
    await modelo.cancelar({
      id, usuarioId: req.user.id, motivo,
      puedeCancelarPreparado: puede(req.user, 'mayorista.preparar')
    });
    res.json(await modelo.obtener(id));
  } catch (e) { responderError(res, e, 'Error al cancelar el pedido'); }
};