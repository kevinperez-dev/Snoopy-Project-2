// Controladores del catalogo configurable de cajas.

const pool = require('../config/db');

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
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
    const result = await pool.query(`
      SELECT
        cb.id,
        cb.nombre,
        cb.descripcion,
        cb.principal,
        cb.activa,
        cb.created_at,
        COUNT(m.id)::integer AS movimientos_count
      FROM cash_boxes cb
      LEFT JOIN movements m ON m.caja_id = cb.id
      GROUP BY cb.id
      ORDER BY cb.activa DESC, cb.id ASC
    `);

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

  try {
    const result = await pool.query(
      `
      INSERT INTO cash_boxes (nombre, descripcion)
      VALUES ($1, $2)
      RETURNING id, nombre, descripcion, principal, activa, created_at, 0::integer AS movimientos_count
      `,
      [nombre, descripcion],
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una caja con ese nombre.' });
    }

    console.error('Error al crear caja:', error);
    return res.status(500).json({ message: 'Error al crear la caja.' });
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
      RETURNING id, nombre, descripcion, principal, activa, created_at,
        (SELECT COUNT(*)::integer FROM movements WHERE caja_id = cash_boxes.id) AS movimientos_count
      `,
      [nombre, descripcion, activa, id],
    );

    return res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una caja con ese nombre.' });
    }

    console.error('Error al actualizar caja:', error);
    return res.status(500).json({ message: 'Error al actualizar la caja.' });
  }
}

module.exports = {
  requireAdmin,
  getCashBoxes,
  createCashBox,
  updateCashBox,
};
