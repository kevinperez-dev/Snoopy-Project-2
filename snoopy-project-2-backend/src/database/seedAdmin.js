// Archivo: src/database/seedAdmin.js
// Propósito: crear un usuario administrador inicial usando variables de entorno, sin dejar contraseñas fijas en el código

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedAdmin() {
  try {
    // Leer usuario, contraseña y rol desde variables de entorno
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    const role = process.env.ADMIN_ROLE || 'admin';

    // Validar que las variables necesarias existan
    if (!username || !password) {
      throw new Error('Faltan ADMIN_USERNAME o ADMIN_PASSWORD en las variables de entorno.');
    }

    // Generar hash seguro de la contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear o actualizar usuario administrador
    const result = await pool.query(
      `
      INSERT INTO users (username, password_hash, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (username)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
      RETURNING id, username, role, created_at;
      `,
      [username, passwordHash, role]
    );

    console.log('Usuario administrador creado o actualizado:');
    console.table(result.rows);
  } catch (error) {
    console.error('Error al crear usuario administrador:', error.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();