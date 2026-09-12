// Archivo: src/utils/session.js
// Propósito: manejar la sesión del usuario en un solo lugar usando localStorage.
// Nota: se usa localStorage para mantener la sesión abierta aunque pase tiempo o se recargue la página.

export const STORAGE_KEYS = {
  auth: 'snoopyProject2Auth',
  user: 'snoopyProject2User',
  token: 'snoopyProject2Token',
  role: 'snoopyProject2Role',
  lastActivity: 'snoopyProject2LastActivity',
};

// Propósito: conservar compatibilidad con archivos que todavía importan esta constante.
// Ya no se usa para cerrar sesión automáticamente.
export const SESSION_TIMEOUT_MS = null;

// Propósito: revisar si existe una sesión mínima válida guardada en el navegador.
function hasSessionData() {
  return (
    localStorage.getItem(STORAGE_KEYS.auth) === '1' &&
    Boolean(localStorage.getItem(STORAGE_KEYS.token))
  );
}

// Propósito: conservar compatibilidad con versiones anteriores; ya no cierra sesión por inactividad.
export function markSessionActivity() {
  if (!hasSessionData()) return;

  localStorage.setItem(STORAGE_KEYS.lastActivity, String(Date.now()));
}

// Propósito: conservar compatibilidad con validaciones anteriores; ahora la sesión no expira por tiempo.
export function isSessionExpired() {
  return false;
}

// Propósito: validar sesión antes de permitir entrar a vistas protegidas.
export function isAuthenticated() {
  return hasSessionData();
}

// Propósito: guardar la sesión después de un login correcto.
export function setLoginSession(user, token = '', role = '') {
  // Limpia posibles datos viejos en sessionStorage de versiones anteriores.
  Object.values(STORAGE_KEYS).forEach((key) => {
    sessionStorage.removeItem(key);
  });

  localStorage.setItem(STORAGE_KEYS.auth, '1');
  localStorage.setItem(STORAGE_KEYS.user, user || '');
  localStorage.setItem(STORAGE_KEYS.token, token || '');
  localStorage.setItem(STORAGE_KEYS.role, role || '');
  markSessionActivity();
}

// Propósito: obtener el token actual para peticiones protegidas al backend.
export function getAuthToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || '';
}

// Propósito: obtener el usuario actual para mostrarlo en el header.
export function getCurrentUser() {
  return localStorage.getItem(STORAGE_KEYS.user) || '';
}

// Propósito: cerrar sesión manualmente y borrar datos actuales y anteriores.
export function logoutSession() {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}
