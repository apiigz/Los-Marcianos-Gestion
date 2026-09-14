import * as modelo from './modelo.usuarios.mjs';
import bcrypt from 'bcrypt';

//Obtener todos los usuarios
export async function obtenerTodos(req, res){
    try {
        const usuarios = await modelo.obtenerTodos();
        res.json(usuarios);   
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los usuarios' });
        console.log(error);
    }
}

//Obtener un usuario por id
export async function obtenerUno(req, res){
    const { id } = req.params;
    try {
        const usuario = await modelo.obtenerUno(id);
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(usuario);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el usuario' });
    }
}

//Crear un usuario
export const crearUno = async (req, res) => {
  const { rol_id, nombre, apellido, dni, cuil, email, password, activo } = req.body;

  try {
    if (!password || password.trim() === '') {
      return res.status(400).json({ error: 'La contraseña provisional es obligatoria' });
    }

    if (!rol_id || !nombre || !apellido || !dni) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (rol, nombre, apellido, DNI)' });
    }

    // 1. Cifrar la contraseña provisional antes de persistir
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password.trim(), saltRounds);

    // 2. Invocar al modelo enviando el hash
    const nuevoUsuario = await modelo.crearUno({
      rol_id: Number(rol_id),
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      dni: dni.trim(),
      cuil: cuil ? cuil.trim() : null,
      email: email ? email.trim() : null,
      password_hash,
      activo: activo ?? true
    });

    // 3. Responder con el usuario creado (excluyendo el hash)
    return res.status(201).json(nuevoUsuario);

  } catch (error) {
    console.error('Error en controlador al crear usuario:', error);
    
    // Captura de duplicados de clave única (ej. DNI o Email ya registrados)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario registrado con ese DNI o Email' });
    }

    return res.status(500).json({ error: error.message || 'Error al crear el usuario' });
  }
};

//Actualizar un usuario por id
export const actualizarUno = async (req, res) => {
  const { id } = req.params;
  const { rol_id, nombre, apellido, dni, cuil, email, activo, password } = req.body;

  try {
    let password_hash = null;
    if (password && password.trim() !== '') {
      password_hash = await bcrypt.hash(password, 10);
    }

    // Pasamos un único objeto con todas las propiedades que espera el modelo
    const usuarioActualizado = await modelo.actualizarUno({
      id: Number(id),
      rol_id: Number(rol_id),
      nombre,
      apellido,
      dni,
      cuil,
      email,
      activo,
      password_hash
    });

    if (!usuarioActualizado) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json(usuarioActualizado);
  } catch (error) {
    console.error('Error en controlador al actualizar usuario:', error);
    return res.status(500).json({ error: error.message || 'Error al actualizar usuario' });
  }
};

//Eliminar un usuario por id
export async function eliminarUno(req, res){
    const { id } = req.params;
    try {
        const usuarioEliminado = await modelo.eliminarUno(id);
        res.json(usuarioEliminado);
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el usuario' });
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

    // Regla de seguridad extra: evitar que el admin se inactive a sí mismo
    if (req.user && req.user.id === Number(id) && activo === false) {
      return res.status(403).json({ error: 'No puedes desactivar tu propia cuenta administradora' });
    }

    const usuarioModificado = await modelo.cambiarEstado(Number(id), activo);

    if (!usuarioModificado) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json(usuarioModificado);
  } catch (error) {
    console.error('Error al cambiar estado del usuario:', error);
    return res.status(500).json({ error: error.message || 'Error interno al cambiar estado' });
  }
};
