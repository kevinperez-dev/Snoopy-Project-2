// Rutas protegidas del catalogo configurable de cajas.

const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const {
  requireAdmin,
  getCashBoxes,
  createCashBox,
  updateCashBox,
} = require('../controllers/cashBoxes.controller');

const router = express.Router();

router.get('/', authMiddleware, getCashBoxes);
router.post('/', authMiddleware, requireAdmin, createCashBox);
router.put('/:id', authMiddleware, requireAdmin, updateCashBox);

module.exports = router;
