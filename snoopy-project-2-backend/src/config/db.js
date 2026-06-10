// Archivo: src/config/db.js
// Propósito: configurar la conexión a PostgreSQL según el ambiente actual.

const { Pool } = require('pg');
require('dotenv').config();

// Propósito: detectar si la conexión es local para evitar usar SSL en PostgreSQL local.
const databaseUrl = process.env.DATABASE_URL || '';
const isLocalDatabase =
  databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

// Propósito: activar SSL solo cuando se indique explícitamente y no sea una base local.
const shouldUseSsl = process.env.DB_SSL === 'true' && !isLocalDatabase;

// Propósito: crear el pool de conexión usando la configuración del archivo .env.
const pool = new Pool({
  connectionString: databaseUrl,

  // Propósito: Render normalmente requiere SSL, pero PostgreSQL local no.
  ssl: shouldUseSsl
    ? {
        rejectUnauthorized: false,
      }
    : false,
});

module.exports = pool;