// Propósito: completar de forma obligatoria el primer acceso de una cuenta nueva.

import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { changeOwnPassword, completeOnboarding } from '../services/authApi.js';
import { getAuthToken, getCurrentProfile, isAuthenticated, setLoginSession } from '../utils/session.js';
import { getCashBoxes } from '../services/cashBoxesApi.js';

const GUIDE_STEPS = [
  {
    icon: 'waving_hand',
    title: 'Bienvenido a Snoopy Project 2',
    text: 'Aquí podrás consultar y operar únicamente la información autorizada para tu cuenta.',
  },
  {
    icon: 'account_balance_wallet',
    title: 'Tus cajas asignadas',
    text: 'Cada caja conserva sus saldos y movimientos por separado. El selector superior cambia el contexto de toda la pantalla.',
  },
  {
    icon: 'swap_vert',
    title: 'Registra con cuidado',
    text: 'Los movimientos generan un folio propio de la caja. Si editas algo, deja siempre un comentario claro.',
  },
  {
    icon: 'assessment',
    title: 'Consulta y reporta',
    text: 'Inicio y Reportes muestran solo las cajas a las que tienes acceso. Tu perfil define si puedes leer, editar o administrar.',
  },
];

function AccountSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profile = getCurrentProfile();
  const isGuideReplay = searchParams.get('guia') === '1';
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirmation: '' });
  const [step, setStep] = useState(0);
  const [cashBoxNames, setCashBoxNames] = useState([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const passwordRequired = Boolean(profile.must_change_password);
  const guideRequired = profile.onboarding_status === 'pendiente' || isGuideReplay;

  useEffect(() => {
    if (!passwordRequired && !guideRequired) {
      navigate('/inicio', { replace: true });
    }
  }, [guideRequired, navigate, passwordRequired]);

  useEffect(() => {
    if (!passwordRequired && guideRequired) {
      getCashBoxes()
        .then((cashBoxes) => setCashBoxNames(cashBoxes.map((cashBox) => cashBox.nombre)))
        .catch(() => setCashBoxNames([]));
    }
  }, [guideRequired, passwordRequired]);

  if (!isAuthenticated()) return <Navigate to="/login" replace />;

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

  const finishGuide = async () => {
    try {
      setIsSaving(true);
      setError('');
      const result = await completeOnboarding('completado');
      setLoginSession(result.user, getAuthToken());
      navigate('/inicio', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (passwordRequired) {
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

  const currentStep = GUIDE_STEPS[step];
  return (
    <main className="account-setup-page">
      <section className="account-setup-card account-guide-card" aria-labelledby="guideTitle">
        <div className="guide-progress" aria-label={`Paso ${step + 1} de ${GUIDE_STEPS.length}`}>
          {GUIDE_STEPS.map((guideStep, index) => <span key={guideStep.title} className={index <= step ? 'active' : ''} />)}
        </div>
        <span className="account-setup-icon material-icons-outlined">{currentStep.icon}</span>
        <p className="account-setup-kicker">{isGuideReplay ? 'Guía rápida' : 'Todo listo'}</p>
        <h1 id="guideTitle">{currentStep.title}</h1>
        <p>{currentStep.text}</p>
        {step === 1 && cashBoxNames.length > 0 && <div className="guide-cash-boxes">{cashBoxNames.map((name) => <span key={name}>{name}</span>)}</div>}
        {error && <div className="account-setup-error">{error}</div>}
        <div className="guide-actions">
          <button type="button" className="btn btn-light" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || isSaving}>Anterior</button>
          {step < GUIDE_STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep((current) => current + 1)} disabled={isSaving}>Siguiente</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={isGuideReplay ? () => navigate('/inicio', { replace: true }) : finishGuide} disabled={isSaving}>{isGuideReplay ? 'Volver al inicio' : 'Ir al inicio'}</button>
          )}
        </div>
      </section>
    </main>
  );
}

export default AccountSetup;
