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
export async function eliminarUno(req, res) {
  try {
    const rol = await modelo.obtenerUno(req.params.id);
    if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });
    if (rol.es_sistema) return res.status(403).json({ error: 'Los roles del sistema no se pueden eliminar.' });
    res.json(await modelo.eliminarUno(rol.id));
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Hay usuarios asignados a este rol.' });
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar el rol' });
  }
}

//

export async function obtenerCatalogo(req, res) {
  try { res.json(await modelo.obtenerCatalogoPermisos()); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener el catálogo' }); }
}

export async function obtenerPermisos(req, res) {
  try {
    const rol = await modelo.obtenerUno(req.params.id);
    if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });
    const permisos = rol.es_admin
      ? (await modelo.obtenerCatalogoPermisos()).map(p => p.codigo)
      : await modelo.obtenerPermisosDeRol(rol.id);
    res.json({ rol: { id: rol.id, nombre: rol.nombre, es_admin: rol.es_admin }, permisos });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener permisos' }); }
}

export async function guardarPermisos(req, res) {
  const { permisos } = req.body;
  if (!Array.isArray(permisos) || permisos.some(p => typeof p !== 'string')) {
    return res.status(400).json({ error: 'Formato inválido: se espera { permisos: [..] }' });
  }
  try {
    const rol = await modelo.obtenerUno(req.params.id);
    if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });
    if (rol.es_admin) {
      return res.status(400).json({ error: 'El administrador siempre tiene todos los permisos.' });
    }
    await modelo.reemplazarPermisosDeRol(rol.id, [...new Set(permisos)]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ error: 'Se envió un permiso inexistente.' });
    console.error(e);
    res.status(500).json({ error: 'Error al guardar permisos' });
  }
}
