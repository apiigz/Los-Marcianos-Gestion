import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  const token = req.signedCookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Acceso denegado: sesión no iniciada' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.clearCookie('token');
    return res.status(401).json({ message: 'Sesión expirada o token inválido' });
  }
};

export const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ message: 'Acceso denegado: permisos insuficientes' });
    }
    next();
  };
};