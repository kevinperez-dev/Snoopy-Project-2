const rateLimit = require('express-rate-limit');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function createLimiter({ max, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    skipSuccessfulRequests,
    handler: (req, res) => {
      res.status(429).json({ message });
    },
  });
}

const loginLimiter = createLimiter({
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.',
});

const apiLimiter = createLimiter({
  max: 60,
  message: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
});

function validateRequiredEnvironment() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables requeridas: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción.');
  }
}

module.exports = {
  apiLimiter,
  loginLimiter,
  validateRequiredEnvironment,
};
