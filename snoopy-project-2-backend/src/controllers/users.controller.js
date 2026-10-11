// Propósito: administración de cuentas, perfiles y cajas asignadas.

const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { safeUser, writeAuditLog } = require('../services/accessControl');
const { validatePassword } = require('../services/passwordPolicy');

const VALID_STATUSES = ['activo', 'inactivo'];
const VALID_ACCESS_LEVELS = ['owner', 'editor', 'reader'];

function getValidId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUserData(payload, { isCreate = false } = {}) {
  const username = normalizeUsername(payload.username);
  // Se mantiene la columna nombre por compatibilidad con instalaciones previas,
  // pero la cuenta se identifica únicamente por su usuario.
  const nombre = username;
  const roleKey = String(payload.role_key || '').trim();
  const estado = String(payload.estado || 'activo').trim();
  const assignments = Array.isArray(payload.cajas) ? payload.cajas : [];

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    return { error: 'El usuario debe tener entre 3 y 50 caracteres: letras, números, punto, guion o guion bajo.' };
  }

  if (!roleKey) {
    return { error: 'Selecciona un rol de usuario.' };
  }

  if (!VALID_STATUSES.includes(estado)) {
    return { error: 'El estado de la cuenta no es válido.' };
  }

  const normalizedAssignments = [];
  const seenCashBoxes = new Set();

  for (const assignment of assignments) {
    const cashBoxId = getValidId(assignment?.cash_box_id);
    const accessLevel = String(assignment?.access_level || 'editor').trim();

    if (!cashBoxId || !VALID_ACCESS_LEVELS.includes(accessLevel) || seenCashBoxes.has(cashBoxId)) {
      return { error: 'Las cajas seleccionadas no son válidas.' };
    }

    seenCashBoxes.add(cashBoxId);
    normalizedAssignments.push({ cashBoxId, accessLevel });
  }

  const password = String(payload.password || '');
  if (isCreate) {
    const passwordError = validatePassword(password);
    if (passwordError) return { error: passwordError };
  }

  return {
    data: { nombre, username, roleKey, estado, assignments, normalizedAssignments, password },
  };
}

async function getRoleByKey(roleKey, db = pool) {
  const result = await db.query(
    `
      SELECT
        r.id,
        r.clave,
        r.nombre,
        COALESCE(
          array_agg(DISTINCT p.codigo) FILTER (WHERE p.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.clave = $1 AND r.activo = TRUE
      GROUP BY r.id
      LIMIT 1
    `,
    [roleKey],
  );
  return result.rows[0] || null;
}

function getAccessLevelForRole(role) {
  if (role.clave === 'admin') return 'owner';

  const permissions = Array.isArray(role.permissions) ? role.permissions : [];
  return permissions.some((permission) => (
    permission === 'movements.create.assigned' || permission === 'movements.edit.assigned'
  ))
    ? 'editor'
    : 'reader';
}

function normalizeAssignmentsForRole(assignments, role) {
  const accessLevel = getAccessLevelForRole(role);
  return assignments.map(({ cashBoxId }) => ({ cashBoxId, accessLevel }));
}

async function validateAssignments(assignments, db = pool) {
  if (!assignments.length) return true;

  const ids = assignments.map((assignment) => assignment.cashBoxId);
  const result = await db.query('SELECT id FROM cash_boxes WHERE id = ANY($1::int[])', [ids]);
  return result.rowCount === ids.length;
}

async function isLastActiveAdmin(userId, currentRoleKey, nextRoleKey, nextStatus, db = pool) {
  if (currentRoleKey !== 'admin' || (nextRoleKey === 'admin' && nextStatus === 'activo')) {
    return false;
  }

  const result = await db.query(
    `
      SELECT COUNT(DISTINCT u.id)::integer AS total
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE u.estado = 'activo' AND r.clave = 'admin'
    `,
  );

  return Number(result.rows[0]?.total || 0) <= 1;
}

async function getUserDetail(userId, db = pool) {
  const result = await db.query(
    `
      SELECT
        u.id,
        u.nombre,
        u.username,
        u.estado,
        u.must_change_password,
        u.onboarding_status,
        u.last_login_at,
        u.created_at,
        creator.username AS created_by_username,
        COALESCE((
          SELECT r.clave
          FROM user_roles ur
          INNER JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id
          ORDER BY r.nivel DESC, r.id ASC
          LIMIT 1
        ), u.role) AS role_key,
        COALESCE((
          SELECT r.nombre
          FROM user_roles ur
          INNER JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id
          ORDER BY r.nivel DESC, r.id ASC
          LIMIT 1
        ), u.role) AS role_nombre,
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'cash_box_id', cb.id,
              'nombre', cb.nombre,
              'clave', cb.clave,
              'activa', cb.activa,
              'access_level', cbm.access_level
            ) ORDER BY cb.nombre
          )
          FROM cash_box_members cbm
          INNER JOIN cash_boxes cb ON cb.id = cbm.cash_box_id
          WHERE cbm.user_id = u.id
        ), '[]'::json) AS cajas
      FROM users u
      LEFT JOIN users creator ON creator.id = u.created_by
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

async function listUsers(req, res) {
  try {
    const result = await pool.query(
      `
        SELECT u.id
        FROM users u
        ORDER BY u.estado ASC, u.nombre ASC, u.id ASC
      `,
    );

    const users = await Promise.all(result.rows.map((row) => getUserDetail(row.id)));
    return res.json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({ message: 'No fue posible obtener los usuarios.' });
  }
}

async function getUserConfiguration(req, res) {
  try {
    const [rolesResult, cashBoxesResult] = await Promise.all([
      pool.query(
        `
          SELECT id, clave, nombre, descripcion, nivel
          FROM roles
          WHERE activo = TRUE
          ORDER BY nivel DESC, id ASC
        `,
      ),
      pool.query(
        `
          SELECT id, nombre, clave, activa, principal
          FROM cash_boxes
          ORDER BY activa DESC, principal DESC, nombre ASC
        `,
      ),
    ]);

    return res.json({ roles: rolesResult.rows, cash_boxes: cashBoxesResult.rows });
  } catch (error) {
    console.error('Error al obtener configuración de usuarios:', error);
    return res.status(500).json({ message: 'No fue posible obtener la configuración de usuarios.' });
  }
}

async function createUser(req, res) {
  const validation = validateUserData(req.body, { isCreate: true });
  if (validation.error) return res.status(400).json({ message: validation.error });

  const { nombre, username, roleKey, estado, normalizedAssignments, password } = validation.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const role = await getRoleByKey(roleKey, client);
    if (!role) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El perfil seleccionado no está disponible.' });
    }

    const roleAssignments = normalizeAssignmentsForRole(normalizedAssignments, role);

    if (roleKey !== 'admin' && estado === 'activo' && roleAssignments.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Asigna al menos una caja a un usuario activo que no sea administrador.' });
    }

    if (!await validateAssignments(roleAssignments, client)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Una o más cajas seleccionadas no existen.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `
        INSERT INTO users (
          username, nombre, password_hash, role, estado, must_change_password, onboarding_status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, FALSE, 'pendiente', $6)
        RETURNING id
      `,
      [username, nombre, passwordHash, role.clave, estado, req.user.id],
    );

    const userId = userResult.rows[0].id;

    await client.query(
      'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)',
      [userId, role.id, req.user.id],
    );

    for (const assignment of roleAssignments) {
      await client.query(
        `
          INSERT INTO cash_box_members (cash_box_id, user_id, access_level, assigned_by)
          VALUES ($1, $2, $3, $4)
        `,
        [assignment.cashBoxId, userId, assignment.accessLevel, req.user.id],
      );
    }

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'user.created',
      entityType: 'user',
      entityId: userId,
      detail: { username, role_key: role.clave, estado, cash_boxes: roleAssignments.map((item) => item.cashBoxId) },
    }, client);

    await client.query('COMMIT');
    return res.status(201).json(await getUserDetail(userId));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un usuario con ese nombre de inicio de sesión.' });
    }

    console.error('Error al crear usuario:', error);
    return res.status(500).json({ message: 'No fue posible crear el usuario.' });
  } finally {
    client.release();
  }
}

async function updateUser(req, res) {
  const userId = getValidId(req.params.id);
  if (!userId) return res.status(400).json({ message: 'El identificador del usuario no es válido.' });

  const validation = validateUserData(req.body);
  if (validation.error) return res.status(400).json({ message: validation.error });

  const { nombre, username, roleKey, estado, normalizedAssignments } = validation.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Serializa los cambios de administrador para que solicitudes simultáneas
    // no puedan dejar al sistema sin una cuenta administradora activa.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('users-last-active-admin'))");

    const current = await getUserDetail(userId, client);
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No se encontró el usuario.' });
    }

    if (userId === req.user.id && estado !== 'activo') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No puedes desactivar tu propia cuenta.' });
    }

    if (await isLastActiveAdmin(userId, current.role_key, roleKey, estado, client)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Debe permanecer al menos un administrador activo.' });
    }

    const role = await getRoleByKey(roleKey, client);
    if (!role) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El perfil seleccionado no está disponible.' });
    }

    const roleAssignments = normalizeAssignmentsForRole(normalizedAssignments, role);

    if (roleKey !== 'admin' && estado === 'activo' && roleAssignments.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Asigna al menos una caja a un usuario activo que no sea administrador.' });
    }

    if (!await validateAssignments(roleAssignments, client)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Una o más cajas seleccionadas no existen.' });
    }

    const changesSession = current.estado !== estado || current.role_key !== role.clave;
    await client.query(
      `
        UPDATE users
        SET
          nombre = $1,
          username = $2,
          role = $3,
          estado = $4,
          token_version = token_version + CASE WHEN $5 THEN 1 ELSE 0 END
        WHERE id = $6
      `,
      [nombre, username, role.clave, estado, changesSession, userId],
    );

    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await client.query(
      'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)',
      [userId, role.id, req.user.id],
    );
    await client.query('DELETE FROM cash_box_members WHERE user_id = $1', [userId]);

    for (const assignment of roleAssignments) {
      await client.query(
        `
          INSERT INTO cash_box_members (cash_box_id, user_id, access_level, assigned_by)
          VALUES ($1, $2, $3, $4)
        `,
        [assignment.cashBoxId, userId, assignment.accessLevel, req.user.id],
      );
    }

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'user.updated',
      entityType: 'user',
      entityId: userId,
      detail: { username, role_key: role.clave, estado, cash_boxes: roleAssignments.map((item) => item.cashBoxId) },
    }, client);

    await client.query('COMMIT');
    return res.json(await getUserDetail(userId));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un usuario con ese nombre de inicio de sesión.' });
    }

    console.error('Error al actualizar usuario:', error);
    return res.status(500).json({ message: 'No fue posible actualizar el usuario.' });
  } finally {
    client.release();
  }
}

async function resetUserPassword(req, res) {
  const userId = getValidId(req.params.id);
  const password = String(req.body?.password || '');
  const passwordError = validatePassword(password);

  if (!userId) return res.status(400).json({ message: 'El identificador del usuario no es válido.' });
  if (passwordError) return res.status(400).json({ message: passwordError });

  try {
    const user = await getUserDetail(userId);
    if (!user) return res.status(404).json({ message: 'No se encontró el usuario.' });

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `
        UPDATE users
        SET password_hash = $1, must_change_password = FALSE, token_version = token_version + 1
        WHERE id = $2
      `,
      [passwordHash, userId],
    );

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: userId,
      detail: { username: user.username },
    });

    return res.json({ message: 'La contraseña se actualizó y se cerraron sus sesiones activas.' });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    return res.status(500).json({ message: 'No fue posible restablecer la contraseña.' });
  }
}

async function getMyProfile(req, res) {
  return res.json({ user: safeUser(req.user) });
}

module.exports = {
  createUser,
  getMyProfile,
  getUserConfiguration,
  listUsers,
  resetUserPassword,
  updateUser,
};
