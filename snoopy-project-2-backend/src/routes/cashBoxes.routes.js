// Rutas protegidas del catalogo configurable de cajas.

const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const { requireAnyPermission } = require('../middlewares/authorization.middleware');
const {
  requireAdmin,
  getCashBoxes,
  createCashBox,
  updateCashBox,
  deleteCashBox,
} = require('../controllers/cashBoxes.controller');

const router = express.Router();

router.get('/', authMiddleware, requireAnyPermission(['cash_boxes.read.all', 'cash_boxes.read.assigned']), getCashBoxes);
router.post('/', authMiddleware, requireAdmin, createCashBox);
router.put('/:id', authMiddleware, requireAdmin, updateCashBox);
router.delete('/:id', authMiddleware, requireAdmin, deleteCashBox);

module.exports = router;
