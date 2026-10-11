// Prueba local del alta y restablecimiento administrado de contraseñas.
// Nunca acepta una API o base de datos remota y elimina lo que crea al terminar.

const { Client } = require('pg');

const baseUrl = process.env.TEST_API_URL || 'http://127.0.0.1:4000/api';
const databaseUrl = process.env.QA_DATABASE_URL || '';
const adminUsername = process.env.QA_ADMIN_USERNAME || 'adminuser';
const adminPassword = process.env.QA_ADMIN_PASSWORD || '';

const parsedApiUrl = new URL(baseUrl);
const parsedDatabaseUrl = databaseUrl ? new URL(databaseUrl) : null;

if (!['localhost', '127.0.0.1'].includes(parsedApiUrl.hostname)) {
  throw new Error('La prueba de contraseñas solo puede solicitar una API local.');
}

if (!parsedDatabaseUrl || !['localhost', '127.0.0.1'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error('La prueba de contraseñas solo puede usar una base de datos local.');
}

if (!/^\/snoopy_project_2\/?$/.test(parsedDatabaseUrl.pathname)) {
  throw new Error('La prueba requiere explícitamente la copia local snoopy_project_2.');
}

if (!adminPassword) {
  throw new Error('Define QA_ADMIN_PASSWORD para ejecutar la prueba local.');
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

async function run() {
  const db = new Client({ connectionString: databaseUrl, ssl: false });
  const username = `qa_password_${Date.now()}`;
  let userId = null;
  let baseline = null;
  const validations = [];

  await db.connect();

  try {
    baseline = (await db.query(`
      SELECT
        (SELECT COUNT(*)::integer FROM users) AS users_count,
        (SELECT COUNT(*)::integer FROM audit_log) AS audits_count
    `)).rows[0];

    const adminLogin = await login(adminUsername, adminPassword);
    assert(adminLogin.status === 200, 'La cuenta administradora local no pudo iniciar sesión.');
    const adminToken = adminLogin.body.token;

    const config = await request('/users/configuration', {}, adminToken);
    assert(config.status === 200, 'No se pudo consultar la configuración de usuarios.');
    const cashBox = config.body.cash_boxes?.find((item) => item.clave === 'B') || config.body.cash_boxes?.[0];
    assert(cashBox, 'No hay una caja disponible para validar el acceso del usuario.');

    const invalidPasswords = ['Simple2026', 'SoloLetras!', '123456!'];
    for (const password of invalidPasswords) {
      const invalidCreation = await request('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: `${username}_${invalidPasswords.indexOf(password)}`,
          password,
          role_key: 'lectura',
          estado: 'inactivo',
          cajas: [],
        }),
      }, adminToken);
      assert(invalidCreation.status === 400, 'Se aceptó una contraseña que no cumple la política.');
    }
    validations.push('política de letra, número y carácter especial');

    const initialPassword = 'ClaveInicial2026!';
    const creation = await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password: initialPassword,
        role_key: 'lectura',
        estado: 'activo',
        cajas: [{ cash_box_id: cashBox.id, access_level: 'reader' }],
      }),
    }, adminToken);
    assert(creation.status === 201, 'No se pudo crear el usuario de validación.');
    userId = creation.body.id;
    assert(creation.body.must_change_password === false, 'El usuario creado todavía exige cambiar una contraseña temporal.');
    assert(creation.body.onboarding_status === 'pendiente', 'La guía inicial no quedó pendiente para una cuenta nueva.');

    const firstLogin = await login(username, initialPassword);
    assert(firstLogin.status === 200, 'El usuario no pudo acceder con la contraseña definida por administración.');
    const firstToken = firstLogin.body.token;
    const boxes = await request('/cajas', {}, firstToken);
    assert(boxes.status === 200 && boxes.body.some((item) => Number(item.id) === Number(cashBox.id)), 'El usuario no pudo operar inmediatamente con su caja asignada.');
    validations.push('alta con contraseña final y acceso inmediato');

    const legacyPasswordRoute = await request('/auth/password', { method: 'PUT' }, firstToken);
    assert(legacyPasswordRoute.status === 404, 'El flujo anterior de contraseña temporal sigue expuesto.');

    const newPassword = 'NuevaClave2026!';
    const reset = await request(`/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: newPassword }),
    }, adminToken);
    assert(reset.status === 200, 'El administrador no pudo restablecer la contraseña.');

    const oldSession = await request('/auth/me', {}, firstToken);
    assert(oldSession.status === 401, 'El restablecimiento no cerró la sesión anterior.');
    const secondLogin = await login(username, newPassword);
    assert(secondLogin.status === 200, 'El usuario no pudo acceder con la nueva contraseña asignada.');
    assert(secondLogin.body.user?.must_change_password === false, 'El restablecimiento activó un cambio de contraseña obligatorio.');
    const secondBoxes = await request('/cajas', {}, secondLogin.body.token);
    assert(secondBoxes.status === 200, 'El usuario no puede operar después de un restablecimiento administrativo.');
    validations.push('restablecimiento administrativo sin contraseña temporal');

    console.log(JSON.stringify({ ok: true, validations }, null, 2));
  } finally {
    try {
      if (userId) {
        await db.query('BEGIN');
        await db.query("DELETE FROM audit_log WHERE entity_type = 'user' AND entity_id = $1", [String(userId)]);
        await db.query('DELETE FROM cash_box_members WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM users WHERE id = $1', [userId]);
        await db.query('COMMIT');
      }

      if (baseline) {
        const current = (await db.query(`
          SELECT
            (SELECT COUNT(*)::integer FROM users) AS users_count,
            (SELECT COUNT(*)::integer FROM audit_log) AS audits_count
        `)).rows[0];
        assert(
          Number(current.users_count) === Number(baseline.users_count)
            && Number(current.audits_count) === Number(baseline.audits_count),
          'La prueba no devolvió la copia local a sus conteos originales.',
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
