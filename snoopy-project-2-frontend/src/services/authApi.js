// Archivo: src/services/authApi.js
// Propósito: centralizar las peticiones de autenticación del sistema.

import { getAuthToken } from '../utils/session.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Propósito: convertir errores técnicos en mensajes claros para el usuario.
function getFriendlyAuthMessage(message = '') {
  const normalizedMessage = String(message).toLowerCase();

  if (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('network') ||
    normalizedMessage.includes('conectar')
  ) {
    return 'No se pudo conectar. Revisa tu conexión e intenta nuevamente.';
  }

  if (
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('tardó demasiado') ||
    normalizedMessage.includes('abort')
  ) {
    return 'La respuesta tardó demasiado. Intenta nuevamente en unos segundos.';
  }

  if (
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('invalid') ||
    normalizedMessage.includes('incorrect') ||
    normalizedMessage.includes('credencial')
  ) {
    return 'Usuario o contraseña incorrectos.';
  }

  return message || 'No se pudo completar la acción. Intenta nuevamente.';
}

// Propósito: hacer peticiones con tiempo límite para evitar esperas largas.
async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();

  // Propósito: cancelar la petición si tarda demasiado.
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    return response;
  } catch (error) {
    throw new Error(getFriendlyAuthMessage(error.message), {
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Propósito: leer la respuesta JSON sin romper la pantalla si viene vacía.
async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

// Propósito: iniciar sesión con usuario y contraseña.
export async function loginUser(username, password) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getFriendlyAuthMessage(data.message || 'Usuario o contraseña incorrectos.'));
  }

  return data;
}

// Propósito: consultar la sesión actual.
export async function getCurrentSession() {
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getFriendlyAuthMessage(data.message || 'Tu sesión terminó. Vuelve a iniciar sesión.'));
  }

  return data;
}
