import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { encontrarUsuarioParaAuth } from '../principales/usuarios/modelo.usuarios.mjs';

export const login = async (req, res) => {
  const { dni, password } = req.body;
  console.log(req.body);

  try {
    if (!dni || !password) {
      return res.status(400).json({ message: 'DNI y contraseña requeridos' });
    }

    // 1. Buscar usuario por dni
    const user = await encontrarUsuarioParaAuth(dni);
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // 2. Verificar que el usuario esté activo
    if (!user.activo) {
      return res.status(403).json({ message: 'El usuario se encuentra inactivo' });
    }

    // 3. Comparar con la columna password_hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // 4. Crear el payload del JWT
    const payload = {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      dni: user.dni,
      rol: user.rol // Devuelve 'administrador', 'cajero', etc.
    };

    // 5. Firmar el token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h'
    });

    // 6. Setear cookie httpOnly firmada
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: 12 * 60 * 60 * 1000 // 12 horas
    });

    // 7. Retornar solo el rol y datos necesarios para la redirección en el front
    return res.json({
      message: 'Inicio de sesión exitoso',
      rol: user.rol
    });

  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const logout = (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Sesión cerrada correctamente' });
};