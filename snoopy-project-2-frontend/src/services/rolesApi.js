// Propósito: administrar roles personalizados desde la configuración.

import { getAuthToken } from '../utils/session.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${getAuthToken()}`, ...(options.headers || {}) },
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Intenta nuevamente.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo completar la operación del rol.');
  return data;
}

export function getRoles() {
  return request('/roles');
}

export function getRolesConfiguration() {
  return request('/roles/configuration');
}

export function createRole(role) {
  return request('/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(role),
  });
}

export function updateRole(id, role) {
  return request(`/roles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(role),
  });
}
