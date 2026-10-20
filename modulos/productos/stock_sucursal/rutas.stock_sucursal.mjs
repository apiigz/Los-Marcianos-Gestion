import { Router } from "express";
import * as controlador from "./controlador.stock_sucursal.mjs";
import { requirePermiso } from "../../middlewares/auth.middleware.mjs";

const rutasStockSucursales = new Router();

rutasStockSucursales.get('/', requirePermiso("stock.ver"), controlador.obtenerStockSucursales);
rutasStockSucursales.get('/:sucursal_id', requirePermiso("stock.ver"), controlador.obtenerStockSucursalProducto);
rutasStockSucursales.get('/:id', requirePermiso("stock.ver"), controlador.obtenerStockProductoSucursal);
rutasStockSucursales.post('/', requirePermiso("stock.ajustar"), controlador.crearStockSucursal);
rutasStockSucursales.put('/:id', requirePermiso("stock.ajustar"), controlador.actualizarStock);
rutasStockSucursales.delete('/:id', requirePermiso("stock.ajustar"), controlador.eliminarStockSucursal);

export default rutasStockSucursales;

