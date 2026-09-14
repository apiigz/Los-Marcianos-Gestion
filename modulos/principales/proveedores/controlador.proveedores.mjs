import * as modelo from "./modelo.proveedores.mjs";

//Obtener todos los proveedores
export async function obtenerTodos(req, res) {
    try {
        const resultado = await modelo.obtenerTodos();
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los proveedores' });
        console.log(error);
    }

}

//Obtener un proveedor por id
export async function obtenerUno(req, res) {
    const { id } = req.params;
    try {
        const resultado = await modelo.obtenerUno(id);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el proveedor' });
        console.log(error);
    }
}

//Crear un proveedor
export async function crearUno(req, res) {
    const dato = req.body;
    try {
        const resultado = await modelo.crearUno(dato);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el proveedor' });
        console.log(error);
    }
}

//Actualizar un proveedor por id
export async function actualizarUno(req, res) {
    const { id } = req.params;
    const dato = req.body;
    try {
        const resultado = await modelo.actualizarUno(id, dato);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el proveedor' });
        console.log(error);
    }
}

//Eliminar un proveedor por id
export async function eliminarUno(req, res) {
    const { id } = req.params;
    try {
        const resultado = await modelo.eliminarUno(id);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el proveedor' });
        console.log(error);
    }
}

//Cambiar estado
export const cambiarEstado = async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  try {
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo "activo" debe ser un booleano (true o false)' });
    }

    const proveedorActualizado = await modelo.cambiarEstado(Number(id), activo);

    if (!proveedorActualizado) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    return res.status(200).json(proveedorActualizado);
  } catch (error) {
    console.error('Error al cambiar el estado del proveedor:', error);
    return res.status(500).json({ error: error.message || 'Error interno al cambiar el estado del proveedor' });
  }
};