// Propósito: completar de forma obligatoria el primer acceso de una cuenta nueva.

import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { changeOwnPassword } from '../services/authApi.js';
import { getCurrentProfile, isAuthenticated, setLoginSession } from '../utils/session.js';

function AccountSetup() {
  const [searchParams] = useSearchParams();
  const profile = getCurrentProfile();
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirmation: '' });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isAuthenticated()) return <Navigate to="/login" replace />;

  const passwordRequired = Boolean(profile.must_change_password);
  const shouldShowGuide = profile.onboarding_status === 'pendiente' || searchParams.get('guia') === '1';

  if (!passwordRequired) {
    return <Navigate to={shouldShowGuide ? '/inicio?guia=1' : '/inicio'} replace />;
  }

  const submitPassword = async (event) => {
    event.preventDefault();
    setError('');

    if (passwordForm.next !== passwordForm.confirmation) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    try {
      setIsSaving(true);
      const result = await changeOwnPassword(passwordForm.current, passwordForm.next);
      setLoginSession(result.user, result.token);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="account-setup-page">
      <section className="account-setup-card" aria-labelledby="passwordSetupTitle">
        <span className="account-setup-icon material-icons-outlined">lock_reset</span>
        <p className="account-setup-kicker">Primer acceso</p>
        <h1 id="passwordSetupTitle">Protege tu cuenta</h1>
        <p>Tu administrador te asignó una contraseña temporal. Cámbiala para continuar.</p>
        {error && <div className="account-setup-error">{error}</div>}
        <form onSubmit={submitPassword} className="account-setup-form">
          <label>Contraseña temporal
            <input type="password" value={passwordForm.current} onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))} autoComplete="current-password" disabled={isSaving} />
          </label>
          <label>Nueva contraseña
            <input type="password" value={passwordForm.next} onChange={(event) => setPasswordForm((current) => ({ ...current, next: event.target.value }))} autoComplete="new-password" disabled={isSaving} />
          </label>
          <label>Confirmar nueva contraseña
            <input type="password" value={passwordForm.confirmation} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmation: event.target.value }))} autoComplete="new-password" disabled={isSaving} />
          </label>
          <small>Usa al menos 10 caracteres, incluyendo una letra y un número.</small>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Actualizar y continuar'}</button>
        </form>
      </section>
    </main>
  );
}

export default AccountSetup;
