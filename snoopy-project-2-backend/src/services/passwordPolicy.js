// Propósito: aplicar una política de contraseña simple, consistente y usable.

function validatePassword(password) {
  const value = String(password || '');

  if (value.length < 10 || value.length > 128) {
    return 'La contraseña debe tener entre 10 y 128 caracteres.';
  }

  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value) || !/\d/.test(value)) {
    return 'La contraseña debe incluir al menos una letra y un número.';
  }

  return '';
}

module.exports = { validatePassword };
