// Ejecuta un archivo SQL indicado como argumento, útil para migraciones locales y despliegues.

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function runSqlFile() {
  const relativePath = process.argv[2];

  if (!relativePath) {
    throw new Error('Indica la ruta del archivo SQL que deseas ejecutar.');
  }

  const sqlPath = path.resolve(process.cwd(), relativePath);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await pool.query(sql);
    console.log(`Migracion aplicada correctamente: ${relativePath}`);
  } finally {
    await pool.end();
  }
}

runSqlFile().catch((error) => {
  console.error('Error al aplicar migracion:', error.message);
  process.exitCode = 1;
});
