// Propósito: administrar perfiles personalizados sin debilitar el perfil Administrador.

const pool = require('../config/db');
const { writeAuditLog } = require('../services/accessControl');

const CUSTOM_ROLE_PERMISSIONS = [
  'cash_boxes.read.assigned',
  'movements.read.assigned',
  'movements.create.assigned',
  'movements.edit.assigned',
  'reports.read.assigned',
  'reports.export.assigned',
];

function getValidId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizePermissionCodes(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function validateRolePayload(payload) {
  const nombre = String(payload?.nombre || '').trim();
  const descripcion = String(payload?.descripcion || '').trim() || null;
  const activa = payload?.activa === undefined ? true : payload.activa === true;
  const permissions = normalizePermissionCodes(payload?.permissions);

  if (!nombre || nombre.length > 80) {
    return { error: 'Indica un nombre de entre 1 y 80 caracteres.' };
  }

  if (descripcion && descripcion.length > 255) {
    return { error: 'La descripción no puede superar 255 caracteres.' };
  }

  if (!permissions || !permissions.every((permission) => CUSTOM_ROLE_PERMISSIONS.includes(permission))) {
    return { error: 'El perfil incluye permisos que solo corresponden a administración.' };
  }

  if (!permissions.includes('cash_boxes.read.assigned') || !permissions.includes('movements.read.assigned')) {
    return { error: 'Todo perfil debe poder consultar sus cajas y movimientos asignados.' };
  }

  return { data: { nombre, descripcion, activa, permissions } };
}

async function getRoles(db = pool) {
  const result = await db.query(
    `
      SELECT
        r.id,
        r.clave,
        r.nombre,
        r.descripcion,
        r.nivel,
        r.es_sistema,
        r.activo,
        r.created_at,
        COUNT(DISTINCT ur.user_id)::integer AS usuarios_count,
        COALESCE(
          array_agg(DISTINCT p.codigo) FILTER (WHERE p.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS permissions
      FROM roles r
      LEFT JOIN user_roles ur ON ur.role_id = r.id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id
      ORDER BY r.nivel DESC, r.nombre ASC
    `,
  );

  return result.rows;
}

async function listRoles(req, res) {
  try {
    return res.json(await getRoles());
  } catch (error) {
    console.error('Error al obtener roles:', error);
    return res.status(500).json({ message: 'No fue posible obtener los perfiles.' });
  }
}

async function getRoleConfiguration(req, res) {
  try {
    const result = await pool.query(
      `
        SELECT codigo, nombre, descripcion, categoria
        FROM permissions
        WHERE codigo = ANY($1::text[])
        ORDER BY categoria, nombre
      `,
      [CUSTOM_ROLE_PERMISSIONS],
    );

    return res.json({ permissions: result.rows });
  } catch (error) {
    console.error('Error al obtener configuración de roles:', error);
    return res.status(500).json({ message: 'No fue posible obtener los permisos disponibles.' });
  }
}

async function getPermissionIds(codes, db = pool) {
  const result = await db.query(
    'SELECT id, codigo FROM permissions WHERE codigo = ANY($1::text[])',
    [codes],
  );

  if (result.rowCount !== codes.length) return null;
  return result.rows;
}

async function createRole(req, res) {
  const validation = validateRolePayload(req.body);
  if (validation.error) return res.status(400).json({ message: validation.error });

  const { nombre, descripcion, activa, permissions } = validation.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const permissionRows = await getPermissionIds(permissions, client);

    if (!permissionRows) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Uno de los permisos seleccionados ya no está disponible.' });
    }

    const slug = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 14) || 'perfil';
    const clave = `custom_${slug}_${Date.now().toString(36)}`;

    const roleResult = await client.query(
      `
        INSERT INTO roles (clave, nombre, descripcion, nivel, es_sistema, activo)
        VALUES ($1, $2, $3, 150, FALSE, $4)
        RETURNING id
      `,
      [clave, nombre, descripcion, activa],
    );

    const roleId = roleResult.rows[0].id;
    for (const permission of permissionRows) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
        [roleId, permission.id],
      );
    }

    // La etiqueta visible por caja se deriva del perfil. Al cambiar un perfil
    // también se actualizan sus asignaciones para evitar mostrar “Edición”
    // cuando ese perfil ya solo permite lectura.
    const accessLevel = permissions.some((permission) => (
      permission === 'movements.create.assigned' || permission === 'movements.edit.assigned'
    )) ? 'editor' : 'reader';
    await client.query(
      `
        UPDATE cash_box_members
        SET access_level = $1
        WHERE user_id IN (SELECT user_id FROM user_roles WHERE role_id = $2)
      `,
      [accessLevel, roleId],
    );

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'role.created',
      entityType: 'role',
      entityId: roleId,
      detail: { nombre, permissions },
    }, client);
    await client.query('COMMIT');

    const roles = await getRoles();
    return res.status(201).json(roles.find((role) => Number(role.id) === Number(roleId)));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error al crear perfil:', error);
    return res.status(500).json({ message: 'No fue posible crear el perfil.' });
  } finally {
    client.release();
  }
}

async function updateRole(req, res) {
  const roleId = getValidId(req.params.id);
  if (!roleId) return res.status(400).json({ message: 'El identificador del perfil no es válido.' });

  const validation = validateRolePayload(req.body);
  if (validation.error) return res.status(400).json({ message: validation.error });

  const { nombre, descripcion, activa, permissions } = validation.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, es_sistema FROM roles WHERE id = $1 FOR UPDATE',
      [roleId],
    );

    if (currentResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No se encontró el perfil.' });
    }

    if (currentResult.rows[0].es_sistema) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Los perfiles base se mantienen protegidos para conservar la jerarquía del sistema.' });
    }

    if (!activa) {
      const activeUsers = await client.query(
        `
          SELECT COUNT(*)::integer AS total
          FROM users u
          INNER JOIN user_roles ur ON ur.user_id = u.id
          WHERE ur.role_id = $1 AND u.estado = 'activo'
        `,
        [roleId],
      );

      if (Number(activeUsers.rows[0].total || 0) > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Reasigna o desactiva a los usuarios de este perfil antes de desactivarlo.' });
      }
    }

    const permissionRows = await getPermissionIds(permissions, client);
    if (!permissionRows) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Uno de los permisos seleccionados ya no está disponible.' });
    }

    await client.query(
      'UPDATE roles SET nombre = $1, descripcion = $2, activo = $3 WHERE id = $4',
      [nombre, descripcion, activa, roleId],
    );
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

    for (const permission of permissionRows) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
        [roleId, permission.id],
      );
    }

    // Una modificación de perfil debe actualizar la etiqueta de acceso de
    // quienes ya lo tenían asignado, además de los futuros usuarios.
    const accessLevel = permissions.some((permission) => (
      permission === 'movements.create.assigned' || permission === 'movements.edit.assigned'
    )) ? 'editor' : 'reader';
    await client.query(
      `
        UPDATE cash_box_members
        SET access_level = $1
        WHERE user_id IN (SELECT user_id FROM user_roles WHERE role_id = $2)
      `,
      [accessLevel, roleId],
    );

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'role.updated',
      entityType: 'role',
      entityId: roleId,
      detail: { nombre, activa, permissions },
    }, client);
    await client.query('COMMIT');

    const roles = await getRoles();
    return res.json(roles.find((role) => Number(role.id) === Number(roleId)));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error al actualizar perfil:', error);
    return res.status(500).json({ message: 'No fue posible actualizar el perfil.' });
  } finally {
    client.release();
  }
}

module.exports = {
  createRole,
  getRoleConfiguration,
  listRoles,
  updateRole,
};
