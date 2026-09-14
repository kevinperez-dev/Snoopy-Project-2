// Archivo: src/database/seedAdmin.js
// Propósito: crear un usuario administrador inicial usando variables de entorno, sin dejar contraseñas fijas en el código

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedAdmin() {
  try {
    // Leer usuario, contraseña y rol desde variables de entorno
    const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const role = 'admin';

    // Validar que las variables necesarias existan
    if (!username || !password) {
      throw new Error('Faltan ADMIN_USERNAME o ADMIN_PASSWORD en las variables de entorno.');
    }

    // Generar hash seguro de la contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Solo crea la cuenta inicial cuando no existe. Un despliegue no debe reemplazar
    // contraseñas, roles ni sesiones de una cuenta que ya administra el sistema.
    const existingUser = await pool.query(
      'SELECT id, username, role, created_at FROM users WHERE LOWER(username) = $1 LIMIT 1',
      [username],
    );

    let adminUser = existingUser.rows[0];
    let wasCreated = false;

    if (!adminUser) {
      const result = await pool.query(
        `
        INSERT INTO users (
          username, nombre, password_hash, role, estado, must_change_password, onboarding_status
        )
        VALUES ($1, $1, $2, $3, 'activo', FALSE, 'completado')
        RETURNING id, username, role, created_at;
        `,
        [username, passwordHash, role]
      );

      adminUser = result.rows[0];
      wasCreated = Boolean(adminUser);
    }

    if (!adminUser) {
      throw new Error('No fue posible localizar la cuenta administradora inicial.');
    }

    await pool.query(
      `
        INSERT INTO user_roles (user_id, role_id, assigned_by)
        SELECT $1, id, $1
        FROM roles
        WHERE clave = 'admin'
        ON CONFLICT (user_id, role_id) DO NOTHING
      `,
      [adminUser.id],
    );

    await pool.query(
      `
        INSERT INTO cash_box_members (cash_box_id, user_id, access_level, assigned_by)
        SELECT id, $1, 'owner', $1
        FROM cash_boxes
        ON CONFLICT (cash_box_id, user_id) DO NOTHING
      `,
      [adminUser.id],
    );

    console.log(wasCreated ? 'Usuario administrador inicial creado:' : 'Usuario administrador existente conservado:');
    console.table([adminUser]);
  } catch (error) {
    console.error('Error al crear usuario administrador:', error.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();
