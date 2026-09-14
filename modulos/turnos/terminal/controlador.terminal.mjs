import * as modelo from './modelo.terminal.mjs';

//Controlador para obtener todas las terminales
export async function obtenerTodos(req, res) {
    try {
        const terminales = await modelo.obtenerTodos();
        res.json(terminales);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

//Controlador para buscar una terminal por id
export async function obtenerUno(req, res) {
    try {
        const terminal = await modelo.obtenerUno(req.params.id);
        if (terminal) {
            res.json(terminal);
        } else {
            res.status(404).json({ error: "Terminal no encontrada" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

//Controlador para crear una terminal
export async function crearUno(req, res) {
    try {
        const terminal = await modelo.crearUno(req.body);
        res.status(201).json(terminal);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

//Controlador para actualizar una terminal por id
export async function actualizarUno(req, res) {
    try {
        const terminal = await modelo.actualizarUno(req.params.id, req.body);
        if (terminal) {
            res.json(terminal);
        } else {
            res.status(404).json({ error: "Terminal no encontrada" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

//Controlador para eliminar una terminal por id
export async function eliminarUno(req, res) {
    try {
        const terminal = await modelo.eliminarUno(req.params.id);
        if (terminal) {
            res.json(terminal);
        } else {
            res.status(404).json({ error: "Terminal no encontrada" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
