// Archivo: src/pages/Login.jsx
// Propósito: pantalla de inicio de sesión conectada al backend sin renderizar <body> dentro de React

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../services/authApi';
import { setLoginSession } from '../utils/session.js';
import '../styles/login.css';

function Login() {
  const navigate = useNavigate();

  // Estado del formulario de login
  const [form, setForm] = useState({
    username: '',
    password: '',
  });

  // Estado para mensajes de error
  const [error, setError] = useState('');

  // Estado para bloquear el botón mientras se valida el usuario
  const [isLoading, setIsLoading] = useState(false);

  // Aplica la clase correcta al body real del documento
  useEffect(() => {
    document.body.classList.remove(
      'pagina-dashboard',
      'pagina-reportes',
      'modo-ingreso',
      'modo-egreso',
    );


    document.body.classList.add('login-page');

    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  // Actualiza los valores del formulario
  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  // Propósito: enviar usuario y contraseña al backend y redirigir al inicio si el login fue correcto.
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.username.trim() || !form.password.trim()) {
      setError('Ingresa usuario y contraseña.');
      return;
    }

    try {
      // Propósito: bloquear el botón mientras se valida el usuario.
      setIsLoading(true);
      setError('');

      // Propósito: validar credenciales contra el backend.
      const result = await loginUser(form.username.trim(), form.password.trim());

      // Propósito: validar que exista token antes de guardar sesión.
      if (!result?.token) {
        throw new Error('No se pudo iniciar sesión. Intenta nuevamente.');
      }

      // Propósito: evitar que falle si result.user no viene completo.
      const user = result.user || {};

      // Propósito: guardar sesión temporal; se borra al cerrar la pestaña y vence por inactividad.
      setLoginSession(user.username || form.username.trim(), result.token, user.role || 'admin');

      // Propósito: enviar al usuario a la pantalla inicial.
      navigate('/inicio', { replace: true });
    } catch (error) {
      // Propósito: mostrar el error real en consola para depurar.
      console.error('No se pudo iniciar sesión:', error);

      // Propósito: mostrar error visible en pantalla.
      setError(error.message || 'No se pudo iniciar sesión. Revisa tus datos e intenta nuevamente.');
    } finally {
      // Propósito: desbloquear el botón.
      setIsLoading(false);
    }
  };

  return (
    <main className="login-wrapper">
      <section className="login-card">
        <div className="login-brand">
          <img src="/snoopy-laptop-removebg-preview.png" alt="Logo Snoopy Project 2" className="login-logo" />

          <div>
            <h1>Snoopy Project 2</h1>
            <p>Control de ingresos y egresos</p>
          </div>
        </div>

        {error && <div className="login-alert">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
          <div className="login-field">
            <label htmlFor="username">Usuario</label>

            <div className="input-wrap">
              <span className="material-icons-outlined">person</span>
              <input
                type="text"
                id="username"
                name="username"
                placeholder="Ingresa tu usuario"
                value={form.username}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="password">Contraseña</label>

            <div className="input-wrap">
              <span className="material-icons-outlined">lock</span>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Ingresa tu contraseña"
                value={form.password}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>
          </div>

          <button type="submit" className="btn-login" disabled={isLoading}>
            <span className="material-icons-outlined">login</span>
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default Login;
