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
const { requireAnyPermission, requirePermission } = require('../middlewares/authorization.middleware');

const router = express.Router();

// Propósito: todas las rutas de movimientos requieren sesión válida.
router.get('/', authMiddleware, requireAnyPermission(['movements.read.all', 'movements.read.assigned']), getMovements);

// Propósito: consultar historial completo de ajustes antes de rutas con parámetro :id.
router.get('/edits/history', authMiddleware, requireAnyPermission(['movements.read.all', 'movements.read.assigned']), getMovementEditHistory);

router.post('/', authMiddleware, requireAnyPermission(['movements.create.all', 'movements.create.assigned']), createMovement);
router.put('/:id', authMiddleware, requireAnyPermission(['movements.edit.all', 'movements.edit.assigned']), updateMovement);

// Propósito: esta ruta conserva DELETE para no romper el frontend, pero realiza cancelación lógica.
router.delete('/:id', authMiddleware, requirePermission('movements.cancel.all'), deleteMovement);

module.exports = router;
