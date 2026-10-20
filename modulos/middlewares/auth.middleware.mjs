import jwt from 'jsonwebtoken';
import { cargarUsuarioConPermisos } from '../auth/auth.modelo.mjs';

export const verifyToken = async (req, res, next) => {
  const token = req.signedCookies.token;
  if (!token) return res.status(401).json({ message: 'Acceso denegado: sesión no iniciada' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.clearCookie('token');
    return res.status(401).json({ message: 'Sesión expirada o token inválido' });
  }

  try {
    const user = await cargarUsuarioConPermisos(decoded.id);
    if (!user || !user.activo) {
      res.clearCookie('token');
      return res.status(401).json({ message: 'Usuario inexistente o inactivo' });
    }
    req.user = user;            // { id, nombre, apellido, dni, rol, rol_id, permisos[] }
    next();
  } catch (err) {
    console.error('Error al cargar usuario:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Pasa si el usuario tiene AL MENOS UNO de los permisos indicados
export const requirePermiso = (...codigos) => (req, res, next) => {
  if (!req.user || !codigos.some(c => req.user.permisos.includes(c))) {
    return res.status(403).json({ message: 'Acceso denegado: permisos insuficientes' });
  }
  next();
};