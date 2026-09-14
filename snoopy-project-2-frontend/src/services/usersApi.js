// Propósito: centralizar las operaciones administrativas de usuarios.

import { getAuthToken } from '../utils/session.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
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
  } catch {
    throw new Error('No se pudo conectar con el servidor. Intenta nuevamente.');
  }

  const data = await readJson(response);
  if (!response.ok) throw new Error(data.message || 'No se pudo completar la operación de usuario.');
  return data;
}

export function getUsers() {
  return request('/users');
}

export function getUsersConfiguration() {
  return request('/users/configuration');
}

export function createUser(user) {
  return request('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
}

export function updateUser(id, user) {
  return request(`/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
}

export function resetUserPassword(id, password) {
  return request(`/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}
