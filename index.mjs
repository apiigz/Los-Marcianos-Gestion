import express from 'express'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import { fileURLToPath } from 'url'
import path from 'path'
import { verifyToken, requirePermiso } from './modulos/middlewares/auth.middleware.mjs'

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
import rutasEstadisticas from './modulos/estadisticas/rutas.estadisticas.mjs'
import rutasDashboard from './modulos/dashboard/rutas.dashboard.mjs'
import rutasConfiguracion from './modulos/configuracion/rutas.configuracion.mjs'

const app = express()
dotenv.config()

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json())
app.use(express.static(path.join(__dirname, 'frontend'))); 
app.use(cookieParser(process.env.COOKIE_SECRET))
app.use(express.urlencoded({ extended: true }));

const puerto = process.env.PORT || 3000

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.use('/api/v1/auth',          rutasAuth)
app.use('/api/v1/categorias',    verifyToken, rutasCategorias)
app.use('/api/v1/roles',         verifyToken, rutasRoles)
app.use('/api/v1/usuarios',      verifyToken, rutasUsuarios)
app.use('/api/v1/caja_fisica',   verifyToken, rutasCajaFisica)
app.use('/api/v1/terminal',      verifyToken, rutasTerminal)
app.use('/api/v1/productos',     verifyToken, rutasProductos)
app.use('/api/v1/proveedores',   verifyToken, rutasProveedores)
app.use('/api/v1/sucursales',    verifyToken, rutasSucursales)
app.use('/api/v1/stock_sucursal',verifyToken, rutasStockSucursales)
app.use('/api/v1/turno_caja',    verifyToken, rutasTurnos)
app.use('/api/v1/ventas',        verifyToken, rutasVenta)
app.use('/api/v1/configuracion', verifyToken, rutasConfiguracion)
app.use('/api/v1/estadisticas',  verifyToken, requirePermiso('estadisticas.ver'), rutasEstadisticas)
app.use('/api/v1/dashboard',     verifyToken, requirePermiso('admin.acceder'), rutasDashboard)

app.listen(puerto, () => {
  console.log(`Servidor escuchando en el puerto ${puerto}`)
})

export default app;