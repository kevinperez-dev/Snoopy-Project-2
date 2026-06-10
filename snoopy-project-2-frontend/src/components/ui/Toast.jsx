// Archivo: src/components/ui/Toast.jsx
// Propósito: mostrar mensajes flotantes reutilizables para éxito o error.

function Toast({ toast, onClose }) {
  if (!toast) return null;

  return (
    <div className={`toast-message ${toast.type} show`}>
      <div className="toast-icon">
        <span className="material-icons-outlined">
          {toast.type === 'success' ? 'check_circle' : 'error'}
        </span>
      </div>

      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        <div className="toast-text">{toast.text}</div>
      </div>

      <button
        type="button"
        className="toast-close"
        aria-label="Cerrar aviso"
        onClick={onClose}
      >
        ×
      </button>

      <div className="toast-progress animate"></div>
    </div>
  );
}

export default Toast;
