import * as modelo from './modelo.productos.mjs';
import * as modeloStock from '../stock_sucursal/modelo.stock_sucursal.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';

function responderError(res, e, generico) {
  if (e instanceof ErrorHttp) {
    return res.status(e.status).json({ error: e.message, message: e.message, codigo: e.codigo });
  }
  console.error(generico, e);
  return res.status(500).json({ error: generico, message: generico });
}

export const obtenerTodos = async (req, res) => {
  try { res.json(await modelo.obtenerTodos()); }
  catch (e) { responderError(res, e, 'Error al obtener los productos'); }
};

export const obtenerUno = async (req, res) => {
  try {
    const producto = await modelo.obtenerUno(req.params.id);
    if (!producto) throw new ErrorHttp(404, 'Producto no encontrado');
    res.json(producto);
  } catch (e) { responderError(res, e, 'Error al obtener el producto'); }
};

export const crearUno = async (req, res) => {
  try {
    const nuevo = await modelo.crearUno(req.body);
    await modeloStock.inicializarStockEnTodasLasSucursales(nuevo.id, 0);
    res.status(201).json(nuevo);
  } catch (e) { responderError(res, e, 'Error al crear el producto'); }
};

export const actualizarUno = async (req, res) => {
  try {
    const actualizado = await modelo.actualizarUno(req.params.id, req.body);
    if (!actualizado) throw new ErrorHttp(404, 'Producto no encontrado');
    res.json(actualizado);
  } catch (e) { responderError(res, e, 'Error al actualizar el producto'); }
};

export const eliminarUno = async (req, res) => {
  try {
    const eliminado = await modelo.eliminarUno(req.params.id);
    if (!eliminado) throw new ErrorHttp(404, 'Producto no encontrado');
    res.json(eliminado);
  } catch (e) {
    if (e.code === '23503') {
      return responderError(res, new ErrorHttp(409, 'El producto tiene ventas o stock asociado: desactivalo en vez de eliminarlo.'));
    }
    responderError(res, e, 'Error al eliminar el producto');
  }
};

// GET /productos/codigo/:codigo?lista=minorista|mayorista   (código de barras O interno)
export const obtenerPorCodigo = async (req, res) => {
  try {
    const producto = await modelo.buscarProductoPorCodigo(req.params.codigo, req.query.lista);
    if (!producto) throw new ErrorHttp(404, 'Producto no encontrado, inactivo o fuera de la lista.');
    res.json(producto);
  } catch (e) { responderError(res, e, 'Error al buscar por código'); }
};

// GET /productos/buscar?q=coca&lista=minorista
export const buscarProductos = async (req, res) => {
  try {
    const termino = req.query.q?.trim();
    if (!termino || termino.length < 2) return res.json([]);
    res.json(await modelo.buscarPorNombre(termino, req.query.lista));
  } catch (e) { responderError(res, e, 'Error al buscar por nombre'); }
};

export const cambiarEstado = async (req, res) => {
  try {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') throw new ErrorHttp(400, 'El campo "activo" debe ser un booleano (true/false).');
    const producto = await modelo.cambiarEstadoProducto(Number(req.params.id), activo);
    if (!producto) throw new ErrorHttp(404, 'Producto no encontrado.');
    res.json({ message: `Producto ${activo ? 'activado' : 'desactivado'} exitosamente.`, producto });
  } catch (e) { responderError(res, e, 'Error al cambiar el estado del producto'); }
};

export const obtenerComponentes = async (req, res) => {
  try { res.json(await modelo.obtenerComponentesCombo(Number(req.params.id))); }
  catch (e) { responderError(res, e, 'Error al obtener los componentes'); }
};

export const guardarComponentes = async (req, res) => {
  try {
    const { componentes } = req.body;
    if (!Array.isArray(componentes) || componentes.length === 0) {
      throw new ErrorHttp(400, 'Debe especificar al menos un producto ingrediente para la promo.');
    }
    await modelo.guardarComponentesCombo(Number(req.params.id), componentes);
    res.json({ message: 'Componentes guardados exitosamente.' });
  } catch (e) { responderError(res, e, 'Error al guardar los componentes'); }
};