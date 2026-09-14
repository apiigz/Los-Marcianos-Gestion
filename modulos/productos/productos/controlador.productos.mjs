import * as modelo from './modelo.productos.mjs';
import * as modeloStock from '../stock_sucursal/modelo.stock_sucursal.mjs';

// Obtener todos los productos
export const obtenerTodos = async (req, res) => {
  try {
    const productos = await modelo.obtenerTodos();
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener todos los productos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Obtener un producto por ID
export const obtenerUno = async (req, res) => {
  try {
    const { id } = req.params;
    const producto = await modelo.obtenerUno(id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' })
    }
    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el producto' })
    console.error(error.message);
  }
}

//Crear un producto
export const crearUno = async (req, res) => {
  const dato = req.body;
  try {
    const nuevoProducto = await modelo.crearUno(dato);
    await modeloStock.inicializarStockEnTodasLasSucursales(nuevoProducto.id, 0);

    res.status(201).json(nuevoProducto);

  } catch (error) {
    res.status(500).json({ error: 'Error al crear el producto' });
    console.error(error);
  }
}

//Actualizar un producto por ID
export const actualizarUno = async (req, res) => {
  const { id } = req.params;
  const dato = req.body;

  try {
    const productoActualizado = await modelo.actualizarUno(id, dato);
    res.json(productoActualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el producto' })
  }
}

//Eliminar un producto por ID
export const eliminarUno = async (req, res) => {
  const { id } = req.params;

  try {
    const productoEliminado = await modelo.eliminarUno(id);
    res.json(productoEliminado);
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el producto' })
  }
}

export const obtenerPorCodigo = async (req, res) => {
  try {
    const { codigo } = req.params;
    const producto = await modelo.buscarPorCodigoBarra(codigo);

    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(producto);
  } catch (error) {
    console.error('Error al buscar por código:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Buscar por coincidencia de texto (query param: /buscar?q=coca)
export const buscarProductos = async (req, res) => {
  try {
    const termino = req.query.q?.trim();

    if (!termino || termino.length < 2) {
      return res.json([]); // Si escribió menos de 2 letras, no busca nada
    }

    const resultados = await modelo.buscarPorNombre(termino);
    res.json(resultados);
  } catch (error) {
    console.error('Error al buscar por nombre:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};