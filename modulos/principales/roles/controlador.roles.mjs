import * as modelo from './modelo.roles.mjs';

//Obtener todos los roles
export async function obtenerTodos(req, res){
    try {
        const roles = await modelo.obtenerTodos();
        res.json(roles);   
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los roles' });
        console.log(error);
    }
}

//Obtener un rol por id
export async function obtenerUno(req, res){
    const { id } = req.params;
    try {
        const rol = await modelo.obtenerUno(id);
        if (!rol) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }
        res.json(rol);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el rol' });
    }
}

//Crear un rol
export async function crearUno(req, res){
    const dato = req.body;
    try {
        const nuevoRol = await modelo.crearUno(dato);
        res.status(201).json(nuevoRol);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el rol' });
    }
}

//Actualizar un rol por id
export async function actualizarUno(req, res){
    const { id } = req.params;
    const dato = req.body;
    try {
        const rolActualizado = await modelo.actualizarUno(id, dato);
        res.json(rolActualizado);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el rol' });
    }
}

//Eliminar un rol por id
export async function eliminarUno(req, res){
    const { id } = req.params;
    try {
        const rolEliminado = await modelo.eliminarUno(id);
        res.json(rolEliminado);
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el rol' });
    }
}