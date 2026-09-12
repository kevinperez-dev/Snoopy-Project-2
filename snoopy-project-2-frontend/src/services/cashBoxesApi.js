// Propósito: conectar React con el catálogo protegido de cajas.

import { getAuthToken } from '../utils/session.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('El servidor devolvió una respuesta inválida.', { cause: error });
  }
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error('No se pudieron cargar las cajas. Revisa la conexión con el servidor.', { cause: error });
  }

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(data.message || 'No se pudo completar la operación con la caja.');
  }

  return data;
}

export async function getCashBoxes() {
  return request('/cajas');
}

export async function createCashBox(cashBox) {
  return request('/cajas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cashBox),
  });
}

export async function updateCashBox(id, cashBox) {
  return request(`/cajas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cashBox),
  });
}
