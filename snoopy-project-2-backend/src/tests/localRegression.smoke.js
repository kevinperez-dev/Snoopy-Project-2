// Regresión integral contra la copia LOCAL de Snoopy Project 2.
// Seguridad: rechaza cualquier URL que no sea localhost y limpia por completo
// los registros creados durante la prueba antes de terminar.

const { Client } = require('pg');

const baseUrl = process.env.TEST_API_URL || 'http://127.0.0.1:4000/api';
const databaseUrl = process.env.QA_DATABASE_URL || '';
const adminUsername = process.env.QA_ADMIN_USERNAME || 'adminuser';
const adminPassword = process.env.QA_ADMIN_PASSWORD || '';

const parsedApiUrl = new URL(baseUrl);
const parsedDatabaseUrl = databaseUrl ? new URL(databaseUrl) : null;

if (!['localhost', '127.0.0.1'].includes(parsedApiUrl.hostname)) {
  throw new Error('La regresión solo puede solicitar una API local.');
}

if (!parsedDatabaseUrl || !['localhost', '127.0.0.1'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error('La regresión solo puede limpiar una base de datos local.');
}

if (!/^\/snoopy_project_2\/?$/.test(parsedDatabaseUrl.pathname)) {
  throw new Error('La regresión requiere explícitamente la copia local snoopy_project_2.');
}

if (!adminPassword) {
  throw new Error('Define QA_ADMIN_PASSWORD para la cuenta administradora local.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}, token = '') {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  return { status: response.status, body };
}

async function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

async function getCounts(db) {
  const result = await db.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM users) AS users_count,
      (SELECT COUNT(*)::integer FROM movements) AS movements_count,
      (SELECT COUNT(*)::integer FROM movement_edits) AS edits_count,
      (SELECT COUNT(*)::integer FROM audit_log) AS audits_count
  `);
  return result.rows[0];
}

async function run() {
  const db = new Client({ connectionString: databaseUrl, ssl: false });
  const createdMovementIds = [];
  let createdUserId = null;
  let baseline = null;
  const validations = [];

  await db.connect();

  try {
    baseline = await getCounts(db);

    const unauthenticatedUsers = await request('/users');
    assert(unauthenticatedUsers.status === 401, 'Usuarios quedó accesible sin autenticación.');
    const disabledBalance = await request('/balances');
    assert(disabledBalance.status === 404, 'La balanza, aún incompleta, sigue expuesta por API.');
    validations.push('rutas protegidas y módulo de balanza oculto');

    const adminLogin = await login(adminUsername, adminPassword);
    assert(adminLogin.status === 200, 'La cuenta administradora local no pudo iniciar sesión.');
    assert(!Object.hasOwn(adminLogin.body.user || {}, 'password_hash'), 'El inicio de sesión expuso el hash de contraseña.');
    const adminToken = adminLogin.body.token;

    const caseInsensitiveLogin = await login(adminUsername.toUpperCase(), adminPassword);
    assert(caseInsensitiveLogin.status === 200, 'El inicio de sesión distingue mayúsculas innecesariamente.');

    const me = await request('/auth/me', {}, adminToken);
    assert(me.status === 200 && me.body.user?.role === 'admin', 'La sesión no resolvió correctamente el rol administrador.');
    assert(me.body.user.permissions?.includes('users.manage') && me.body.user.permissions?.includes('roles.manage'), 'El administrador no conserva sus permisos críticos.');
    validations.push('inicio de sesión, rol y datos seguros');

    const usersConfiguration = await request('/users/configuration', {}, adminToken);
    assert(usersConfiguration.status === 200, 'No se pudo cargar la configuración de usuarios.');
    for (const key of ['admin', 'edicion', 'lectura']) {
      assert(usersConfiguration.body.roles?.some((role) => role.clave === key), `No está disponible el rol base ${key}.`);
    }
    const principal = usersConfiguration.body.cash_boxes?.find((cashBox) => cashBox.principal);
    const cajaB = usersConfiguration.body.cash_boxes?.find((cashBox) => cashBox.clave === 'B');
    assert(principal?.clave === 'A', 'No se resolvió la caja principal A.');
    assert(cajaB, 'No se resolvió la caja B para validar el acceso asignado.');

    const users = await request('/users', {}, adminToken);
    assert(users.status === 200 && users.body.length >= 5, 'No se pudo consultar el catálogo de cuentas local.');
    assert(users.body.every((user) => user.role_key && user.role_nombre), 'Una o más cuentas no muestran su rol de usuario.');

    const roles = await request('/roles', {}, adminToken);
    assert(roles.status === 200 && roles.body.filter((role) => role.es_sistema).length === 3, 'Los tres roles base no están estables.');
    const rolesConfiguration = await request('/roles/configuration', {}, adminToken);
    assert(rolesConfiguration.status === 200 && rolesConfiguration.body.permissions?.length >= 4, 'No se cargaron las capacidades configurables de roles.');
    validations.push('roles base, listado de usuarios y selector de rol');

    const cashBoxes = await request('/cajas', {}, adminToken);
    assert(cashBoxes.status === 200 && cashBoxes.body.some((cashBox) => cashBox.principal && cashBox.activa), 'La caja principal activa no está disponible.');
    assert(cashBoxes.body.every((cashBox) => /^[A-Z]+$/.test(cashBox.clave)), 'Hay una caja sin clave válida para folios.');

    const primaryMovements = await request(`/movements?caja_id=${principal.id}`, {}, adminToken);
    assert(primaryMovements.status === 200 && primaryMovements.body.every((movement) => Number(movement.caja_id) === Number(principal.id)), 'El filtro de movimientos por caja mezcla registros.');
    assert(primaryMovements.body.every((movement) => movement.folio.startsWith('A-')), 'La caja A contiene un folio sin el prefijo correcto.');
    const invalidCashBox = await request('/movements?caja_id=invalida', {}, adminToken);
    assert(invalidCashBox.status === 400, 'Un filtro de caja inválido no se rechazó.');
    validations.push('aislamiento por caja, catálogo y folios históricos');

    const invalidMovement = await request('/movements', {
      method: 'POST',
      body: JSON.stringify({ caja_id: principal.id, tipo: 'ingreso' }),
    }, adminToken);
    assert(invalidMovement.status === 400, 'Un movimiento incompleto fue aceptado.');

    const movementPayload = (name, amount) => ({
      caja_id: principal.id,
      tipo: 'ingreso',
      fecha: '2026-10-03',
      nombre: name,
      descripcion: 'Movimiento temporal creado por la regresión local.',
      cantidad: amount,
      moneda: 'Dólares',
    });

    const concurrentMovements = await Promise.all([
      request('/movements', { method: 'POST', body: JSON.stringify(movementPayload('QA folio concurrente 1', 1)) }, adminToken),
      request('/movements', { method: 'POST', body: JSON.stringify(movementPayload('QA folio concurrente 2', 2)) }, adminToken),
    ]);
    assert(concurrentMovements.every((result) => result.status === 201), 'La creación concurrente de movimientos falló.');
    concurrentMovements.forEach((result) => createdMovementIds.push(result.body.id));
    const generatedFolios = concurrentMovements.map((result) => result.body.folio);
    assert(new Set(generatedFolios).size === 2 && generatedFolios.every((folio) => /^A-261003\d{2,}$/.test(folio)), 'La generación concurrente de folios no produjo claves A únicas.');

    const firstMovement = concurrentMovements[0].body;
    const updateWithoutReason = await request(`/movements/${firstMovement.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...movementPayload('QA folio concurrente 1 editado', 3), fecha: '2026-10-02' }),
    }, adminToken);
    assert(updateWithoutReason.status === 400, 'Un ajuste sin explicación fue aceptado.');

    const updatedMovement = await request(`/movements/${firstMovement.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...movementPayload('QA folio concurrente 1 editado', 3),
        fecha: '2026-10-02',
        comentario: 'Ajuste temporal validado por la regresión local.',
      }),
    }, adminToken);
    assert(updatedMovement.status === 200, 'No se pudo editar un movimiento válido.');
    assert(updatedMovement.body.folio === firstMovement.folio, 'La edición modificó indebidamente el folio ya emitido.');

    const editHistory = await request(`/movements/edits/history?caja_id=${principal.id}`, {}, adminToken);
    assert(editHistory.status === 200 && editHistory.body.some((item) => Number(item.movement_id) === Number(firstMovement.id)), 'El historial no registró el ajuste del movimiento.');

    const cancelledMovement = await request(`/movements/${firstMovement.id}`, { method: 'DELETE' }, adminToken);
    assert(cancelledMovement.status === 200 && cancelledMovement.body.movement?.tipo === 'cancelado', 'No se pudo cancelar el movimiento de prueba.');
    const repeatedCancel = await request(`/movements/${firstMovement.id}`, { method: 'DELETE' }, adminToken);
    assert(repeatedCancel.status === 400, 'Se permitió cancelar dos veces el mismo movimiento.');
    const cancelledEdit = await request(`/movements/${firstMovement.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...movementPayload('No debe editarse', 4), comentario: 'Intento inválido.' }),
    }, adminToken);
    assert(cancelledEdit.status === 400, 'Se permitió editar un movimiento cancelado.');
    validations.push('alta concurrente, folio por caja, ajuste, historial y cancelación');

    const username = `qa_usuario_${Date.now()}`;
    const userCreation = await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password: 'TemporalQaUsuarioA1!',
        role_key: 'lectura',
        estado: 'inactivo',
        cajas: [],
      }),
    }, adminToken);
    assert(
      userCreation.status === 201,
      `No se pudo crear una cuenta usando solo el campo Usuario (${userCreation.status}: ${userCreation.body.message || 'sin detalle'}).`,
    );
    createdUserId = userCreation.body.id;
    assert(userCreation.body.nombre === username && userCreation.body.username === username, 'El servidor no derivó correctamente el nombre visible a partir del usuario.');
    assert(userCreation.body.role_key === 'lectura' && userCreation.body.role_nombre === 'Lectura', 'La cuenta creada no muestra su rol de usuario.');
    validations.push('alta de cuenta sin campo Nombre visible');

    const editorLogin = await login('edituser', adminPassword);
    assert(editorLogin.status === 200, 'La cuenta local de Edición no pudo iniciar sesión.');
    const editorToken = editorLogin.body.token;
    const editorBoxes = await request('/cajas', {}, editorToken);
    assert(editorBoxes.status === 200 && editorBoxes.body.length === 1 && editorBoxes.body[0].clave === 'B', 'Edición no quedó restringido a su caja B.');
    const foreignRead = await request(`/movements?caja_id=${principal.id}`, {}, editorToken);
    assert(foreignRead.status === 403, 'Edición pudo consultar movimientos de una caja ajena.');
    const foreignWrite = await request('/movements', {
      method: 'POST',
      body: JSON.stringify({ ...movementPayload('Intento fuera de caja', 1), caja_id: principal.id }),
    }, editorToken);
    assert(foreignWrite.status === 403, 'Edición pudo registrar un movimiento en una caja ajena.');

    const readerLogin = await login('readuser', adminPassword);
    assert(readerLogin.status === 200, 'La cuenta local de Lectura no pudo iniciar sesión.');
    const readerToken = readerLogin.body.token;
    const readerBoxes = await request('/cajas', {}, readerToken);
    assert(readerBoxes.status === 200 && readerBoxes.body.length === 1 && readerBoxes.body[0].clave === 'B', 'Lectura no quedó restringido a su caja B.');
    const readerWrite = await request('/movements', {
      method: 'POST',
      body: JSON.stringify({ ...movementPayload('Intento de lectura', 1), caja_id: cajaB.id }),
    }, readerToken);
    assert(readerWrite.status === 403, 'Lectura pudo crear un movimiento.');
    validations.push('permisos reales: administración, edición restringida y lectura');

    console.log(JSON.stringify({ ok: true, validations }, null, 2));
  } finally {
    try {
      await db.query('BEGIN');
      if (createdMovementIds.length) {
        await db.query(
          "DELETE FROM audit_log WHERE entity_type = 'movement' AND entity_id = ANY($1::text[])",
          [createdMovementIds.map(String)],
        );
        await db.query('DELETE FROM movements WHERE id = ANY($1::int[])', [createdMovementIds]);
      }
      if (createdUserId) {
        await db.query("DELETE FROM audit_log WHERE entity_type = 'user' AND entity_id = $1", [String(createdUserId)]);
        await db.query('DELETE FROM users WHERE id = $1', [createdUserId]);
      }
      await db.query('COMMIT');

      if (baseline) {
        const current = await getCounts(db);
        assert(
          Object.keys(baseline).every((key) => Number(current[key]) === Number(baseline[key])),
          'La limpieza de QA no devolvió la copia local a sus conteos originales.',
        );
      }
    } catch (cleanupError) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw cleanupError;
    } finally {
      await db.end();
    }
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
