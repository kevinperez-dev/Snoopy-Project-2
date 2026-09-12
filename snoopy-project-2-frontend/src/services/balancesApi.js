// Propósito: conectar la vista de balanza con la API protegida de conciliaciones.

import { getAuthToken } from '../utils/session.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.', {
      cause: error,
    });
  }

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error('El servidor devolvió una respuesta inválida.', { cause: error });
  }

  if (!response.ok) {
    throw new Error(data.message || 'No se pudo completar la operación de balanza.');
  }

  return data;
}

export async function getBalanceMovements({ cajaId, moneda, fecha }) {
  const params = new URLSearchParams({
    caja_id: String(cajaId),
    moneda,
    fecha,
  });

  return request(`/balanzas/movimientos?${params.toString()}`);
}

export async function createBalance(balance) {
  return request('/balanzas', {
    method: 'POST',
    body: JSON.stringify(balance),
  });
}

export async function getBalances(cashBoxId = '') {
  const query = cashBoxId ? `?caja_id=${encodeURIComponent(cashBoxId)}` : '';
  return request(`/balanzas${query}`);
}
