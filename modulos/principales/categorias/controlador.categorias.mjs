import * as modelo from './modelo.categorias.mjs'

//Obtener todas las categorias
export async function obtenerTodos(req, res) {
    try {
        const categorias = await modelo.obtenerTodos();
        res.json(categorias);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las categorías' });
        console.log(error);
    }
}

//Obtener una categoria por id
export async function obtenerUno(req, res) {
    const { id } = req.params;
    try {
        const categoria = await modelo.obtenerUno(id);
        if (!categoria) {
            return res.status(404).json({ error: 'Categoría no encontrada' });
        }
        res.json(categoria);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la categoría' });
    }
}

//Crear una categoria
export async function crearUno(req, res) {
    const { nombre, unidad_medida } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
  }

  const unidad = unidad_medida ? unidad_medida.toUpperCase().trim() : 'UNIDAD';
  if (!['UNIDAD', 'KILO'].includes(unidad)) {
    return res.status(400).json({ error: "La unidad de medida debe ser 'UNIDAD' o 'KILO'" });
  }

  try {
    const nuevaCategoria = await modelo.crearUno({ nombre, unidad_medida: unidad });
    return res.status(201).json(nuevaCategoria);
  } catch (error) {
    console.error('Error al crear categoría:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
}

//Actualizar una categoria por id
export async function actualizarUno(req, res) {
    const { id } = req.params;
  const { nombre, unidad_medida } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
  }

  const unidadNormalizada = unidad_medida ? unidad_medida.toUpperCase().trim() : 'UNIDAD';
  if (!['UNIDAD', 'KILO'].includes(unidadNormalizada)) {
    return res.status(400).json({ error: "La unidad de medida debe ser 'UNIDAD' o 'KILO'." });
  }

  try {
    const categoriaActualizada = await modelo.actualizarUno(id, {
      nombre: nombre.trim(),
      unidad_medida: unidadNormalizada
    });

    if (!categoriaActualizada) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    return res.status(200).json(categoriaActualizada);
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    return res.status(500).json({ error: error.message || 'Error interno al actualizar la categoría.' });
  }
}

//Eliminar una categoria por id
export async function eliminarUno(req, res) {
    const { id } = req.params;
    try {
        const categoriaEliminada = await modelo.eliminarUno(id);
        res.json(categoriaEliminada);
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar la categoría' });
    }
}