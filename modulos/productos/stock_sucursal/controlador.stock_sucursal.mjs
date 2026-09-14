import * as modelo from './modelo.stock_sucursal.mjs'

//Obtener el stock de TODAS las sucursales
export async function obtenerStockSucursales(req, res) {
    try {
        const stock = await modelo.obtenerStockSucursales();
        res.json(stock);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el stock" });
    }
}

//Obtener el stock de un producto en TODAS las sucursales
export async function obtenerStockProductoSucursales(req, res) {
    try {
        const stock = await modelo.obtenerStockProductoSucursales(req.params.producto_id);
        res.json(stock);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el stock" });
    }
}

//Obtener el stock de todos los productos de una sucursal
export async function obtenerStockSucursalProducto(req, res) {
    try {
        const stock = await modelo.obtenerStockSucursalProducto(req.params.sucursal_id);
        res.json(stock);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener el stock" });
    }
}

//Obtener el stock de un producto en una sucursal
export async function obtenerStockProductoSucursal(req, res) {
    try {
        const stock = await modelo.obtenerStockProductoSucursal(req.params.producto_id, req.params.sucursal_id);
        res.json(stock);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el stock" });
    }
}

//Crear el stock inicial de un producto en una sucursal
export async function crearStockSucursal(req, res) {
    try {
        const stock = await modelo.crearStockSucursal(req.body.sucursal_id, req.body.producto_id, req.body.cantidad_disponible, req.body.stock_minimo);
        res.json(stock);
    } catch (error) {
        res.status(500).json({ error: "Error al crear el stock" });
    }
}

//Actualizar el stock de un producto en una sucursal
export async function actualizarStockSucursal(req, res) {
    try {
        const stock = await modelo.actualizarStockSucursal(req.body.sucursal_id, req.body.producto_id, req.body.cantidad_disponible, req.body.stock_minimo);
        res.json(stock);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar el stock" });
    }
}

//Actualizar stock (el qué anda)
export async function actualizarStock(req, res) {
  const { id } = req.params; // ID de la tabla stock_sucursal
  const { cantidad_disponible, stock_minimo } = req.body;

  try {
    const stockActualizado = await modelo.actualizarStockPorId(
      Number(id), 
      Number(cantidad_disponible), 
      Number(stock_minimo)
    );

    if (!stockActualizado) {
      return res.status(404).json({ error: "Registro de stock no encontrado" });
    }

    return res.status(200).json(stockActualizado);
  } catch (error) {
    console.error("Error al actualizar stock:", error);
    return res.status(500).json({ error: "Error interno al actualizar el stock" });
  }
}

//Eliminar el stock de un producto en una sucursal
export async function eliminarStockSucursal(req, res) {
    try {
        const stock = await modelo.eliminarStockSucursal(req.params.producto_id, req.params.sucursal_id);
        res.json(stock);
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar el stock" });
    }
}