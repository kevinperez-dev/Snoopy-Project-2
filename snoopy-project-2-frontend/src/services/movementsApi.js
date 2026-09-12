// Archivo: src/services/movementsApi.js
// Propósito: conectar React con la API protegida de movimientos y normalizar historial de ajustes.

import { getAuthToken } from '../utils/session.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Propósito: convertir errores técnicos en mensajes claros para el usuario.
function getFriendlyMovementMessage(message = '') {
  const normalizedMessage = String(message).toLowerCase();

  if (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('network') ||
    normalizedMessage.includes('conectar')
  ) {
    return 'No se pudo conectar. Revisa tu conexión e intenta nuevamente.';
  }

  if (
    normalizedMessage.includes('syntax') ||
    normalizedMessage.includes('constraint') ||
    normalizedMessage.includes('postgres') ||
    normalizedMessage.includes('column') ||
    normalizedMessage.includes('invalid input') ||
    normalizedMessage.includes('duplicate') ||
    normalizedMessage.includes('violates') ||
    normalizedMessage.includes('tabla')
  ) {
    return 'No se pudo guardar la información. Revisa los datos e intenta nuevamente.';
  }

  if (normalizedMessage.includes('unauthorized') || normalizedMessage.includes('jwt')) {
    return 'Tu sesión terminó. Vuelve a iniciar sesión.';
  }

  return message || 'No se pudo completar la acción. Intenta nuevamente.';
}



// Propósito: convertir fechas del backend a formato YYYY-MM-DD para usarlas en formularios y tablas.
function normalizeDate(value) {
  if (!value) return null;
  return String(value).split('T')[0];
}

// Propósito: convertir números del backend sin romper cuando un valor es null.
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
}

// Propósito: normalizar datos recibidos  para usarlos en React.
function normalizeMovement(item) {
  return {
    ...item,
    fecha: normalizeDate(item.fecha),
    cantidad: Number(item.cantidad),
    created_at: item.created_at || null,
    fecha_anterior: normalizeDate(item.fecha_anterior),
    fecha_nueva: normalizeDate(item.fecha_nueva),
    cantidad_anterior: normalizeNumber(item.cantidad_anterior),
    cantidad_nueva: normalizeNumber(item.cantidad_nueva),
    fecha_ultima_edicion: normalizeDate(item.fecha_ultima_edicion),
  };
}

// Propósito: normalizar una fila del historial completo de ajustes.
function normalizeMovementEdit(item) {
  return {
    ...item,
    fecha: normalizeDate(item.fecha),
    fecha_anterior: normalizeDate(item.fecha_anterior),
    fecha_nueva: normalizeDate(item.fecha_nueva),
    cantidad_actual: normalizeNumber(item.cantidad_actual),
    cantidad_anterior: normalizeNumber(item.cantidad_anterior),
    cantidad_nueva: normalizeNumber(item.cantidad_nueva),
    edited_at: item.edited_at || null,
    fecha_edicion: normalizeDate(item.edited_at),
  };
}

// Propósito: hacer peticiones y mostrar mensajes entendibles cuando algo falla.
async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(getFriendlyMovementMessage(error.message), {
      cause: error,
    });
  }
}

// Propósito: leer el JSON de una respuesta y manejar respuestas vacías sin romper la app.
async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// Propósito: obtener movimientos .
export async function getMovements() {
  const response = await safeFetch(`${API_BASE_URL}/movements`, {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getFriendlyMovementMessage(data.message || 'No se pudieron cargar los movimientos.'));
  }

  return data.map(normalizeMovement);
}


// Propósito: obtener el historial completo de ajustes; puede filtrarse por tipo de movimiento.
export async function getMovementEditHistory(tipo = '') {
  const query = tipo ? `?tipo=${encodeURIComponent(tipo)}` : '';

  const response = await safeFetch(`${API_BASE_URL}/movements/edits/history${query}`, {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getFriendlyMovementMessage(data.message || 'No se pudo cargar el historial.'));
  }

  return data.map(normalizeMovementEdit);
}

// Propósito: crear movimiento .
export async function createMovement(movement) {
  const response = await safeFetch(`${API_BASE_URL}/movements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(movement),
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getFriendlyMovementMessage(data.message || 'No se pudo guardar el movimiento.'));
  }

  return normalizeMovement(data);
}

// Propósito: actualizar movimiento existente  y recibir su último ajuste.
export async function updateMovement(id, movement) {
  const response = await safeFetch(`${API_BASE_URL}/movements/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(movement),
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getFriendlyMovementMessage(data.message || 'No se pudo guardar el cambio.'));
  }

  return normalizeMovement(data);
}

// Propósito: cancelar movimiento existente  sin eliminarlo físicamente.
export async function deleteMovement(id) {
  const response = await safeFetch(`${API_BASE_URL}/movements/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getFriendlyMovementMessage(data.message || 'No se pudo cancelar el movimiento.'));
  }

  return normalizeMovement(data.movement || data);
}
