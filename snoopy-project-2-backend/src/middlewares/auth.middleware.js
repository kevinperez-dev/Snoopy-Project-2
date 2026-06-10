// Archivo: src/middlewares/auth.middleware.js
// Propósito: validar que las peticiones tengan un token JWT válido

const jwt = require('jsonwebtoken');
require('dotenv').config();

function authMiddleware(req, res, next) {
  try {
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

    // Verificar token usando la clave secreta
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Guardar usuario decodificado para usarlo en controladores
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Sesión inválida o expirada. Vuelve a iniciar sesión.',
    });
  }
}

module.exports = authMiddleware;
