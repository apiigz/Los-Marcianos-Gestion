import { Router } from 'express';
import { login, logout } from './auth.controlador.mjs';
import { verifyToken } from '../middlewares/auth.middleware.mjs';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);

// Endpoint para que el front verifique la identidad del usuario logueado
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

export default router;