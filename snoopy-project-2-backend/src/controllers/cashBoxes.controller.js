// Controladores del catalogo configurable de cajas.

const pool = require('../config/db');
const {
  getCashBoxScope,
  hasPermission,
  writeAuditLog,
} = require('../services/accessControl');

function numberToCashBoxKey(value) {
  let remaining = value;
  let key = '';

  while (remaining > 0) {
    remaining -= 1;
    key = String.fromCharCode(65 + (remaining % 26)) + key;
    remaining = Math.floor(remaining / 26);
  }

  return key;
}

function cashBoxKeyToNumber(value) {
  const normalized = String(value || '').trim().toUpperCase();

  if (!/^[A-Z]+$/.test(normalized)) return 0;

  return [...normalized].reduce((total, character) => (
    (total * 26) + character.charCodeAt(0) - 64
  ), 0);
}

async function getNextCashBoxKey(client) {
  const result = await client.query('SELECT clave FROM cash_boxes FOR UPDATE');
  const highestKey = result.rows.reduce(
    (highest, row) => Math.max(highest, cashBoxKeyToNumber(row.clave)),
    1,
  );

  return numberToCashBoxKey(highestKey + 1);
}

function requireAdmin(req, res, next) {
  if (!hasPermission(req.user, 'cash_boxes.manage.all')) {
    return res.status(403).json({
      message: 'Solo un administrador puede administrar las cajas.',
    });
  }

  return next();
}

function getValidId(req, res) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: 'El identificador de la caja no es válido.' });
    return null;
  }

  return id;
}

async function getCashBoxes(req, res) {
  try {
    const scope = await getCashBoxScope(req.user, 'cash_boxes', 'read');

    if (!scope.all && scope.cashBoxIds.length === 0) {
      return res.json([]);
    }

    const scopeJoin = scope.all
      ? ''
      : 'INNER JOIN cash_box_members cbm_scope ON cbm_scope.cash_box_id = cb.id AND cbm_scope.user_id = $1';
    const accessLevelColumn = scope.all
      ? "'owner'::varchar AS access_level"
      : 'MAX(cbm_scope.access_level) AS access_level';
    const params = scope.all ? [] : [req.user.id];

    const result = await pool.query(`
      SELECT
        cb.id,
        cb.nombre,
        cb.descripcion,
        cb.clave,
        cb.principal,
        cb.activa,
        cb.owner_user_id,
        cb.created_at,
        COUNT(m.id)::integer AS movimientos_count,
        (SELECT COUNT(*)::integer FROM balance_sessions bs WHERE bs.caja_id = cb.id) AS balance_sessions_count,
        (
          cb.principal = FALSE
          AND cb.activa = FALSE
          AND NOT EXISTS (SELECT 1 FROM movements movement_record WHERE movement_record.caja_id = cb.id)
          AND NOT EXISTS (SELECT 1 FROM balance_sessions balance_record WHERE balance_record.caja_id = cb.id)
        ) AS can_delete,
        ${accessLevelColumn}
      FROM cash_boxes cb
      ${scopeJoin}
      LEFT JOIN movements m ON m.caja_id = cb.id
      GROUP BY cb.id
      ORDER BY cb.activa DESC, cb.id ASC
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener cajas:', error);
    res.status(500).json({ message: 'Error al obtener las cajas.' });
  }
}

async function createCashBox(req, res) {
  const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
  const nombre = String(requestBody.nombre || '').trim();
  const descripcion = String(requestBody.descripcion || '').trim() || null;

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre de la caja es obligatorio.' });
  }

  if (nombre.length > 80) {
    return res.status(400).json({ message: 'El nombre de la caja no puede superar 80 caracteres.' });
  }

  if (descripcion && descripcion.length > 255) {
    return res.status(400).json({ message: 'La descripción no puede superar 255 caracteres.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cash-box-key-generation'))");

    const clave = await getNextCashBoxKey(client);
    const result = await client.query(
      `
      INSERT INTO cash_boxes (nombre, descripcion, clave, created_by, owner_user_id)
      VALUES ($1, $2, $3, $4, $4)
      RETURNING id, nombre, descripcion, clave, principal, activa, owner_user_id, created_at,
        0::integer AS movimientos_count,
        0::integer AS balance_sessions_count,
        FALSE AS can_delete
      `,
      [nombre, descripcion, clave, req.user.id],
    );

    const cashBox = result.rows[0];

    await client.query(
      `
        INSERT INTO cash_box_members (cash_box_id, user_id, access_level, assigned_by)
        VALUES ($1, $2, 'owner', $2)
      `,
      [cashBox.id, req.user.id],
    );

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'cash_box.created',
      entityType: 'cash_box',
      entityId: cashBox.id,
      detail: { nombre: cashBox.nombre, clave: cashBox.clave },
    }, client);

    await client.query('COMMIT');

    return res.status(201).json({ ...cashBox, access_level: 'owner' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una caja con ese nombre.' });
    }

    console.error('Error al crear caja:', error);
    return res.status(500).json({ message: 'Error al crear la caja.' });
  } finally {
    client.release();
  }
}

async function updateCashBox(req, res) {
  const id = getValidId(req, res);
  if (!id) return undefined;

  const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
  const nombre = String(requestBody.nombre || '').trim();
  const descripcion = String(requestBody.descripcion || '').trim() || null;
  const activa = requestBody.activa === undefined ? true : requestBody.activa === true;

  if (!nombre) {
    return res.status(400).json({ message: 'El nombre de la caja es obligatorio.' });
  }

  if (nombre.length > 80) {
    return res.status(400).json({ message: 'El nombre de la caja no puede superar 80 caracteres.' });
  }

  if (descripcion && descripcion.length > 255) {
    return res.status(400).json({ message: 'La descripción no puede superar 255 caracteres.' });
  }

  try {
    const currentResult = await pool.query(
      'SELECT id, principal FROM cash_boxes WHERE id = $1',
      [id],
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ message: 'No se encontró la caja.' });
    }

    if (!activa && currentResult.rows[0].principal) {
      return res.status(400).json({ message: 'La caja principal debe permanecer activa.' });
    }

    if (!activa) {
      const activeCount = await pool.query('SELECT COUNT(*)::integer AS total FROM cash_boxes WHERE activa = TRUE');

      if (Number(activeCount.rows[0].total) <= 1) {
        return res.status(400).json({ message: 'Debe existir al menos una caja activa.' });
      }
    }

    const result = await pool.query(
      `
      UPDATE cash_boxes
      SET nombre = $1, descripcion = $2, activa = $3
      WHERE id = $4
      RETURNING id, nombre, descripcion, clave, principal, activa, created_at,
        (SELECT COUNT(*)::integer FROM movements WHERE caja_id = cash_boxes.id) AS movimientos_count,
        (SELECT COUNT(*)::integer FROM balance_sessions WHERE caja_id = cash_boxes.id) AS balance_sessions_count,
        (
          cash_boxes.principal = FALSE
          AND cash_boxes.activa = FALSE
          AND NOT EXISTS (SELECT 1 FROM movements WHERE caja_id = cash_boxes.id)
          AND NOT EXISTS (SELECT 1 FROM balance_sessions WHERE caja_id = cash_boxes.id)
        ) AS can_delete
      `,
      [nombre, descripcion, activa, id],
    );

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'cash_box.updated',
      entityType: 'cash_box',
      entityId: id,
      detail: { nombre, activa },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una caja con ese nombre.' });
    }

    console.error('Error al actualizar caja:', error);
    return res.status(500).json({ message: 'Error al actualizar la caja.' });
  }
}

async function deleteCashBox(req, res) {
  const id = getValidId(req, res);
  if (!id) return undefined;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      'SELECT id, nombre, principal, activa FROM cash_boxes WHERE id = $1 FOR UPDATE',
      [id],
    );

    if (currentResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No se encontró la caja.' });
    }

    const cashBox = currentResult.rows[0];

    if (cashBox.principal) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La caja principal no se puede eliminar.' });
    }

    if (cashBox.activa) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Desactiva la caja antes de eliminarla.' });
    }

    const relatedRecords = await client.query(
      `
        SELECT
          (SELECT COUNT(*)::integer FROM movements WHERE caja_id = $1) AS movimientos_count,
          (SELECT COUNT(*)::integer FROM balance_sessions WHERE caja_id = $1) AS balance_sessions_count
      `,
      [id],
    );
    const records = relatedRecords.rows[0];

    if (Number(records.movimientos_count) > 0 || Number(records.balance_sessions_count) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'No se puede eliminar una caja con movimientos o historial de balanza.',
      });
    }

    await client.query('DELETE FROM cash_boxes WHERE id = $1', [id]);

    await writeAuditLog({
      actorUserId: req.user.id,
      action: 'cash_box.deleted',
      entityType: 'cash_box',
      entityId: id,
      detail: { nombre: cashBox.nombre },
    }, client);

    await client.query('COMMIT');
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (error.code === '23503') {
      return res.status(409).json({
        message: 'No se puede eliminar una caja con registros relacionados.',
      });
    }

    console.error('Error al eliminar caja:', error);
    return res.status(500).json({ message: 'Error al eliminar la caja.' });
  } finally {
    client.release();
  }
}

module.exports = {
  requireAdmin,
  getCashBoxes,
  createCashBox,
  updateCashBox,
  deleteCashBox,
};
