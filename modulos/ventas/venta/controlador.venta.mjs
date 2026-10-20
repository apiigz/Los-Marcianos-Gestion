import * as modelo from './modelo.venta.mjs';
import * as modeloProductos from '../../productos/productos/modelo.productos.mjs';
import * as modeloConfig from '../../configuracion/modelo.configuracion.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';
import { calcularPagos, redondear } from './calculo.venta.mjs';

function responderError(res, e, generico) {
  if (e instanceof ErrorHttp) {
    return res.status(e.status).json({ error: e.message, message: e.message, codigo: e.codigo });
  }
  console.error(generico, e);
  return res.status(500).json({ error: generico });
}

// GET /ventas  (historial completo del admin)
export const obtenerVentas = async (req, res) => {
  try {
    res.status(200).json((await modelo.obtenerVentasCompletas()) || []);
  } catch (e) { responderError(res, e, 'Error al obtener el historial de ventas'); }
};

// GET /ventas/turno/:turnoId
export const obtenerPorTurno = async (req, res) => {
  try {
    res.status(200).json(await modelo.obtenerVentasPorTurno(Number(req.params.turnoId)));
  } catch (e) { responderError(res, e, 'Error al obtener las ventas del turno'); }
};

// GET /ventas/:id/detalle
export const obtenerDetalle = async (req, res) => {
  try {
    res.status(200).json(await modelo.obtenerDetalleVenta(Number(req.params.id)));
  } catch (e) { responderError(res, e, 'Error al obtener el detalle'); }
};

// POST /ventas
// Body: { turno_caja_id, terminal_id, articulos: [{producto_id, cantidad}], pagos: [...], empleado_fiado_id? }
export const crearUno = async (req, res) => {
  try {
    const { turno_caja_id, terminal_id, articulos, pagos = [], empleado_fiado_id } = req.body;
    const user = req.user;
    const puede = (p) => user.es_admin || user.permisos.includes(p);

    if (!Array.isArray(articulos) || articulos.length === 0) {
      throw new ErrorHttp(400, 'Debe ingresar al menos un artículo.');
    }
    if (!Number.isInteger(Number(turno_caja_id)) || !Number.isInteger(Number(terminal_id))) {
      throw new ErrorHttp(400, 'Faltan parámetros de turno y terminal.');
    }

    // 1) Precios e IVA desde la base
    const ids = [...new Set(articulos.map(a => Number(a.producto_id ?? a.id)))];
    if (ids.some(id => !Number.isInteger(id) || id <= 0)) throw new ErrorHttp(400, 'Producto inválido en el carrito.');
    const productos = new Map((await modeloProductos.obtenerPorIds(ids)).map(p => [p.id, p]));

    let hayDevolucion = false;
    const lineas = articulos.map(a => {
      const p = productos.get(Number(a.producto_id ?? a.id));
      if (!p || !p.activo) throw new ErrorHttp(400, 'Hay un producto inexistente o inactivo en el carrito.');

      const cantidad = Number(parseFloat(a.cantidad).toFixed(3));
      if (!Number.isFinite(cantidad) || cantidad === 0) throw new ErrorHttp(400, 'Cantidad inválida.');
      if (cantidad < 0) hayDevolucion = true;

      const precio = Number(p.precio_minorista);
      return {
        producto_id: p.id,
        cantidad,
        precio_unitario: precio,
        alicuota_iva: Number(p.alicuota_iva),
        subtotal: redondear(cantidad * precio)
      };
    });

    if (hayDevolucion && !puede('venta.devolucion')) {
      throw new ErrorHttp(403, 'No tenés permiso para registrar devoluciones.');
    }

    const subtotal = redondear(lineas.reduce((acc, l) => acc + l.subtotal, 0));
    if (subtotal === 0) throw new ErrorHttp(400, 'El total no puede ser cero.');

    // 2) Pagos y total
    let pagosFinal, total, tipoOperacion = 'VENTA';

    if (empleado_fiado_id) {
      if (!puede('venta.fiado')) throw new ErrorHttp(403, 'No tenés permiso para cargar al fiado.');
      if (subtotal < 0) throw new ErrorHttp(400, 'No se puede fiar una devolución.');
      total = subtotal;
      pagosFinal = [{ medio_pago: 'FIADO_EMPLEADO', monto: subtotal, recargo: 0, recargo_porcentaje: 0 }];
    } else if (subtotal < 0) {
      total = subtotal;
      tipoOperacion = 'DEVOLUCION_PARCIAL';
      pagosFinal = [{ medio_pago: 'EFECTIVO', monto: subtotal, recargo: 0, recargo_porcentaje: 0 }];
    } else {
      const cfg = await modeloConfig.obtenerRecargos();
      ({ pagosFinal, total } = calcularPagos({ subtotal, pagos, cfg, userId: user.id, puede }));
    }

    // 3) Persistir
    const venta = await modelo.crearVentaTransaccional({
      turno_caja_id: Number(turno_caja_id),
      terminal_id: Number(terminal_id),
      usuario_id: user.id,
      total,
      articulos: lineas,
      pagos: pagosFinal,
      empleado_fiado_id: empleado_fiado_id ? Number(empleado_fiado_id) : null,
      tipo_operacion: tipoOperacion
    });

    res.status(201).json({ message: 'Operación registrada con éxito', venta });
  } catch (e) {
    responderError(res, e, 'Error al procesar la venta');
  }
};

// POST /ventas/:id/reembolso   { terminal_id }
export const reembolsar = async (req, res) => {
  try {
    const terminalId = Number(req.body?.terminal_id);
    if (!Number.isInteger(terminalId) || terminalId <= 0) {
      throw new ErrorHttp(400, 'Falta la terminal que realiza el reembolso.');
    }
    const resultado = await modelo.reembolsarVentaTransaccional(Number(req.params.id), terminalId);
    res.status(200).json({ message: 'Venta reembolsada con éxito', ...resultado });
  } catch (e) { responderError(res, e, 'Error al procesar el reembolso'); }
};