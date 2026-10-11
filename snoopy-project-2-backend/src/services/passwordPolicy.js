// Propósito: aplicar una política de contraseña simple, consistente y usable.

function validatePassword(password) {
  const value = String(password || '');

  if (value.length < 6 || value.length > 128) {
    return 'La contraseña debe tener entre 6 y 128 caracteres.';
  }

  const hasLetter = /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSpecialCharacter = /[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]/.test(value);

  if (!hasLetter || !hasNumber || !hasSpecialCharacter) {
    return 'La contraseña debe incluir al menos una letra, un número y un carácter especial.';
  }

  return '';
}

module.exports = { validatePassword };
