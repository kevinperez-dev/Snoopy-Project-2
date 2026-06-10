// Archivo: src/database/createUser.js
// Propósito: crear o actualizar un usuario del sistema con contraseña encriptada

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Lee argumentos enviados desde la terminal
const [username, password, role = 'user'] = process.argv.slice(2);

// Valida que se hayan enviado usuario y contraseña
if (!username || !password) {
  console.error('Uso correcto: npm run create:user -- usuario contraseña rol');
  console.error('Ejemplo: npm run create:user -- nombre_usuario contraseña_segura admin');
  process.exit(1);
}

async function createUser() {
  try {
    // Encripta la contraseña antes de guardarla
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserta el usuario o actualiza su contraseña si ya existe
    const result = await pool.query(
      `
      INSERT INTO users (username, password_hash, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (username)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
      RETURNING id, username, role, created_at
      `,
      [username, passwordHash, role]
    );

    console.log('Usuario creado o actualizado correctamente:');
    console.table(result.rows);
  } catch (error) {
    console.error('Error al crear usuario:', error.message);
  } finally {
    // Cierra la conexión al terminar
    await pool.end();
  }
}

createUser();