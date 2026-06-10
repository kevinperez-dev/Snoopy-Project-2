// Archivo: src/routes/auth.routes.js
// Propósito: definir rutas de autenticación del sistema

const express = require('express');
const { login, me } = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// Ruta para iniciar sesión
router.post('/login', login);

// Ruta para validar sesión actual
router.get('/me', authMiddleware, me);

module.exports = router;
