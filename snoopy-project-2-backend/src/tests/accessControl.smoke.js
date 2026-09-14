// Prueba funcional para una API local: usuarios, sesiones, roles y cajas asignadas.
// Nunca se ejecuta contra una URL remota para evitar tocar datos productivos.

const baseUrl = process.env.TEST_API_URL || 'http://127.0.0.1:4101/api';
const adminUsername = process.env.QA_ADMIN_USERNAME || 'qa_admin_access';
const adminPassword = process.env.QA_ADMIN_PASSWORD;

const parsedUrl = new URL(baseUrl);

if (!['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
  throw new Error('La prueba de acceso solo puede ejecutarse contra una API local.');
}

if (!adminPassword) {
  throw new Error('Define QA_ADMIN_PASSWORD para ejecutar la prueba funcional.');
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

  return { response, body };
}

async function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

async function run() {
  const suffix = `${Date.now()}`;
  const editorUsername = `qa_editor_${suffix}`;
  const readerUsername = `qa_reader_${suffix}`;
  const editorTemporaryPassword = `TemporalEditor${suffix}A1`;
  const editorNewPassword = `EditorSeguro${suffix}B2`;
  const readerTemporaryPassword = `TemporalLectura${suffix}C3`;
  const readerResetPassword = `Restablecida${suffix}D4`;

  const results = [];
  const adminLogin = await login(adminUsername, adminPassword);
  assert(adminLogin.response.status === 200, 'El administrador de QA no pudo iniciar sesión.');
  const adminToken = adminLogin.body.token;
  results.push('login administrador');

  const caseInsensitiveLogin = await login(adminUsername.toUpperCase(), adminPassword);
  assert(caseInsensitiveLogin.response.status === 200, 'El inicio de sesión distinguió mayúsculas y minúsculas innecesariamente.');
  assert(!Object.prototype.hasOwnProperty.call(caseInsensitiveLogin.body.user || {}, 'password_hash'), 'La respuesta de inicio de sesión expuso el hash de contraseña.');

  const unauthenticatedUsers = await request('/users');
  assert(unauthenticatedUsers.response.status === 401, 'La administración de usuarios quedó expuesta sin sesión.');
  const disabledBalanceRoute = await request('/balances');
  assert(disabledBalanceRoute.response.status === 404, 'El módulo de balanza temporalmente oculto sigue accesible por API.');
  results.push('protección de rutas y datos de sesión');

  const configuration = await request('/users/configuration', {}, adminToken);
  assert(configuration.response.status === 200, 'No se pudo consultar la configuración de usuarios.');
  assert(configuration.body.roles?.length >= 3, 'No están disponibles los perfiles iniciales.');
  const normalCashBox = configuration.body.cash_boxes?.find((cashBox) => cashBox.principal) || configuration.body.cash_boxes?.[0];
  const secondaryCashBox = configuration.body.cash_boxes?.find((cashBox) => cashBox.id !== normalCashBox?.id);
  assert(normalCashBox, 'No existe una caja para probar asignaciones.');
  results.push('perfiles y catálogo de cajas');

  const roleConfiguration = await request('/roles/configuration', {}, adminToken);
  assert(roleConfiguration.response.status === 200 && roleConfiguration.body.permissions?.length >= 4, 'No se pudo consultar la configuración de perfiles.');
  const customRoleCreation = await request('/roles', {
    method: 'POST',
    body: JSON.stringify({
      nombre: `QA Supervisor ${suffix}`,
      descripcion: 'Perfil temporal de validación local.',
      activa: true,
      permissions: ['cash_boxes.read.assigned', 'movements.read.assigned', 'reports.read.assigned'],
    }),
  }, adminToken);
  assert(customRoleCreation.response.status === 201 && !customRoleCreation.body.es_sistema, 'No se pudo crear un perfil personalizado seguro.');
  const customRoleUpdate = await request(`/roles/${customRoleCreation.body.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: `QA Supervisor ${suffix}`,
      descripcion: 'Perfil temporal actualizado por validación local.',
      activa: true,
      permissions: ['cash_boxes.read.assigned', 'movements.read.assigned', 'movements.create.assigned', 'movements.edit.assigned', 'reports.read.assigned'],
    }),
  }, adminToken);
  assert(customRoleUpdate.response.status === 200 && customRoleUpdate.body.permissions.includes('movements.create.assigned'), 'No se pudo actualizar el perfil personalizado.');
  const usersConfigurationWithCustomRole = await request('/users/configuration', {}, adminToken);
  assert(usersConfigurationWithCustomRole.body.roles?.some((role) => Number(role.id) === Number(customRoleCreation.body.id)), 'El perfil personalizado no quedó disponible para asignar usuarios.');
  const forbiddenRolePermission = await request('/roles', {
    method: 'POST',
    body: JSON.stringify({
      nombre: `QA No Permitido ${suffix}`,
      permissions: ['cash_boxes.read.assigned', 'movements.read.assigned', 'users.manage'],
    }),
  }, adminToken);
  assert(forbiddenRolePermission.response.status === 400, 'Un perfil personalizado recibió permisos administrativos.');
  const baseAdminRole = configuration.body.roles.find((role) => role.clave === 'admin');
  const forbiddenBaseRoleUpdate = await request(`/roles/${baseAdminRole.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: 'Administrador alterado',
      permissions: ['cash_boxes.read.assigned', 'movements.read.assigned'],
    }),
  }, adminToken);
  assert(forbiddenBaseRoleUpdate.response.status === 400, 'Se pudo modificar un perfil base protegido.');
  results.push('perfiles personalizados con alcance limitado');

  const selfDeactivation = await request(`/users/${adminLogin.body.user.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: adminLogin.body.user.nombre,
      username: adminLogin.body.user.username,
      role_key: 'admin',
      estado: 'inactivo',
      cajas: [],
    }),
  }, adminToken);
  assert(selfDeactivation.response.status === 400, 'Se permitió desactivar al administrador actual.');
  results.push('protección del último administrador');

  const editorCreation = await request('/users', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'QA Edición',
      username: editorUsername,
      password: editorTemporaryPassword,
      role_key: customRoleUpdate.body.clave,
      estado: 'activo',
      cajas: [{ cash_box_id: normalCashBox.id, access_level: 'editor' }],
    }),
  }, adminToken);
  assert(editorCreation.response.status === 201, 'No se pudo crear un usuario de edición.');
  const editorId = editorCreation.body.id;
  assert(editorCreation.body.must_change_password, 'El usuario nuevo no exige cambio de contraseña.');
  assert(editorCreation.body.onboarding_status === 'pendiente', 'El usuario nuevo no quedó con guía pendiente.');
  results.push('creación de usuario con contraseña temporal');

  const editorLogin = await login(editorUsername, editorTemporaryPassword);
  assert(editorLogin.response.status === 200, 'El usuario de edición no pudo iniciar con su contraseña temporal.');
  const editorBlocked = await request('/cajas', {}, editorLogin.body.token);
  assert(editorBlocked.response.status === 403 && editorBlocked.body.code === 'PASSWORD_CHANGE_REQUIRED', 'La contraseña temporal no bloqueó el acceso operativo.');

  const editorPasswordChange = await request('/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: editorTemporaryPassword, new_password: editorNewPassword }),
  }, editorLogin.body.token);
  assert(editorPasswordChange.response.status === 200, 'No se pudo cambiar la contraseña temporal.');
  const editorToken = editorPasswordChange.body.token;
  results.push('cambio obligatorio de contraseña');

  const editorCashBoxes = await request('/cajas', {}, editorToken);
  assert(editorCashBoxes.response.status === 200, 'El usuario de edición no pudo consultar su caja.');
  assert(editorCashBoxes.body.length === 1 && Number(editorCashBoxes.body[0].id) === Number(normalCashBox.id), 'El usuario de edición vio cajas ajenas.');

  if (secondaryCashBox) {
    const foreignMovements = await request(`/movements?caja_id=${secondaryCashBox.id}`, {}, editorToken);
    assert(foreignMovements.response.status === 403, 'El usuario de edición consultó movimientos de una caja ajena.');
  }

  const ownMovements = await request(`/movements?caja_id=${normalCashBox.id}`, {}, editorToken);
  assert(ownMovements.response.status === 200, 'El usuario de edición no pudo consultar sus movimientos.');
  const invalidCashBoxFilter = await request('/movements?caja_id=invalida', {}, editorToken);
  assert(invalidCashBoxFilter.response.status === 400, 'El filtro de caja inválido no fue rechazado.');

  const movementCreation = await request('/movements', {
    method: 'POST',
    body: JSON.stringify({
      caja_id: normalCashBox.id,
      tipo: 'ingreso',
      fecha: '2026-09-14',
      nombre: 'Registro QA de acceso',
      descripcion: 'Movimiento temporal creado por prueba automática local.',
      cantidad: 1,
      moneda: 'Pesos',
    }),
  }, editorToken);
  assert(movementCreation.response.status === 201, 'El usuario de edición no pudo registrar en su caja.');
  const testMovement = movementCreation.body;

  const movementUpdate = await request(`/movements/${testMovement.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      tipo: 'ingreso',
      fecha: '2026-09-14',
      nombre: 'Registro QA de acceso',
      descripcion: 'Movimiento temporal actualizado por prueba automática local.',
      cantidad: 2,
      moneda: 'Pesos',
      comentario: 'Validación de permiso de edición.',
    }),
  }, editorToken);
  assert(movementUpdate.response.status === 200, 'El usuario de edición no pudo editar su movimiento.');

  const editorCancel = await request(`/movements/${testMovement.id}`, { method: 'DELETE' }, editorToken);
  assert(editorCancel.response.status === 403, 'El usuario de edición pudo cancelar un movimiento.');

  const customRoleWriteRevocation = await request(`/roles/${customRoleCreation.body.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: `QA Supervisor ${suffix}`,
      descripcion: 'Perfil temporal sin escritura para validar revocación inmediata.',
      activa: true,
      permissions: ['cash_boxes.read.assigned', 'movements.read.assigned', 'reports.read.assigned'],
    }),
  }, adminToken);
  assert(customRoleWriteRevocation.response.status === 200, 'No se pudo actualizar el perfil de validación.');
  const editorWriteRevoked = await request('/movements', {
    method: 'POST',
    body: JSON.stringify({
      caja_id: normalCashBox.id,
      tipo: 'ingreso',
      fecha: '2026-09-14',
      nombre: 'Intento después de revocación',
      descripcion: 'Debe ser rechazado sin reiniciar sesión.',
      cantidad: 1,
      moneda: 'Pesos',
    }),
  }, editorToken);
  assert(editorWriteRevoked.response.status === 403, 'El cambio de permisos no se aplicó a una sesión ya abierta.');
  const usersAfterRoleUpdate = await request('/users', {}, adminToken);
  const editorAfterRoleUpdate = usersAfterRoleUpdate.body.find((user) => Number(user.id) === Number(editorId));
  assert(editorAfterRoleUpdate?.cajas?.[0]?.access_level === 'reader', 'La etiqueta por caja no se ajustó después de convertir el perfil a lectura.');

  const adminCancel = await request(`/movements/${testMovement.id}`, { method: 'DELETE' }, adminToken);
  assert(adminCancel.response.status === 200, 'El administrador no pudo cancelar el movimiento de prueba.');
  results.push('permisos por caja, revocación inmediata y cancelación exclusiva de administración');

  const readerCreation = await request('/users', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'QA Lectura',
      username: readerUsername,
      password: readerTemporaryPassword,
      role_key: 'lectura',
      estado: 'activo',
      // El servidor ignora un nivel visual incompatible y lo deriva del perfil.
      cajas: [{ cash_box_id: normalCashBox.id, access_level: 'owner' }],
    }),
  }, adminToken);
  assert(readerCreation.response.status === 201, 'No se pudo crear un usuario de lectura.');
  const readerId = readerCreation.body.id;
  assert(readerCreation.body.cajas?.[0]?.access_level === 'reader', 'Una cuenta de lectura conservó una etiqueta de acceso incompatible.');

  const readerLogin = await login(readerUsername, readerTemporaryPassword);
  assert(readerLogin.response.status === 200, 'El usuario de lectura no pudo iniciar sesión.');
  const readerPasswordChange = await request('/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: readerTemporaryPassword, new_password: `LecturaSegura${suffix}E5` }),
  }, readerLogin.body.token);
  assert(readerPasswordChange.response.status === 200, 'El usuario de lectura no pudo cambiar su contraseña temporal.');
  const readerToken = readerPasswordChange.body.token;

  const readerMovementCreation = await request('/movements', {
    method: 'POST',
    body: JSON.stringify({
      caja_id: normalCashBox.id,
      tipo: 'ingreso',
      fecha: '2026-09-14',
      nombre: 'Intento QA',
      descripcion: 'No debe permitirse para lectura.',
      cantidad: 1,
      moneda: 'Pesos',
    }),
  }, readerToken);
  assert(readerMovementCreation.response.status === 403, 'El usuario de lectura pudo crear movimientos.');

  const resetReader = await request(`/users/${readerId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password: readerResetPassword }),
  }, adminToken);
  assert(resetReader.response.status === 200, 'No se pudo restablecer la contraseña del usuario de lectura.');
  const revokedReaderSession = await request('/auth/me', {}, readerToken);
  assert(revokedReaderSession.response.status === 401, 'El restablecimiento no invalidó la sesión anterior.');
  results.push('lectura sin escritura y restablecimiento administrativo');

  const editorDeactivation = await request(`/users/${editorId}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: 'QA Edición',
      username: editorUsername,
      role_key: customRoleUpdate.body.clave,
      estado: 'inactivo',
      cajas: [{ cash_box_id: normalCashBox.id, access_level: 'editor' }],
    }),
  }, adminToken);
  assert(editorDeactivation.response.status === 200, 'No se pudo desactivar el usuario de edición.');
  const revokedEditorSession = await request('/cajas', {}, editorToken);
  assert(revokedEditorSession.response.status === 401, 'La desactivación no invalidó la sesión del usuario.');
  results.push('desactivación inmediata de sesión');

  const secondAdminUsername = `qa_admin_two_${suffix}`;
  const secondAdminTemporaryPassword = `TemporalAdmin${suffix}F6`;
  const secondAdminNewPassword = `AdminSeguro${suffix}G7`;

  // La copia local puede traer administradores históricos. Para que la carrera
  // pruebe el borde real (exactamente dos administradores), se dejan inactivos
  // solo dentro de esta base de QA y se conserva el administrador de la prueba.
  const usersBeforeAdminRace = await request('/users', {}, adminToken);
  assert(usersBeforeAdminRace.response.status === 200, 'No se pudo preparar la prueba de concurrencia administrativa.');
  for (const user of usersBeforeAdminRace.body) {
    if (user.id === adminLogin.body.user.id || user.estado !== 'activo' || user.role_key !== 'admin') continue;
    const historicalAdminDeactivation = await request(`/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: user.nombre,
        username: user.username,
        role_key: 'admin',
        estado: 'inactivo',
        cajas: [],
      }),
    }, adminToken);
    assert(historicalAdminDeactivation.response.status === 200, 'No se pudo aislar la prueba de administradores en la base local.');
  }

  const secondAdminCreation = await request('/users', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'QA Administrador dos',
      username: secondAdminUsername,
      password: secondAdminTemporaryPassword,
      role_key: 'admin',
      estado: 'activo',
      cajas: [],
    }),
  }, adminToken);
  assert(secondAdminCreation.response.status === 201, 'No se pudo crear el segundo administrador para la prueba de concurrencia.');
  const secondAdminLogin = await login(secondAdminUsername, secondAdminTemporaryPassword);
  assert(secondAdminLogin.response.status === 200, 'El segundo administrador no pudo iniciar sesión.');
  const secondAdminPasswordChange = await request('/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: secondAdminTemporaryPassword, new_password: secondAdminNewPassword }),
  }, secondAdminLogin.body.token);
  assert(secondAdminPasswordChange.response.status === 200, 'El segundo administrador no pudo cambiar su contraseña temporal.');

  const deactivatePrimaryAdmin = request(`/users/${adminLogin.body.user.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: adminLogin.body.user.nombre,
      username: adminLogin.body.user.username,
      role_key: 'admin',
      estado: 'inactivo',
      cajas: [],
    }),
  }, secondAdminPasswordChange.body.token);
  const deactivateSecondAdmin = request(`/users/${secondAdminCreation.body.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: secondAdminCreation.body.nombre,
      username: secondAdminCreation.body.username,
      role_key: 'admin',
      estado: 'inactivo',
      cajas: [],
    }),
  }, adminToken);
  const concurrentAdminUpdates = await Promise.all([deactivatePrimaryAdmin, deactivateSecondAdmin]);
  const successfulDeactivations = concurrentAdminUpdates.filter((result) => result.response.status === 200);
  const rejectedDeactivations = concurrentAdminUpdates.filter((result) => result.response.status === 400);
  assert(successfulDeactivations.length === 1 && rejectedDeactivations.length === 1, 'La protección concurrente del último administrador falló.');
  const survivingAdminToken = concurrentAdminUpdates[0].response.status === 200
    ? secondAdminPasswordChange.body.token
    : adminToken;
  const usersAfterRace = await request('/users', {}, survivingAdminToken);
  assert(usersAfterRace.response.status === 200, 'No se pudo comprobar el administrador restante.');
  const activeAdmins = usersAfterRace.body.filter((user) => user.estado === 'activo' && user.role_key === 'admin');
  assert(activeAdmins.length >= 1, 'La concurrencia dejó al sistema sin administrador activo.');
  results.push('protección concurrente del último administrador');

  console.log(JSON.stringify({ ok: true, validations: results }, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
