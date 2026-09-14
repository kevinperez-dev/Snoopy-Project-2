// Propósito: explicar los módulos sobre la interfaz real sin sacar al usuario del portal.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeOnboarding } from '../services/authApi.js';
import { getAuthToken, hasCurrentPermission, setLoginSession } from '../utils/session.js';

const BASE_STEPS = [
  {
    target: 'inicio',
    icon: 'dashboard',
    title: 'Inicio',
    description: 'Aquí revisas el resumen semanal de la caja seleccionada: saldo inicial, ingresos, egresos y lo que quedó en caja.',
    submodules: ['Resumen semanal', 'Selector de caja'],
  },
  {
    target: 'movimientos',
    icon: 'swap_vert',
    title: 'Movimientos',
    description: 'Desde este módulo registras la operación del día. Elige Ingresos o Egresos y el movimiento quedará guardado con su folio.',
    submodules: ['Ingresos', 'Egresos'],
  },
  {
    target: 'reportes',
    icon: 'assessment',
    title: 'Reportes',
    description: 'Consulta, filtra y exporta los movimientos autorizados. También puedes revisar el historial de movimientos cancelados.',
    submodules: ['Ingresos', 'Egresos', 'Historial'],
  },
];

const SETTINGS_STEP = {
  target: 'configuracion',
  icon: 'tune',
  title: 'Configuración',
  description: 'Administra las cajas y los accesos del equipo. Este módulo solo aparece cuando tu cuenta tiene permisos de administración.',
  submodules: ['Cajas', 'Usuarios', 'Perfiles'],
};

function getPopoverPosition(target) {
  const rect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popoverWidth = Math.min(380, viewportWidth - 32);
  const popoverHeight = 270;
  const shouldOpenBelow = rect.bottom + 18 + popoverHeight <= viewportHeight;
  const left = Math.min(
    Math.max(16, rect.left + (rect.width / 2) - (popoverWidth / 2)),
    viewportWidth - popoverWidth - 16,
  );

  return {
    left,
    top: shouldOpenBelow ? rect.bottom + 18 : Math.max(16, rect.top - popoverHeight - 18),
    placement: shouldOpenBelow ? 'bottom' : 'top',
    highlight: {
      top: Math.max(6, rect.top - 6),
      left: Math.max(6, rect.left - 6),
      width: rect.width + 12,
      height: rect.height + 12,
    },
  };
}

function PortalGuide({ onboardingRequired = false }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const steps = hasCurrentPermission('cash_boxes.manage.all') ? [...BASE_STEPS, SETTINGS_STEP] : BASE_STEPS;
  const currentStep = steps[step] || steps[0];

  useEffect(() => {
    const updatePosition = () => {
      const target = document.querySelector(`[data-guide-target="${currentStep.target}"]`);
      if (!target) return;
      setPosition(getPopoverPosition(target));
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [currentStep.target]);

  useEffect(() => {
    const closeWithEscape = (event) => {
      if (event.key === 'Escape' && !onboardingRequired) {
        navigate('/inicio', { replace: true });
      }
    };

    document.addEventListener('keydown', closeWithEscape);
    return () => document.removeEventListener('keydown', closeWithEscape);
  }, [navigate, onboardingRequired]);

  const finishGuide = async () => {
    if (!onboardingRequired) {
      navigate('/inicio', { replace: true });
      return;
    }

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

  return (
    <div className="portal-guide-overlay" role="presentation">
      {position && <div className="portal-guide-spotlight" style={position.highlight} />}
      {position && (
        <section
          className={`portal-guide-popover portal-guide-popover-${position.placement}`}
          style={{ left: position.left, top: position.top }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="portalGuideTitle"
        >
          {!onboardingRequired && <button type="button" className="portal-guide-close" onClick={() => navigate('/inicio', { replace: true })} aria-label="Cerrar guía">×</button>}
          <div className="portal-guide-icon"><span className="material-icons-outlined">{currentStep.icon}</span></div>
          <p className="portal-guide-progress">Guía del sistema · {step + 1} de {steps.length}</p>
          <h2 id="portalGuideTitle">{currentStep.title}</h2>
          <p>{currentStep.description}</p>
          <div className="portal-guide-submodules" aria-label={`Apartados de ${currentStep.title}`}>
            {currentStep.submodules.map((submodule) => <span key={submodule}>{submodule}</span>)}
          </div>
          {error && <div className="portal-guide-error">{error}</div>}
          <div className="portal-guide-actions">
            <button type="button" className="btn btn-light" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || isSaving}>Anterior</button>
            {step < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => setStep((current) => current + 1)} disabled={isSaving}>Siguiente</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={finishGuide} disabled={isSaving}>{isSaving ? 'Guardando...' : onboardingRequired ? 'Finalizar guía' : 'Cerrar guía'}</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default PortalGuide;
