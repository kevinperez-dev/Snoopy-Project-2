// Archivo: src/routes/movements.routes.js
// Propósito: definir rutas protegidas para consultar, crear, modificar y cancelar movimientos.

const express = require('express');
const {
  getMovements,
  getMovementEditHistory,
  createMovement,
  updateMovement,
  deleteMovement,
} = require('../controllers/movements.controller');

const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// Propósito: todas las rutas de movimientos requieren sesión válida.
router.get('/', authMiddleware, getMovements);

// Propósito: consultar historial completo de ajustes antes de rutas con parámetro :id.
router.get('/edits/history', authMiddleware, getMovementEditHistory);

router.post('/', authMiddleware, createMovement);
router.put('/:id', authMiddleware, updateMovement);

// Propósito: esta ruta conserva DELETE para no romper el frontend, pero realiza cancelación lógica.
router.delete('/:id', authMiddleware, deleteMovement);

module.exports = router;
