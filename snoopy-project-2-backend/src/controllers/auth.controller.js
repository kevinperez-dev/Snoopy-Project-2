// Archivo: src/controllers/auth.controller.js
// Propósito: manejar inicio de sesión y validación de usuario

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

// Iniciar sesión
async function login(req, res) {
  try {
    const { username, password } = req.body;

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
        role
      FROM users
      WHERE username = $1
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

    // Comparar contraseña escrita contra contraseña encriptada
    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordIsValid) {
      return res.status(401).json({
        message: 'Usuario o contraseña incorrectos.',
      });
    }

    // Crear token de sesión sin expiración automática por tiempo.
    // La sesión se cerrará únicamente cuando el usuario presione "Cerrar sesión".
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
    );

    // Responder datos seguros del usuario
    res.json({
      message: 'Inicio de sesión correcto.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
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
    user: req.user,
  });
}

module.exports = {
  login,
  me,
};
