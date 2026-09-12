// Archivo: src/controllers/balances.controller.js
// Propósito: registrar conciliaciones físicas por denominación sin modificar movimientos.

const pool = require('../config/db');

const VALID_CURRENCIES = ['Pesos', 'Dolares', 'Dólares'];
const MAX_DENOMINATIONS = 50;
const MAX_QUANTITY = 1000000;

function normalizeCurrency(currency) {
  const normalized = String(currency || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized === 'dolares') return 'Dolares';
  if (normalized === 'pesos') return 'Pesos';
  return '';
}

function getCurrencyValues(currency) {
  return currency === 'Dolares' ? ['Dolares', 'Dólares'] : ['Pesos'];
}

function isValidCalendarDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function getValidId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getBalanceStatus(difference) {
  if (Math.abs(difference) < 0.005) return 'cuadrada';
  return difference < 0 ? 'faltante' : 'sobrante';
}

function getBalanceByIdQuery() {
  return `
    SELECT
      bs.id,
      bs.caja_id,
      c.nombre AS caja_nombre,
      bs.fecha,
      bs.moneda,
      bs.saldo_sistema,
      bs.total_contado,
      bs.diferencia,
      bs.estado,
      bs.created_by,
      u.username AS created_by_username,
      bs.created_at
    FROM balance_sessions bs
    INNER JOIN cash_boxes c ON c.id = bs.caja_id
    LEFT JOIN users u ON u.id = bs.created_by
  `;
}

async function getBalanceDetails(id) {
  const [balanceResult, denominationsResult, checkedMovementsResult] = await Promise.all([
    pool.query(`${getBalanceByIdQuery()} WHERE bs.id = $1`, [id]),
    pool.query(
      `
        SELECT id, denominacion, cantidad, subtotal
        FROM balance_denominations
        WHERE balance_id = $1
        ORDER BY denominacion DESC
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          bcm.movement_id,
          bcm.checked_at,
          m.folio,
          m.fecha,
          m.tipo,
          m.nombre,
          m.cantidad,
          m.moneda
        FROM balance_checked_movements bcm
        INNER JOIN movements m ON m.id = bcm.movement_id
        WHERE bcm.balance_id = $1
        ORDER BY m.fecha DESC, m.id DESC
      `,
      [id],
    ),
  ]);

  if (balanceResult.rowCount === 0) return null;

  return {
    ...balanceResult.rows[0],
    denominations: denominationsResult.rows,
    checked_movements: checkedMovementsResult.rows,
  };
}

async function getBalanceMovements(req, res) {
  try {
    const cajaId = getValidId(req.query.caja_id);
    const moneda = normalizeCurrency(req.query.moneda);
    const fecha = String(req.query.fecha || '').trim();

    if (!cajaId || !moneda || !isValidCalendarDate(fecha)) {
      return res.status(400).json({
        message: 'La caja, moneda y fecha de corte son obligatorias y válidas.',
      });
    }

    const result = await pool.query(
      `
        SELECT id, caja_id, tipo, fecha, folio, nombre, descripcion, cantidad, moneda
        FROM movements
        WHERE caja_id = $1
          AND moneda = ANY($2::text[])
          AND fecha <= $3
          AND tipo IN ('ingreso', 'egreso')
        ORDER BY fecha DESC, id DESC
      `,
      [cajaId, getCurrencyValues(moneda), fecha],
    );

    const totalResult = await pool.query(
      `
        SELECT COALESCE(SUM(
          CASE WHEN tipo = 'ingreso' THEN cantidad ELSE -cantidad END
        ), 0)::numeric AS saldo_sistema
        FROM movements
        WHERE caja_id = $1
          AND moneda = ANY($2::text[])
          AND fecha <= $3
          AND tipo IN ('ingreso', 'egreso')
      `,
      [cajaId, getCurrencyValues(moneda), fecha],
    );

    return res.json({
      saldo_sistema: totalResult.rows[0].saldo_sistema,
      movements: result.rows,
    });
  } catch (error) {
    console.error('Error al obtener movimientos para balanza:', error);
    return res.status(500).json({ message: 'Error al preparar la balanza.' });
  }
}

async function getBalances(req, res) {
  try {
    const hasCashBoxParameter = Object.prototype.hasOwnProperty.call(req.query, 'caja_id');
    const cajaId = getValidId(req.query.caja_id);

    if (hasCashBoxParameter && !cajaId) {
      return res.status(400).json({ message: 'El identificador de la caja no es válido.' });
    }

    const params = cajaId ? [cajaId] : [];
    const whereClause = cajaId ? 'WHERE bs.caja_id = $1' : '';
    const result = await pool.query(
      `
        ${getBalanceByIdQuery()}
        ${whereClause}
        ORDER BY bs.fecha DESC, bs.id DESC
        LIMIT 100
      `,
      params,
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener historial de balanzas:', error);
    return res.status(500).json({ message: 'Error al obtener el historial de balanzas.' });
  }
}

async function getBalance(req, res) {
  const id = getValidId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'El identificador de la balanza no es válido.' });
  }

  try {
    const balance = await getBalanceDetails(id);

    if (!balance) {
      return res.status(404).json({ message: 'No se encontró la balanza.' });
    }

    return res.json(balance);
  } catch (error) {
    console.error('Error al obtener balanza:', error);
    return res.status(500).json({ message: 'Error al obtener la balanza.' });
  }
}

async function createBalance(req, res) {
  const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
  const cajaId = getValidId(requestBody.caja_id);
  const fecha = String(requestBody.fecha || '').trim();
  const moneda = normalizeCurrency(requestBody.moneda);
  const saldoSistema = Number(requestBody.saldo_sistema);
  const denominations = Array.isArray(requestBody.denominaciones)
    ? requestBody.denominaciones
    : [];
  const checkedMovementIds = Array.isArray(requestBody.movimientos_revisados)
    ? [...new Set(requestBody.movimientos_revisados.map((value) => Number(value)))]
    : [];

  if (!cajaId || !isValidCalendarDate(fecha) || !moneda || !Number.isFinite(saldoSistema)) {
    return res.status(400).json({
      message: 'La caja, fecha, moneda y saldo del sistema son obligatorios y válidos.',
    });
  }

  if (denominations.length > MAX_DENOMINATIONS) {
    return res.status(400).json({ message: 'La balanza no puede contener tantas denominaciones.' });
  }

  let totalContado = 0;
  const normalizedDenominations = [];

  for (const denomination of denominations) {
    const value = Number(denomination.denominacion);
    const quantity = Number(denomination.cantidad);

    if (!Number.isFinite(value) || value <= 0 || value > 1000000 ||
        !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
      return res.status(400).json({ message: 'Las denominaciones o cantidades no son válidas.' });
    }

    const subtotal = Math.round(value * quantity * 100) / 100;
    totalContado += subtotal;
    normalizedDenominations.push({ value, quantity, subtotal });
  }

  totalContado = Math.round(totalContado * 100) / 100;
  const diferencia = Math.round((totalContado - saldoSistema) * 100) / 100;
  const estado = getBalanceStatus(diferencia);

  if (checkedMovementIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ message: 'Hay movimientos revisados con identificadores inválidos.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const cashBoxResult = await client.query(
      'SELECT id FROM cash_boxes WHERE id = $1',
      [cajaId],
    );

    if (cashBoxResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La caja seleccionada no existe.' });
    }

    if (checkedMovementIds.length) {
      const movementResult = await client.query(
        `
          SELECT id
          FROM movements
          WHERE id = ANY($1::int[])
            AND caja_id = $2
            AND moneda = ANY($3::text[])
            AND fecha <= $4
            AND tipo IN ('ingreso', 'egreso')
        `,
        [checkedMovementIds, cajaId, getCurrencyValues(moneda), fecha],
      );

      if (movementResult.rowCount !== checkedMovementIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Solo puedes marcar movimientos de la misma caja, moneda y fecha de corte.',
        });
      }
    }

    const balanceResult = await client.query(
      `
        INSERT INTO balance_sessions (
          caja_id, fecha, moneda, saldo_sistema, total_contado, diferencia, estado, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [cajaId, fecha, moneda, saldoSistema, totalContado, diferencia, estado, req.user.id],
    );

    const balanceId = balanceResult.rows[0].id;

    for (const denomination of normalizedDenominations) {
      if (denomination.quantity === 0) continue;

      await client.query(
        `
          INSERT INTO balance_denominations (balance_id, denominacion, cantidad, subtotal)
          VALUES ($1, $2, $3, $4)
        `,
        [balanceId, denomination.value, denomination.quantity, denomination.subtotal],
      );
    }

    for (const movementId of checkedMovementIds) {
      await client.query(
        `
          INSERT INTO balance_checked_movements (balance_id, movement_id)
          VALUES ($1, $2)
        `,
        [balanceId, movementId],
      );
    }

    await client.query('COMMIT');
    const balance = await getBalanceDetails(balanceId);
    return res.status(201).json(balance);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error al crear balanza:', error);
    return res.status(500).json({ message: 'Error al guardar la balanza.' });
  } finally {
    client.release();
  }
}

module.exports = {
  getBalanceMovements,
  getBalances,
  getBalance,
  createBalance,
};
