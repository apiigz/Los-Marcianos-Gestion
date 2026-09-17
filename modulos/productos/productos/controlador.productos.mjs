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

export const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo "activo" debe ser un booleano (true/false).' });
    }

    const productoActualizado = await modelo.cambiarEstadoProducto(Number(id), activo);

    if (!productoActualizado) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    return res.status(200).json({
      message: `Producto ${activo ? 'activado' : 'desactivado'} exitosamente.`,
      producto: productoActualizado
    });
  } catch (error) {
    console.error('Error al cambiar estado de producto:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
};

export const obtenerComponentes = async (req, res) => {
  try {
    const { id } = req.params;
    const componentes = await modelo.obtenerComponentesCombo(Number(id));
    res.status(200).json(componentes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const guardarComponentes = async (req, res) => {
  try {
    const { id } = req.params;
    const { componentes } = req.body; // Array de { producto_ingrediente_id, cantidad }

    if (!Array.isArray(componentes) || componentes.length === 0) {
      return res.status(400).json({ error: 'Debe especificar al menos un producto ingrediente para la promo.' });
    }

    await modelo.guardarComponentesCombo(Number(id), componentes);
    res.status(200).json({ message: 'Componentes guardados exitosamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};