// Rutas de perfiles personalizados, exclusivas de administración.

const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/authorization.middleware');
const {
  createRole,
  getRoleConfiguration,
  listRoles,
  updateRole,
} = require('../controllers/roles.controller');

const router = express.Router();

router.use(authMiddleware, requirePermission('roles.manage'));
router.get('/', listRoles);
router.get('/configuration', getRoleConfiguration);
router.post('/', createRole);
router.put('/:id', updateRole);

module.exports = router;
