import * as modelo from './modelo.caja_fisica.mjs'

//Obtener todas las cajas fisicas
export async function obtenerTodos(req, res) {
    try {
        const cajas = await modelo.obtenerTodos();
        res.json(cajas);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

//Obtener una caja fisica por id
export async function obtenerUno(req, res) {
    const { id } = req.params;
    try {
        const caja = await modelo.obtenerUno(id);
        res.json(caja);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

//Crear una caja fisica
export async function crearUno(req, res) {
    const dato = req.body;
    try {
        const caja = await modelo.crearUno(dato);
        res.status(201).json(caja);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

//Actualizar una caja fisica por id
export async function actualizarUno(req, res) {
    const { id } = req.params;
    const dato = req.body;
    try {
        const caja = await modelo.actualizarUno(id, dato);
        res.json(caja);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

//Eliminar una caja fisica por id
export async function eliminarUno(req, res) {
    const { id } = req.params;
    try {
        const caja = await modelo.eliminarUno(id);
        res.json(caja);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
