// Archivo: src/middlewares/auth.middleware.js
// Propósito: validar que las peticiones tengan un token JWT válido

const jwt = require('jsonwebtoken');
const { getUserAccess } = require('../services/accessControl');
require('dotenv').config();

async function authMiddleware(req, res, next) {
  // Leer encabezado Authorization
  const authHeader = req.headers.authorization;

  // Validar que venga como: Bearer TOKEN
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'No autorizado. Inicia sesión para continuar.',
    });
  }

  // Separar el token del texto Bearer
  const token = authHeader.split(' ')[1];
  let decoded;

  try {
    // Verificar token usando la clave secreta.
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      message: 'Sesión inválida o expirada. Vuelve a iniciar sesión.',
    });
  }

  try {
    // El token identifica la sesión, pero los permisos se consultan en PostgreSQL
    // para aplicar de inmediato bajas, cambios de rol y restablecimientos de contraseña.
    const user = await getUserAccess(decoded.id);

    if (!user || user.estado !== 'activo' || Number(decoded.tv || 1) !== user.token_version) {
      return res.status(401).json({
        message: 'Tu sesión ya no está vigente. Vuelve a iniciar sesión.',
      });
    }

    // Una contraseña temporal solo permite completar el cambio obligatorio.
    // Así una cuenta nueva no puede operar antes de que su dueño asegure su acceso.
    const isOwnPasswordChange = req.baseUrl === '/api/auth' && req.path === '/password' && req.method === 'PUT';
    if (user.must_change_password && !isOwnPasswordChange) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Debes cambiar tu contraseña temporal antes de continuar.',
      });
    }

    req.user = user;

    return next();
  } catch (error) {
    // Una falla de infraestructura no es una sesión inválida. Se delega al
    // manejo global para conservar un diagnóstico correcto sin filtrar detalles.
    return next(error);
  }
}

module.exports = authMiddleware;
