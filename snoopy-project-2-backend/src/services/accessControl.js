// Propósito: centralizar la resolución de permisos y el alcance de cajas por usuario.

const pool = require('../config/db');

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values) {
  return [...new Set(values)];
}

function formatUserAccess(row) {
  if (!row) return null;

  const roles = unique(normalizeArray(row.roles));
  const permissions = unique(normalizeArray(row.permissions));

  return {
    id: Number(row.id),
    username: row.username,
    nombre: row.nombre || row.username,
    estado: row.estado,
    // El perfil mostrado debe ser determinista incluso si una instalación
    // anterior tiene más de una asignación de perfil para la misma cuenta.
    role: row.primary_role || row.legacy_role || roles[0] || '',
    roles,
    permissions,
    must_change_password: Boolean(row.must_change_password),
    onboarding_status: row.onboarding_status,
    token_version: Number(row.token_version || 1),
    last_login_at: row.last_login_at,
  };
}

async function getUserAccess(userId, db = pool) {
  const result = await db.query(
    `
      SELECT
        u.id,
        u.username,
        u.nombre,
        u.estado,
        u.role AS legacy_role,
        u.must_change_password,
        u.onboarding_status,
        u.token_version,
        u.last_login_at,
        COALESCE((
          SELECT primary_role.clave
          FROM user_roles primary_assignment
          INNER JOIN roles primary_role ON primary_role.id = primary_assignment.role_id
          WHERE primary_assignment.user_id = u.id AND primary_role.activo = TRUE
          ORDER BY primary_role.nivel DESC, primary_role.id ASC
          LIMIT 1
        ), u.role) AS primary_role,
        COALESCE(
          array_agg(DISTINCT r.clave) FILTER (WHERE r.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS roles,
        COALESCE(
          array_agg(DISTINCT p.codigo) FILTER (WHERE p.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS permissions
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id AND r.activo = TRUE
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id
      LIMIT 1
    `,
    [userId],
  );

  return formatUserAccess(result.rows[0]);
}

function safeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    nombre: user.nombre,
    role: user.role,
    roles: user.roles,
    permissions: user.permissions,
    estado: user.estado,
    must_change_password: user.must_change_password,
    onboarding_status: user.onboarding_status,
  };
}

function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

function hasAnyPermission(user, permissions) {
  return permissions.some((permission) => hasPermission(user, permission));
}

function permissionCodes(resource, action) {
  return {
    all: `${resource}.${action}.all`,
    assigned: `${resource}.${action}.assigned`,
  };
}

async function getAssignedCashBoxIds(userId, db = pool) {
  const result = await db.query(
    'SELECT cash_box_id FROM cash_box_members WHERE user_id = $1 ORDER BY cash_box_id',
    [userId],
  );

  return result.rows.map((row) => Number(row.cash_box_id));
}

async function getCashBoxScope(user, resource, action, db = pool) {
  const codes = permissionCodes(resource, action);

  if (hasPermission(user, codes.all)) {
    return { all: true, cashBoxIds: [] };
  }

  if (!hasPermission(user, codes.assigned)) {
    return { all: false, cashBoxIds: [] };
  }

  return {
    all: false,
    cashBoxIds: await getAssignedCashBoxIds(user.id, db),
  };
}

async function canAccessCashBox(user, cashBoxId, resource, action, db = pool) {
  const normalizedId = Number(cashBoxId);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return false;

  const scope = await getCashBoxScope(user, resource, action, db);
  return scope.all || scope.cashBoxIds.includes(normalizedId);
}

async function getCashBoxMembership(userId, cashBoxId, db = pool) {
  const result = await db.query(
    `
      SELECT access_level
      FROM cash_box_members
      WHERE user_id = $1 AND cash_box_id = $2
      LIMIT 1
    `,
    [userId, cashBoxId],
  );

  return result.rows[0]?.access_level || null;
}

async function writeAuditLog({ actorUserId = null, action, entityType, entityId = null, detail = {} }, db = pool) {
  await db.query(
    `
      INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, detail)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [actorUserId, action, entityType, entityId === null ? null : String(entityId), JSON.stringify(detail)],
  );
}

module.exports = {
  canAccessCashBox,
  getAssignedCashBoxIds,
  getCashBoxMembership,
  getCashBoxScope,
  getUserAccess,
  hasAnyPermission,
  hasPermission,
  permissionCodes,
  safeUser,
  writeAuditLog,
};
