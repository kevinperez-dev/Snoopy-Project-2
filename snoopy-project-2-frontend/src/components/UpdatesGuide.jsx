// Propósito: presentar las funciones incorporadas directamente sobre cada pantalla relacionada.

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hasCurrentPermission } from '../utils/session.js';

const UPDATE_STEPS = [
  {
    path: '/inicio',
    target: 'selector-caja',
    icon: 'account_balance_wallet',
    title: 'Trabaja por caja',
    description: 'Usa este selector para consultar una caja a la vez. Sus movimientos, saldos y folios permanecen separados de las demás cajas.',
    highlights: ['Caja seleccionada', 'Saldos independientes'],
  },
  {
    path: '/inicio',
    target: 'novedades-folios',
    icon: 'receipt_long',
    title: 'Folios identificados por caja',
    description: 'Cada movimiento incorpora la clave de su caja al inicio del folio. Así puedes identificarlo con claridad, incluso cuando dos cajas registran movimientos el mismo día.',
    highlights: ['A- para caja principal', 'Claves por caja'],
  },
  {
    path: '/configuracion/cajas',
    target: 'novedades-cajas',
    icon: 'account_balance_wallet',
    title: 'Configuración de cajas',
    description: 'Aquí se crean, editan y activan las cajas. La caja principal siempre permanece disponible para conservar los registros importantes.',
    highlights: ['Cajas independientes', 'Caja principal protegida'],
    permission: 'cash_boxes.manage.all',
    fullView: true,
  },
  {
    path: '/configuracion/usuarios',
    target: 'novedades-usuarios',
    icon: 'manage_accounts',
    title: 'Usuarios y accesos',
    description: 'Desde este apartado creas cuentas, asignas un rol y defines las cajas a las que cada persona puede acceder.',
    highlights: ['Cuentas de equipo', 'Acceso por caja'],
    permission: 'users.manage',
    fullView: true,
  },
  {
    path: '/configuracion/perfiles',
    target: 'novedades-roles',
    icon: 'badge',
    title: 'Roles de usuario',
    description: 'Los roles determinan lo que puede hacer cada cuenta. Administrador gestiona todo; Edición registra movimientos y Lectura solo consulta la información autorizada.',
    highlights: ['Administrador', 'Edición', 'Lectura'],
    permission: 'roles.manage',
    fullView: true,
  },
];

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

function UpdatesGuide() {
  const navigate = useNavigate();
  const location = useLocation();
  const steps = useMemo(
    () => UPDATE_STEPS.filter((item) => !item.permission || hasCurrentPermission(item.permission)),
    [],
  );
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState(null);
  const currentStep = steps[step] || steps[0];

  useEffect(() => {
    if (!currentStep || location.pathname === currentStep.path) return;
    navigate(`${currentStep.path}?novedades=1`, { replace: true });
  }, [currentStep, location.pathname, navigate]);

  useEffect(() => {
    if (!currentStep || location.pathname !== currentStep.path) return undefined;

    const updatePosition = () => {
      const target = document.querySelector(`[data-guide-target="${currentStep.target}"]`);
      if (!target) return;
      setPosition(getPopoverPosition(target));
    };

    const frame = window.requestAnimationFrame(updatePosition);
    const timeout = window.setTimeout(updatePosition, 180);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [currentStep, location.pathname]);

  useEffect(() => {
    const closeWithEscape = (event) => {
      if (event.key === 'Escape') navigate('/inicio', { replace: true });
    };

    document.addEventListener('keydown', closeWithEscape);
    return () => document.removeEventListener('keydown', closeWithEscape);
  }, [navigate]);

  if (!currentStep || !position || location.pathname !== currentStep.path) {
    return <div className="portal-guide-overlay" role="presentation" />;
  }

  const closeGuide = () => navigate('/inicio', { replace: true });
  const changeStep = (nextStep) => {
    setPosition(null);
    setStep(nextStep);
  };

  return (
    <div className={`portal-guide-overlay updates-guide-overlay ${currentStep.fullView ? 'updates-guide-overlay-full-view' : ''}`} role="presentation">
      {!currentStep.fullView && <div className="portal-guide-spotlight" style={position.highlight} />}
      <section
        className={`portal-guide-popover portal-guide-popover-${position.placement} updates-guide-popover`}
        style={{ left: position.left, top: position.top }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="updatesGuideTitle"
      >
        <button type="button" className="portal-guide-close" onClick={closeGuide} aria-label="Cerrar novedades">×</button>
        <div className="portal-guide-icon"><span className="material-icons-outlined">{currentStep.icon}</span></div>
        <p className="portal-guide-progress">Novedades · {step + 1} de {steps.length}</p>
        <h2 id="updatesGuideTitle">{currentStep.title}</h2>
        <p>{currentStep.description}</p>
        <div className="portal-guide-submodules" aria-label={`Aspectos destacados de ${currentStep.title}`}>
          {currentStep.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}
        </div>
        <div className="portal-guide-actions">
          <button type="button" className="btn btn-light" onClick={() => changeStep(Math.max(0, step - 1))} disabled={step === 0}>Anterior</button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => changeStep(step + 1)}>Siguiente</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={closeGuide}>Finalizar</button>
          )}
        </div>
      </section>
    </div>
  );
}

export default UpdatesGuide;
