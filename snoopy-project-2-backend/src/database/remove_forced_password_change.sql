-- La contraseña definida por administración es final desde el alta o el restablecimiento.
-- Se conserva la columna por compatibilidad con instalaciones previas, pero ya no controla el acceso.
UPDATE users
SET must_change_password = FALSE
WHERE must_change_password = TRUE;
