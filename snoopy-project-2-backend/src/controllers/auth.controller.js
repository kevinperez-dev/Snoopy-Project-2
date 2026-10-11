// Archivo: src/controllers/auth.controller.js
// Propósito: manejar inicio de sesión y validación de usuario

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { getUserAccess, safeUser } = require('../services/accessControl');
require('dotenv').config();

function createSessionToken(user) {
  return jwt.sign(
    {
      id: user.id,
      tv: user.token_version,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );
}

// Iniciar sesión
async function login(req, res) {
  try {
    const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
    const username = String(requestBody.username || '').trim().toLowerCase();
    const password = requestBody.password;

    // Validar campos obligatorios
    if (!username || !password) {
      return res.status(400).json({
        message: 'Usuario y contraseña son obligatorios.',
      });
    }

    // Buscar usuario en PostgreSQL
    const result = await pool.query(
      `
      SELECT 
        id,
        username,
        password_hash,
        estado,
        token_version
      FROM users
      WHERE LOWER(username) = $1
      LIMIT 1
      `,
      [username],
    );

    // Validar que el usuario exista
    if (result.rows.length === 0) {
      return res.status(401).json({
        message: 'Usuario o contraseña incorrectos.',
      });
    }

    const user = result.rows[0];

    if (user.estado !== 'activo') {
      return res.status(403).json({
        message: 'Esta cuenta está inactiva. Solicita apoyo a un administrador.',
      });
    }

    // Comparar contraseña escrita contra contraseña encriptada
    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordIsValid) {
      return res.status(401).json({
        message: 'Usuario o contraseña incorrectos.',
      });
    }

    const userAccess = await getUserAccess(user.id);

    if (!userAccess) {
      return res.status(401).json({ message: 'No fue posible validar la cuenta.' });
    }

    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Los tokens expiran para limitar el impacto de una sesión robada.
    const token = createSessionToken(userAccess);

    // Responder datos seguros del usuario
    res.json({
      message: 'Inicio de sesión correcto.',
      token,
      user: safeUser(userAccess),
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({
      message: 'Error al iniciar sesión.',
    });
  }
}

// Validar sesión actual
async function me(req, res) {
  res.json({
    user: safeUser(req.user),
  });
}

async function updateOnboarding(req, res) {
  const status = String(req.body?.status || '').trim();

  if (!['completado', 'omitido'].includes(status)) {
    return res.status(400).json({ message: 'El estado de la guía no es válido.' });
  }

  try {
    await pool.query(
      `
        UPDATE users
        SET onboarding_status = $1
        WHERE id = $2 AND onboarding_status = 'pendiente'
      `,
      [status, req.user.id],
    );

    const updatedUser = await getUserAccess(req.user.id);
    return res.json({ user: safeUser(updatedUser) });
  } catch (error) {
    console.error('Error al actualizar guía inicial:', error);
    return res.status(500).json({ message: 'No fue posible guardar el avance de la guía.' });
  }
}

module.exports = {
  login,
  me,
  updateOnboarding,
};
