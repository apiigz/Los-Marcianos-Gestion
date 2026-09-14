import { Router } from "express";
import * as controlador from "./controlador.stock_sucursal.mjs";
const rutasStockSucursales = new Router();

rutasStockSucursales.get('/', controlador.obtenerStockSucursales);
rutasStockSucursales.get('/:sucursal_id', controlador.obtenerStockSucursalProducto);
rutasStockSucursales.get('/:id', controlador.obtenerStockProductoSucursal);
rutasStockSucursales.post('/', controlador.crearStockSucursal);
rutasStockSucursales.put('/:id', controlador.actualizarStock);
rutasStockSucursales.delete('/:id', controlador.eliminarStockSucursal);

export default rutasStockSucursales;

