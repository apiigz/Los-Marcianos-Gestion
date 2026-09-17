import * as modelo from './modelo.venta.mjs';

//Obtener todas las ventas
export async function obtenerTodos(req, res){
    try{
        const resultado = await modelo.obtenerTodos();
        res.json(resultado);
    }catch(error){
        console.error(error);
        res.status(500).json({ error: 'Error al obtener las ventas' });
    }
}

//Obtener una venta por id
export async function obtenerUno(req, res){
    const { id } = req.params;
    try{
        const resultado = await modelo.obtenerUno(id);
        res.json(resultado);
    }catch(error){
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la venta' });
    }
}

//Crear una venta
export async function crearUnoooo(req, res){
    const dato = req.body;
    try{
        const resultado = await modelo.crearVentaTransaccional(dato);
        res.status(201).json(resultado);
    }catch(error){
        console.error(error);
        res.status(500).json({ error: 'Error al crear la venta' });
    }
}

//Actualizar una venta por id
export async function actualizarUno(req, res){
    const { id } = req.params;
    const dato = req.body;
    try{
        const resultado = await modelo.actualizarUno(id, dato);
        res.json(resultado);
    }catch(error){
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar la venta' });
    }
}

//Eliminar una venta por id
export async function eliminarUno(req, res){
    const { id } = req.params;
    try{
        const resultado = await modelo.eliminarUno(id);
        res.json(resultado);
    }catch(error){
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar la venta' });
    }
}

export const crearUno = async (req, res) => {
  try {
    const { turno_caja_id, terminal_id, articulos, pagos, empleado_fiado_id, tipo_operacion } = req.body;
    const usuario_id = req.user?.id || req.body.usuario_id;

    if (!articulos || !Array.isArray(articulos) || articulos.length === 0) {
      return res.status(400).json({ error: 'Debe ingresar al menos un artículo.' });
    }

    if (!turno_caja_id || !terminal_id) {
      return res.status(400).json({ error: 'Faltan parámetros de turno y terminal.' });
    }

    const subtotalArticulos = Number(
      articulos.reduce((acum, item) => {
        const cantidad = parseFloat(item.cantidad) || 0;
        const precio = parseFloat(item.precio_unitario) || 0;
        return acum + (Math.round(cantidad * precio * 100) / 100);
      }, 0).toFixed(2)
    );

    let pagosNormalizados = [];
    let montoEfectivo = 0, montoDebito = 0, montoCredito = 0, montoQR = 0, montoFiado = 0;

    if (Array.isArray(pagos)) {
      pagos.forEach(p => {
        const medio = String(p.forma_pago || p.medio_pago || '').toUpperCase();
        const m = parseFloat(p.monto) || 0;
        if (medio === 'FIADO_EMPLEADO') montoFiado += m;
        else if (medio.includes('EFECTIVO')) montoEfectivo += m;
        else if (medio.includes('DEBITO')) montoDebito += m;
        else if (medio.includes('CREDITO')) montoCredito += m;
        else if (medio.includes('QR')) montoQR += m;
      });
    }

    const recargoDebito = parseFloat((montoDebito * 0.10).toFixed(2));
    const recargoCredito = parseFloat((montoCredito * 0.10).toFixed(2));
    const totalGeneral = parseFloat((subtotalArticulos + recargoDebito + recargoCredito).toFixed(2));

    if (montoFiado > 0 || empleado_fiado_id) {
      pagosNormalizados = [{ medio_pago: 'FIADO_EMPLEADO', monto: subtotalArticulos, recargo: 0 }];
    } else {
      pagosNormalizados = [
        { medio_pago: 'EFECTIVO', monto: montoEfectivo, recargo: 0 },
        { medio_pago: 'DEBITO', monto: montoDebito, recargo: recargoDebito },
        { medio_pago: 'CREDITO', monto: montoCredito, recargo: recargoCredito },
        { medio_pago: 'QR', monto: montoQR, recargo: 0 }
      ].filter(p => p.monto !== 0);
    }

    const nuevaVenta = await modelo.crearVentaTransaccional({
      turno_caja_id: Number(turno_caja_id),
      terminal_id: Number(terminal_id),
      usuario_id: Number(usuario_id),
      total: (montoFiado > 0 || empleado_fiado_id) ? subtotalArticulos : totalGeneral,
      articulos,
      pagos: pagosNormalizados,
      empleado_fiado_id: empleado_fiado_id ? Number(empleado_fiado_id) : null,
      tipo_operacion: tipo_operacion || 'VENTA'
    });

    return res.status(201).json({ message: 'Operación registrada con éxito', venta: nuevaVenta });
  } catch (error) {
    console.error('Error en controlador de ventas:', error);
    return res.status(500).json({ error: error.message || 'Error al procesar la venta' });
  }
};

//Obtener ventas... avanzado, no sé como decirle
export const obtenerVentas = async (req, res) => {
  try {
    const ventas = await modelo.obtenerVentasCompletas();
    return res.status(200).json(ventas || []);
  } catch (error) {
    console.error('Error al listar ventas:', error);
    return res.status(500).json({ error: 'Error al obtener el historial de ventas' });
  }
};

export const obtenerPorTurno = async (req, res) => {
  try {
    const { turnoId } = req.params;
    const ventas = await modelo.obtenerVentasPorTurno(Number(turnoId));
    res.status(200).json(ventas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const obtenerDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    const detalle = await modelo.obtenerDetalleVenta(Number(id));
    res.status(200).json(detalle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const reembolsar = async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await modelo.reembolsarVentaTransaccional(Number(id));
    res.status(200).json({ message: 'Venta reembolsada con éxito', ...resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};