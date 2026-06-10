// Archivo: src/controllers/movements.controller.js
// Propósito: controlar movimientos protegidos, cancelación lógica e historial de ediciones.

const pool = require('../config/db');

// Tipos válidos que acepta la tabla movements.
const VALID_TYPES = ['ingreso', 'egreso', 'cancelado'];

// Monedas válidas que acepta la tabla movements.
const VALID_CURRENCIES = ['Pesos', 'Dólares', 'Dolares'];

// Propósito: normalizar monedas para evitar problemas por acentos o variantes como USD.
function normalizeCurrency(currency) {
  const value = String(currency || '').trim();
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (normalized.includes('dolar') || normalized === 'usd') {
    return 'Dolares';
  }

  if (normalized.includes('peso') || normalized === 'mxn') {
    return 'Pesos';
  }

  return value;
}

// Propósito: comparar monedas sin depender de acentos.
function normalizeCurrencyForCompare(currency) {
  return String(currency || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Propósito: normalizar texto para comparar campos editables sin errores por null.
function normalizeTextForCompare(value) {
  return String(value || '').trim();
}

// Propósito: convertir cualquier fecha recibida a formato YYYY-MM-DD para PostgreSQL.
function normalizeDateForDatabase(value) {
  if (!value) return '';

  // Propósito: si PostgreSQL regresa un objeto Date, conservar solo año-mes-día en UTC.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const textValue = String(value).trim();

  // Propósito: si ya viene como YYYY-MM-DD o ISO, tomar solo la parte de la fecha.
  const isoMatch = textValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return isoMatch[0];
  }

  // Propósito: intentar convertir fechas tipo "Sun May 10 2026..." sin enviarlas así a PostgreSQL.
  const parsedDate = new Date(textValue);

  if (!Number.isNaN(parsedDate.getTime())) {
    const year = parsedDate.getUTCFullYear();
    const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return '';
}

// Propósito: normalizar fechas para comparar valores recibidos desde PostgreSQL o formulario.
function normalizeDateForCompare(value) {
  return normalizeDateForDatabase(value);
}

// Propósito: detectar si un campo de texto o fecha cambió durante una edición.
function fieldWasChanged(previousValue, newValue) {
  return normalizeTextForCompare(previousValue) !== normalizeTextForCompare(newValue);
}

// Propósito: validar los datos de un movimiento antes de guardar o actualizar.
function validateMovementPayload(payload) {
  const tipo = String(payload.tipo || '').trim();
  const fecha = normalizeDateForDatabase(payload.fecha);
  const folio = String(payload.folio || '').trim();
  const nombre = String(payload.nombre || '').trim();
  const descripcion = String(payload.descripcion || '').trim();
  const cantidad = Number(payload.cantidad);
  const moneda = normalizeCurrency(payload.moneda);

  if (!tipo || !fecha || !folio || !nombre || !descripcion || !payload.cantidad || !moneda) {
    return {
      hasError: true,
      message: 'Todos los campos son obligatorios.',
    };
  }

  if (!VALID_TYPES.includes(tipo)) {
    return {
      hasError: true,
      message: 'El tipo de movimiento no es válido.',
    };
  }

  if (!VALID_CURRENCIES.includes(moneda)) {
    return {
      hasError: true,
      message: 'La moneda seleccionada no es válida.',
    };
  }

  if (Number.isNaN(cantidad) || cantidad <= 0) {
    return {
      hasError: true,
      message: 'La cantidad debe ser mayor a 0.',
    };
  }

  return {
    hasError: false,
    data: {
      tipo,
      fecha,
      folio,
      nombre,
      descripcion,
      cantidad,
      moneda,
    },
  };
}

// Propósito: validar que el parámetro id sea numérico antes de consultar PostgreSQL.
function getValidMovementId(req, res) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({
      message: 'El identificador del movimiento no es válido.',
    });
    return null;
  }

  return id;
}

// Propósito: consulta base de movimientos incluyendo el último ajuste registrado.
function getMovementsWithLatestEditQuery(whereClause = '') {
  return `
    SELECT
      m.id,
      m.tipo,
      m.fecha,
      m.folio,
      m.nombre,
      m.descripcion,
      m.cantidad,
      m.moneda,
      m.created_by,
      u.username AS created_by_username,
      m.created_at,
      latest_edit.id AS ultimo_ajuste_id,
      latest_edit.tipo_anterior,
      latest_edit.tipo_nuevo,
      latest_edit.fecha_anterior,
      latest_edit.fecha_nueva,
      latest_edit.folio_anterior,
      latest_edit.folio_nuevo,
      latest_edit.nombre_anterior,
      latest_edit.nombre_nuevo,
      latest_edit.descripcion_anterior,
      latest_edit.descripcion_nueva,
      latest_edit.cantidad_anterior,
      latest_edit.moneda_anterior,
      latest_edit.cantidad_nueva,
      latest_edit.moneda_nueva,
      latest_edit.edited_at AS fecha_ultima_edicion,
      latest_edit.comentario AS comentario_ultima_edicion,
      editor.username AS edited_by_username
    FROM movements m
    LEFT JOIN users u ON u.id = m.created_by
    LEFT JOIN LATERAL (
      SELECT
        me.id,
        me.tipo_anterior,
        me.tipo_nuevo,
        me.fecha_anterior,
        me.fecha_nueva,
        me.folio_anterior,
        me.folio_nuevo,
        me.nombre_anterior,
        me.nombre_nuevo,
        me.descripcion_anterior,
        me.descripcion_nueva,
        me.cantidad_anterior,
        me.moneda_anterior,
        me.cantidad_nueva,
        me.moneda_nueva,
        me.edited_by,
        me.edited_at,
        me.comentario
      FROM movement_edits me
      WHERE me.movement_id = m.id
      ORDER BY me.edited_at DESC, me.id DESC
      LIMIT 1
    ) latest_edit ON true
    LEFT JOIN users editor ON editor.id = latest_edit.edited_by
    ${whereClause}
  `;
}

// Propósito: obtener un movimiento por ID con su último ajuste.
async function getMovementWithLatestEditById(id) {
  const result = await pool.query(
    `
    ${getMovementsWithLatestEditQuery('WHERE m.id = $1')}
    LIMIT 1
    `,
    [id],
  );

  return result.rows[0] || null;
}

// Propósito: obtener todos los movimientos.
async function getMovements(req, res) {
  try {
    const result = await pool.query(`
      ${getMovementsWithLatestEditQuery()}
      ORDER BY m.fecha DESC, m.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener movimientos:', error);
    res.status(500).json({
      message: 'Error al obtener movimientos.',
    });
  }
}


// Propósito: obtener el historial completo de ajustes de montos, con filtro opcional por tipo.
async function getMovementEditHistory(req, res) {
  try {
    const tipo = String(req.query.tipo || '').trim();
    const params = [];
    let whereClause = '';

    if (tipo) {
      if (!VALID_TYPES.includes(tipo)) {
        return res.status(400).json({
          message: 'El tipo de reporte para el historial no es válido.',
        });
      }

      params.push(tipo);
      whereClause = 'WHERE m.tipo = $1';
    }

    const result = await pool.query(
      `
      SELECT
        me.id AS edit_id,
        me.movement_id,
        m.tipo,
        m.fecha,
        m.folio,
        m.nombre,
        m.descripcion,
        m.cantidad AS cantidad_actual,
        m.moneda AS moneda_actual,
        me.tipo_anterior,
        me.tipo_nuevo,
        me.fecha_anterior,
        me.fecha_nueva,
        me.folio_anterior,
        me.folio_nuevo,
        me.nombre_anterior,
        me.nombre_nuevo,
        me.descripcion_anterior,
        me.descripcion_nueva,
        me.cantidad_anterior,
        me.moneda_anterior,
        me.cantidad_nueva,
        me.moneda_nueva,
        me.edited_at,
        me.comentario,
        editor.username AS edited_by_username
      FROM movement_edits me
      INNER JOIN movements m ON m.id = me.movement_id
      LEFT JOIN users editor ON editor.id = me.edited_by
      ${whereClause}
      ORDER BY me.edited_at DESC, me.id DESC
      `,
      params,
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener historial de ajustes:', error);

    if (error.code === '42P01' || error.code === '42703') {
      return res.status(400).json({
        message: 'Falta actualizar la tabla movement_edits. Ejecuta el script SQL incluido.',
      });
    }

    res.status(500).json({
      message: 'Error al obtener historial de ajustes.',
    });
  }

  return undefined;
}

// Propósito: crear un nuevo movimiento.
async function createMovement(req, res) {
  try {
    const validation = validateMovementPayload(req.body);

    if (validation.hasError) {
      return res.status(400).json({
        message: validation.message,
      });
    }

    const { tipo, fecha, folio, nombre, descripcion, cantidad, moneda } = validation.data;

    const result = await pool.query(
      `
      INSERT INTO movements (
        tipo,
        fecha,
        folio,
        nombre,
        descripcion,
        cantidad,
        moneda,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [tipo, fecha, folio, nombre, descripcion, cantidad, moneda, req.user.id],
    );

    const movement = await getMovementWithLatestEditById(result.rows[0].id);

    res.status(201).json(movement);
  } catch (error) {
    console.error('Error al crear movimiento:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'El folio ya existe.',
      });
    }

    if (error.code === '23514') {
      return res.status(400).json({
        message: 'Los datos del movimiento no cumplen con las reglas permitidas.',
      });
    }

    res.status(500).json({
      message: 'Error al crear movimiento.',
    });
  }
}

// Propósito: actualizar un movimiento y guardar historial cuando cambia cualquier campo relevante.
async function updateMovement(req, res) {
  const client = await pool.connect();

  try {
    const id = getValidMovementId(req, res);
    if (!id) return undefined;

    const validation = validateMovementPayload(req.body);

    if (validation.hasError) {
      return res.status(400).json({
        message: validation.message,
      });
    }

    const { tipo, fecha, folio, nombre, descripcion, cantidad, moneda } = validation.data;
    const comentario = String(req.body.comentario || '').trim();

    await client.query('BEGIN');

    // Propósito: bloquear el registro mientras se actualiza para guardar los valores anteriores correctos.
    const currentResult = await client.query(
      `
      SELECT id, tipo, fecha, folio, nombre, descripcion, cantidad, moneda
      FROM movements
      WHERE id = $1
      FOR UPDATE
      `,
      [id],
    );

    if (currentResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'No se encontró el movimiento que deseas modificar.',
      });
    }

    const currentMovement = currentResult.rows[0];

    if (currentMovement.tipo === 'cancelado') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'No se puede modificar un movimiento cancelado.',
      });
    }

    const previousAmount = Number(currentMovement.cantidad);
    const newAmount = Number(cantidad);
    const previousCurrency = normalizeCurrency(currentMovement.moneda);
    const newCurrency = normalizeCurrency(moneda);
    const previousDate = normalizeDateForCompare(currentMovement.fecha);
    const newDate = normalizeDateForCompare(fecha);

    const typeWasAdjusted = fieldWasChanged(currentMovement.tipo, tipo);
    const dateWasAdjusted = fieldWasChanged(previousDate, newDate);
    const folioWasAdjusted = fieldWasChanged(currentMovement.folio, folio);
    const nameWasAdjusted = fieldWasChanged(currentMovement.nombre, nombre);
    const descriptionWasAdjusted = fieldWasChanged(currentMovement.descripcion, descripcion);
    const amountWasAdjusted = previousAmount !== newAmount;
    const currencyWasAdjusted =
      normalizeCurrencyForCompare(previousCurrency) !== normalizeCurrencyForCompare(newCurrency);

    const movementWasAdjusted =
      typeWasAdjusted ||
      dateWasAdjusted ||
      folioWasAdjusted ||
      nameWasAdjusted ||
      descriptionWasAdjusted ||
      amountWasAdjusted ||
      currencyWasAdjusted;

    if (movementWasAdjusted && !comentario) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Agrega un comentario para explicar la edición.',
      });
    }

    // Propósito: guardar UNA sola fila de historial por cada clic en Guardar.
    // El comentario no se genera automáticamente; lo captura el usuario en el modal.
    if (movementWasAdjusted) {
      await client.query(
        `
        INSERT INTO movement_edits (
          movement_id,
          tipo_anterior,
          tipo_nuevo,
          fecha_anterior,
          fecha_nueva,
          folio_anterior,
          folio_nuevo,
          nombre_anterior,
          nombre_nuevo,
          descripcion_anterior,
          descripcion_nueva,
          cantidad_anterior,
          moneda_anterior,
          cantidad_nueva,
          moneda_nueva,
          edited_by,
          comentario
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `,
        [
          id,
          currentMovement.tipo,
          tipo,
          previousDate,
          newDate,
          currentMovement.folio,
          folio,
          currentMovement.nombre,
          nombre,
          currentMovement.descripcion,
          descripcion,
          previousAmount,
          previousCurrency,
          newAmount,
          newCurrency,
          req.user.id,
          comentario,
        ],
      );
    }

    await client.query(
      `
      UPDATE movements
      SET
        tipo = $1,
        fecha = $2,
        folio = $3,
        nombre = $4,
        descripcion = $5,
        cantidad = $6,
        moneda = $7
      WHERE id = $8
      `,
      [tipo, fecha, folio, nombre, descripcion, cantidad, newCurrency, id],
    );

    await client.query('COMMIT');

    const updatedMovement = await getMovementWithLatestEditById(id);
    res.json(updatedMovement);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar movimiento:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'El folio ya existe en otro movimiento.',
      });
    }

    if (error.code === '23514') {
      return res.status(400).json({
        message: 'Los datos del movimiento no cumplen con las reglas permitidas.',
      });
    }

    if (error.code === '42P01' || error.code === '42703') {
      return res.status(400).json({
        message: 'Falta actualizar la tabla movement_edits. Ejecuta el script SQL incluido.',
      });
    }

    res.status(500).json({
      message: 'Error al actualizar movimiento.',
    });
  } finally {
    client.release();
  }

  return undefined;
}

// Propósito: cancelar un movimiento existente sin eliminarlo de PostgreSQL.
async function deleteMovement(req, res) {
  try {
    const id = getValidMovementId(req, res);
    if (!id) return undefined;

    const result = await pool.query(
      `
      UPDATE movements
      SET tipo = 'cancelado'
      WHERE id = $1
      RETURNING id
      `,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'No se encontró el movimiento que deseas cancelar.',
      });
    }

    const movement = await getMovementWithLatestEditById(id);

    res.json({
      message: 'Movimiento cancelado correctamente.',
      movement,
    });
  } catch (error) {
    console.error('Error al cancelar movimiento:', error);

    if (error.code === '23514') {
      return res.status(400).json({
        message: 'La base de datos todavía no permite tipo cancelado. Ejecuta el script SQL incluido.',
      });
    }

    res.status(500).json({
      message: 'Error al cancelar movimiento.',
    });
  }

  return undefined;
}

module.exports = {
  getMovements,
  getMovementEditHistory,
  createMovement,
  updateMovement,
  deleteMovement,
};
