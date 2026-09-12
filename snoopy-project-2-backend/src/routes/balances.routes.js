// Propósito: definir rutas protegidas para preparar y guardar balanzas.

const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const {
  getBalanceMovements,
  getBalances,
  getBalance,
  createBalance,
} = require('../controllers/balances.controller');

const router = express.Router();

router.use(authMiddleware);
router.get('/movimientos', getBalanceMovements);
router.get('/', getBalances);
router.get('/:id', getBalance);
router.post('/', createBalance);

module.exports = router;
