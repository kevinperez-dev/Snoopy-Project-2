// Archivo: src/database/initDatabase.js
// Propósito: inicializar las tablas de PostgreSQL ejecutando el archivo schema.sql.

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function initDatabase() {
  try {
    // Lee el script SQL principal del proyecto.
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Ejecuta el esquema completo; las tablas e índices usan IF NOT EXISTS.
    await pool.query(schemaSql);

    console.log('Base de datos inicializada correctamente.');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error.message);
    process.exitCode = 1;
  } finally {
    // Cierra el pool para que el comando termine correctamente en Render o terminal.
    await pool.end();
  }
}

initDatabase();
