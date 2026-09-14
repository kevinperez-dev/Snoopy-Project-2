// Propósito: bloquear acciones que el perfil autenticado no tiene permitidas.

const { hasAnyPermission, hasPermission } = require('../services/accessControl');

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción.' });
    }

    return next();
  };
}

function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!hasAnyPermission(req.user, permissions)) {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción.' });
    }

    return next();
  };
}

module.exports = {
  requireAnyPermission,
  requirePermission,
};
