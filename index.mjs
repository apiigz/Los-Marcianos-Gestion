import express from 'express'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import { fileURLToPath } from 'url'
import path from 'path'

import rutasAuth from './modulos/auth/auth.rutas.mjs'
import rutasCategorias from './modulos/principales/categorias/rutas.categorias.mjs'
import rutasRoles from './modulos/principales/roles/rutas.roles.mjs'
import rutasUsuarios from './modulos/principales/usuarios/rutas.usuarios.mjs'
import rutasVenta from './modulos/ventas/venta/rutas.venta.mjs'
import rutasCajaFisica from './modulos/turnos/caja_fisica/rutas.caja_fisica.mjs'
import rutasTerminal from './modulos/turnos/terminal/rutas.terminal.mjs'
import rutasProductos from './modulos/productos/productos/rutas.productos.mjs'
import rutasProveedores from './modulos/principales/proveedores/rutas.proveedores.mjs'
import rutasSucursales from './modulos/principales/sucursales/rutas.sucursales.mjs'
import rutasStockSucursales from './modulos/productos/stock_sucursal/rutas.stock_sucursal.mjs'
import rutasTurnos from './modulos/turnos/turno_caja/rutas.turno_caja.mjs'
import rutasVentas from './modulos/ventas/venta/rutas.venta.mjs'

const app = express()

dotenv.config()

app.use(express.json())
app.use(express.static('frontend'))
app.use(cookieParser(process.env.COOKIE_SECRET))
app.use(express.urlencoded({ extended: true }));

const puerto = process.env.BD_PORT || 3000

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

//Todas las rutas que usamos (están todas abiertas, hay que configurar el middleware después para verificar JWT, cookies, y rol)
app.use('/api/v1/categorias', rutasCategorias)
app.use('/api/v1/roles', rutasRoles)
app.use('/api/v1/usuarios', rutasUsuarios)
app.use('/api/v1/auth', rutasAuth)
app.use('/api/v1/venta', rutasVenta)
app.use('/api/v1/caja_fisica', rutasCajaFisica)
app.use('/api/v1/terminal', rutasTerminal)
app.use('/api/v1/productos', rutasProductos)
app.use('/api/v1/proveedores', rutasProveedores)
app.use('/api/v1/sucursales', rutasSucursales)
app.use('/api/v1/stock_sucursal', rutasStockSucursales)
app.use('/api/v1/turno_caja', rutasTurnos)
app.use('/api/v1/ventas', rutasVenta)

app.listen(puerto, () => {
  console.log(`Servidor escuchando en el puerto ${puerto}`)
})