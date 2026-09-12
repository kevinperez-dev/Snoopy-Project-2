// Propósito: administrar el catálogo de cajas disponibles para el usuario.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header.jsx';
import Toast from '../components/ui/Toast.jsx';
import { createCashBox, getCashBoxes, updateCashBox } from '../services/cashBoxesApi.js';
import { getCurrentRole, isAuthenticated } from '../utils/session.js';
import { useCashBoxes } from '../hooks/useCashBoxes.js';

const EMPTY_FORM = {
  id: null,
  nombre: '',
  descripcion: '',
  activa: true,
};

function CashBoxes() {
  const navigate = useNavigate();
  const { reloadCashBoxes } = useCashBoxes();
  const [cashBoxes, setCashBoxes] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const loadCashBoxes = async () => {
    try {
      setIsLoading(true);
      setCashBoxes(await getCashBoxes());
    } catch (error) {
      setToast({ title: 'Aviso', text: error.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }

    if (getCurrentRole() !== 'admin') {
      navigate('/inicio', { replace: true });
      return;
    }

    // Carga datos desde la API protegida al entrar a la pantalla administrativa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCashBoxes();
  }, [navigate]);

  useEffect(() => {
    document.body.classList.remove('login-page', 'modo-egreso', 'modo-cancelado');
    document.body.classList.add('pagina-dashboard', 'modo-ingreso');

    return () => document.body.classList.remove('pagina-dashboard', 'modo-ingreso');
  }, []);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.nombre.trim()) {
      setToast({ title: 'Aviso', text: 'Escribe el nombre de la caja.', type: 'error' });
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        activa: form.principal ? true : form.activa,
      };

      if (form.id) {
        await updateCashBox(form.id, payload);
      } else {
        await createCashBox(payload);
      }

      setForm(EMPTY_FORM);
      await loadCashBoxes();
      await reloadCashBoxes();
      setToast({
        title: form.id ? 'Caja actualizada' : 'Caja creada',
        text: 'El catálogo de cajas se actualizó correctamente.',
        type: 'success',
      });
    } catch (error) {
      setToast({ title: 'Aviso', text: error.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const editCashBox = (cashBox) => {
    setForm({
      id: cashBox.id,
      nombre: cashBox.nombre,
      descripcion: cashBox.descripcion || '',
      activa: cashBox.activa,
      principal: cashBox.principal,
    });
  };

  const toggleCashBox = async (cashBox) => {
    try {
      await updateCashBox(cashBox.id, {
        nombre: cashBox.nombre,
        descripcion: cashBox.descripcion || '',
        activa: !cashBox.activa,
      });
      await loadCashBoxes();
      await reloadCashBoxes();
    } catch (error) {
      setToast({ title: 'Aviso', text: error.message, type: 'error' });
    }
  };

  return (
    <>
      <Header activePage="configuracion" />

      <main className="page-wrapper cash-boxes-page">
        <section className="page-header screenshot-style-header">
          <div>
            <h1>Configuración de cajas</h1>
            <p>Administra las cajas disponibles sin mezclar sus movimientos ni saldos.</p>
          </div>
        </section>

        <section className="cash-boxes-layout">
          <div className="card form-card cash-box-form-card">
            <div className="card-header">
              <div>
                <h2>{form.id ? 'Editar caja' : 'Nueva caja'}</h2>
                <p className="report-section-description">Las cajas con movimientos se pueden desactivar, pero no eliminar.</p>
              </div>
            </div>

            <form className="label-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="cashBoxName">Nombre</label>
                <input
                  id="cashBoxName"
                  type="text"
                  maxLength="80"
                  value={form.nombre}
                  onChange={(event) => updateForm('nombre', event.target.value)}
                  placeholder="Ej. Caja eventos"
                />
              </div>

              <div className="form-group">
                <label htmlFor="cashBoxDescription">Descripción</label>
                <textarea
                  id="cashBoxDescription"
                  rows="4"
                  maxLength="255"
                  value={form.descripcion}
                  onChange={(event) => updateForm('descripcion', event.target.value)}
                  placeholder="Para qué se utiliza esta caja"
                />
              </div>

              {form.id && (
                <label className="cash-box-active-check">
                  <input
                    type="checkbox"
                    checked={form.activa}
                    onChange={(event) => updateForm('activa', event.target.checked)}
                    disabled={form.principal}
                  />
                  {form.principal ? 'La caja principal siempre permanece activa' : 'Caja activa y disponible para operar'}
                </label>
              )}

              <div className="form-actions">
                {form.id && (
                  <button type="button" className="btn btn-light" onClick={() => setForm(EMPTY_FORM)}>
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  <span className="material-icons-outlined">{form.id ? 'save' : 'add'}</span>
                  {isSaving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear caja'}
                </button>
              </div>
            </form>
          </div>

          <div className="card cash-box-list-card">
            <div className="card-header">
              <div>
                <h2>Catálogo de cajas</h2>
                <p className="report-section-description">Solo las cajas activas aparecen en el selector superior.</p>
              </div>
            </div>

            <div className="cash-box-list">
              {isLoading ? (
                <p className="cash-box-empty-state">Cargando cajas...</p>
              ) : cashBoxes.length === 0 ? (
                <p className="cash-box-empty-state">No hay cajas configuradas.</p>
              ) : (
                cashBoxes.map((cashBox) => (
                  <article key={cashBox.id} className={`cash-box-item ${cashBox.activa ? '' : 'inactive'}`}>
                    <div className="cash-box-item-icon">
                      <span className="material-icons-outlined">account_balance_wallet</span>
                    </div>
                    <div className="cash-box-item-content">
                      <div className="cash-box-item-heading">
                        <h3>{cashBox.nombre}</h3>
                        <span className={`cash-box-status ${cashBox.principal ? 'principal' : cashBox.activa ? 'active' : 'inactive'}`}>
                          {cashBox.principal ? 'Principal' : cashBox.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <p>{cashBox.descripcion || 'Sin descripción.'}</p>
                      <small>{cashBox.movimientos_count} movimiento(s)</small>
                    </div>
                    <div className="cash-box-item-actions">
                      <button type="button" className="btn-icon-action btn-edit-row" onClick={() => editCashBox(cashBox)} title="Editar caja">
                        <span className="material-icons-outlined">edit</span>
                      </button>
                      <button type="button" className="btn btn-light cash-box-toggle" onClick={() => toggleCashBox(cashBox)} disabled={cashBox.principal}>
                        {cashBox.principal ? 'Siempre activa' : cashBox.activa ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export default CashBoxes;
