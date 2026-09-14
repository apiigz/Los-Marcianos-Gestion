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
    const { turno_caja_id, terminal_id, articulos, pagos } = req.body;

    const usuario_id = req.user?.id || req.body.usuario_id;

    if (!articulos || !Array.isArray(articulos) || articulos.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un artículo para la venta.' });
    }

    if (!turno_caja_id || !terminal_id) {
      return res.status(400).json({ error: 'Debe proporcionar turno_caja_id y terminal_id.' });
    }

    // 1. Calcular el subtotal de artículos en el servidor
    const subtotalArticulos = Number(
      articulos.reduce((acum, item) => {
        const cantidad = parseFloat(item.cantidad) || 0;
        const precio = parseFloat(item.precio_unitario) || 0;
        const subtotalLinea = Math.round(cantidad * precio * 100) / 100;
        return acum + subtotalLinea;
      }, 0).toFixed(2)
    );

    // 2. Extraer los montos admitiendo tanto Objeto { efectivo: X } como Array [ { forma_pago, monto } ]
    let montoEfectivo = 0;
    let montoDebito = 0;
    let montoCredito = 0;
    let montoQR = 0;

    if (Array.isArray(pagos)) {
      for (const p of pagos) {
        const metodo = String(p.forma_pago || p.medio_pago || p.metodo || '').toUpperCase();
        const monto = parseFloat(p.monto) || 0;

        if (metodo.includes('EFECTIVO')) montoEfectivo += monto;
        else if (metodo.includes('DEBITO') || metodo.includes('DÉBITO')) montoDebito += monto;
        else if (metodo.includes('CREDITO') || metodo.includes('CRÉDITO')) montoCredito += monto;
        else if (metodo.includes('QR') || metodo.includes('TRANSFERENCIA')) montoQR += monto;
      }
    } else if (typeof pagos === 'object' && pagos !== null) {
      montoEfectivo = parseFloat(pagos.efectivo) || 0;
      montoDebito = parseFloat(pagos.debito) || 0;
      montoCredito = parseFloat(pagos.credito) || 0;
      montoQR = parseFloat(pagos.qr) || 0;
    }

    // 3. Suma de bases ingresadas (sin recargo)
    const baseTotalAsignada = parseFloat((montoEfectivo + montoDebito + montoCredito + montoQR).toFixed(2));

    if (baseTotalAsignada < subtotalArticulos) {
      return res.status(400).json({
        message: `Los medios de pago ingresados ($${baseTotalAsignada}) no cubren el total de los productos ($${subtotalArticulos})`
      });
    }

    // 4. Calcular recargos comerciales (10% débito y crédito)
    const recargoDebito = parseFloat((montoDebito * 0.10).toFixed(2));
    const recargoCredito = parseFloat((montoCredito * 0.10).toFixed(2));
    const recargosTotales = parseFloat((recargoDebito + recargoCredito).toFixed(2));
    const totalGeneral = parseFloat((subtotalArticulos + recargosTotales).toFixed(2));

    // 5. Preparar array de pagos para guardar
    const pagosParaGuardar = [
      { medio_pago: 'EFECTIVO', monto: montoEfectivo, recargo: 0 },
      { medio_pago: 'DEBITO', monto: montoDebito, recargo: recargoDebito },
      { medio_pago: 'CREDITO', monto: montoCredito, recargo: recargoCredito },
      { medio_pago: 'QR', monto: montoQR, recargo: 0 }
    ].filter(p => p.monto > 0);

    // 6. Ejecutar la transacción
    const nuevaVenta = await modelo.crearVentaTransaccional({
      turno_caja_id,
      terminal_id,
      usuario_id,
      total: totalGeneral,
      articulos,
      pagos: pagosParaGuardar
    });

    return res.status(201).json({
      message: 'Venta creada exitosamente',
      venta: nuevaVenta
    });

  } catch (error) {
    console.error('Error en controlador de ventas al crear:', error);
    return res.status(500).json({ error: error.message || 'Error interno al crear la venta' });
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