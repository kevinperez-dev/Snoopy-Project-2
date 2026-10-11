// Regresión de eliminación de cajas contra la copia LOCAL.
// Crea datos temporales y los elimina antes de finalizar.

const { Client } = require('pg');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:4010/api';
const databaseUrl = process.env.QA_DATABASE_URL || '';
const adminUsername = process.env.QA_ADMIN_USERNAME || '';
const adminPassword = process.env.QA_ADMIN_PASSWORD || '';

const parsedApiUrl = new URL(apiUrl);
const parsedDatabaseUrl = databaseUrl ? new URL(databaseUrl) : null;

if (!['localhost', '127.0.0.1'].includes(parsedApiUrl.hostname)) {
  throw new Error('La prueba solo puede ejecutarse contra una API local.');
}

if (!parsedDatabaseUrl || !['localhost', '127.0.0.1'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error('La prueba solo puede limpiar una base de datos local.');
}

if (!/^\/snoopy_project_2\/?$/.test(parsedDatabaseUrl.pathname)) {
  throw new Error('La prueba requiere explícitamente la copia local snoopy_project_2.');
}

if (!adminUsername || !adminPassword) {
  throw new Error('Define QA_ADMIN_USERNAME y QA_ADMIN_PASSWORD para una cuenta administradora local.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}, token = '') {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await response.text();
  let body = {};
  if (text) body = JSON.parse(text);
  return { status: response.status, body };
}

async function login() {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
}

async function counts(client) {
  return (
    await client.query(`
      SELECT
        (SELECT COUNT(*)::integer FROM cash_boxes) AS cash_boxes,
        (SELECT COUNT(*)::integer FROM movements) AS movements,
        (SELECT COUNT(*)::integer FROM audit_log) AS audit_log
    `)
  ).rows[0];
}

async function run() {
  const database = new Client({ connectionString: databaseUrl, ssl: false });
  const createdCashBoxIds = [];
  const auditedCashBoxIds = [];
  const createdMovementIds = [];
  let baseline;

  await database.connect();

  try {
    baseline = await counts(database);

    const anonymousDelete = await request('/cajas/1', { method: 'DELETE' });
    assert(anonymousDelete.status === 401, 'La eliminación de cajas quedó accesible sin sesión.');

    const loginResult = await login();
    assert(loginResult.status === 200, 'La cuenta administradora local no pudo iniciar sesión.');
    const token = loginResult.body.token;

    const currentBoxes = await request('/cajas', {}, token);
    assert(currentBoxes.status === 200, 'No se pudo consultar el catálogo de cajas.');
    const principal = currentBoxes.body.find((cashBox) => cashBox.principal);
    assert(principal?.nombre.toLowerCase() === 'caja invitados', 'La caja de invitados no quedó como principal.');

    const principalDelete = await request(`/cajas/${principal.id}`, { method: 'DELETE' }, token);
    assert(principalDelete.status === 400, 'Se permitió eliminar la caja principal.');

    const duplicateName = await request('/cajas', {
      method: 'POST',
      body: JSON.stringify({ nombre: principal.nombre.toLowerCase(), descripcion: 'Duplicado inválido.' }),
    }, token);
    assert(duplicateName.status === 409, 'Se permitió crear una caja duplicada solo cambiando mayúsculas.');

    const suffix = Date.now();
    const emptyBox = await request('/cajas', {
      method: 'POST',
      body: JSON.stringify({ nombre: `QA vacía ${suffix}`, descripcion: 'Caja temporal sin registros.' }),
    }, token);
    assert(emptyBox.status === 201, 'No se pudo crear la caja temporal vacía.');
    createdCashBoxIds.push(emptyBox.body.id);
    auditedCashBoxIds.push(emptyBox.body.id);

    const activeDelete = await request(`/cajas/${emptyBox.body.id}`, { method: 'DELETE' }, token);
    assert(activeDelete.status === 400, 'Se permitió eliminar una caja aún activa.');

    const inactiveEmpty = await request(`/cajas/${emptyBox.body.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...emptyBox.body, activa: false }),
    }, token);
    assert(inactiveEmpty.status === 200 && inactiveEmpty.body.can_delete, 'Una caja inactiva sin registros no quedó habilitada para eliminar.');

    const deletedEmpty = await request(`/cajas/${emptyBox.body.id}`, { method: 'DELETE' }, token);
    assert(deletedEmpty.status === 204, 'No se pudo eliminar una caja inactiva sin registros.');
    createdCashBoxIds.pop();

    const usedBox = await request('/cajas', {
      method: 'POST',
      body: JSON.stringify({ nombre: `QA con movimiento ${suffix}`, descripcion: 'Caja temporal con movimiento.' }),
    }, token);
    assert(usedBox.status === 201, 'No se pudo crear la caja temporal con movimiento.');
    createdCashBoxIds.push(usedBox.body.id);
    auditedCashBoxIds.push(usedBox.body.id);

    const movement = await request('/movements', {
      method: 'POST',
      body: JSON.stringify({
        caja_id: usedBox.body.id,
        tipo: 'ingreso',
        fecha: '2026-10-11',
        nombre: 'QA eliminación protegida',
        descripcion: 'Movimiento temporal para validar que la caja no se elimina.',
        cantidad: 1,
        moneda: 'Dólares',
      }),
    }, token);
    assert(movement.status === 201, 'No se pudo crear el movimiento temporal.');
    createdMovementIds.push(movement.body.id);

    const inactiveUsed = await request(`/cajas/${usedBox.body.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...usedBox.body, activa: false }),
    }, token);
    assert(inactiveUsed.status === 200 && !inactiveUsed.body.can_delete, 'Una caja con movimiento quedó habilitada para eliminar.');

    const protectedDelete = await request(`/cajas/${usedBox.body.id}`, { method: 'DELETE' }, token);
    assert(protectedDelete.status === 409, 'Se permitió eliminar una caja con movimiento.');

    console.log(JSON.stringify({ ok: true, checks: [
      'sesión obligatoria',
      'principal protegida',
      'nombre único sin distinguir mayúsculas',
      'caja activa protegida',
      'caja inactiva vacía eliminable',
      'caja con movimiento protegida',
    ] }, null, 2));
  } finally {
    try {
      await database.query('BEGIN');
      if (createdMovementIds.length) {
        await database.query("DELETE FROM audit_log WHERE entity_type = 'movement' AND entity_id = ANY($1::text[])", [createdMovementIds.map(String)]);
        await database.query('DELETE FROM movements WHERE id = ANY($1::int[])', [createdMovementIds]);
      }
      if (auditedCashBoxIds.length) {
        await database.query("DELETE FROM audit_log WHERE entity_type = 'cash_box' AND entity_id = ANY($1::text[])", [auditedCashBoxIds.map(String)]);
      }
      if (createdCashBoxIds.length) {
        await database.query('DELETE FROM cash_boxes WHERE id = ANY($1::int[])', [createdCashBoxIds]);
      }
      await database.query('COMMIT');

      if (baseline) {
        const current = await counts(database);
        assert(
          Object.keys(baseline).every((key) => Number(current[key]) === Number(baseline[key])),
          'La limpieza no devolvió la copia local a los conteos iniciales.',
        );
      }
    } catch (cleanupError) {
      await database.query('ROLLBACK').catch(() => undefined);
      throw cleanupError;
    } finally {
      await database.end();
    }
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
