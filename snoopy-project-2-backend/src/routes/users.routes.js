// Rutas administrativas de usuarios. No existe registro público.

const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/authorization.middleware');
const {
  createUser,
  getUserConfiguration,
  listUsers,
  resetUserPassword,
  updateUser,
} = require('../controllers/users.controller');

const router = express.Router();

router.use(authMiddleware, requirePermission('users.manage'));
router.get('/', listUsers);
router.get('/configuration', getUserConfiguration);
router.post('/', createUser);
router.put('/:id', updateUser);
router.post('/:id/reset-password', resetUserPassword);

module.exports = router;
