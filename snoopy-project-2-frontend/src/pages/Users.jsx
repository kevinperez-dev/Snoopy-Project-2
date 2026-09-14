// Propósito: permitir que un administrador gestione cuentas, perfiles y cajas asignadas.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Toast from '../components/ui/Toast.jsx';
import { hasCurrentPermission, isAuthenticated } from '../utils/session.js';
import {
  createUser,
  getUsers,
  getUsersConfiguration,
  resetUserPassword,
  updateUser,
} from '../services/usersApi.js';

const EMPTY_FORM = {
  id: null,
  nombre: '',
  username: '',
  password: '',
  role_key: 'edicion',
  estado: 'activo',
  cajas: [],
};

function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [toast, setToast] = useState(null);

  const isEditing = Boolean(form.id);
  const activeUsers = useMemo(() => users.filter((user) => user.estado === 'activo').length, [users]);
  const newUsers = useMemo(() => users.filter((user) => user.onboarding_status === 'pendiente').length, [users]);
  const getAssignmentLevel = (roleKey) => {
    const role = roles.find((item) => item.clave === roleKey);
    const permissions = role?.permissions || [];
    return permissions.includes('movements.create.assigned') || permissions.includes('movements.edit.assigned')
      ? 'editor'
      : 'reader';
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [usersData, configuration] = await Promise.all([getUsers(), getUsersConfiguration()]);
      setUsers(usersData);
      setRoles(configuration.roles || []);
      setCashBoxes(configuration.cash_boxes || []);
    } catch (error) {
      setToast({ title: 'No se pudo cargar', text: error.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }

    if (!hasCurrentPermission('users.manage')) {
      navigate('/inicio', { replace: true });
      return;
    }

    loadData();
  }, [navigate]);

  useEffect(() => {
    document.body.classList.remove('login-page', 'modo-egreso', 'modo-cancelado');
    document.body.classList.add('pagina-dashboard', 'modo-ingreso');
    return () => document.body.classList.remove('pagina-dashboard', 'modo-ingreso');
  }, []);

  const changeForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const toggleCashBox = (cashBoxId) => {
    setForm((current) => {
      const alreadyAssigned = current.cajas.some((item) => Number(item.cash_box_id) === Number(cashBoxId));
      const cajas = alreadyAssigned
        ? current.cajas.filter((item) => Number(item.cash_box_id) !== Number(cashBoxId))
        : [...current.cajas, {
          cash_box_id: Number(cashBoxId),
          access_level: getAssignmentLevel(current.role_key),
        }];

      return { ...current, cajas };
    });
  };

  const editUser = (user) => {
    setForm({
      id: user.id,
      nombre: user.nombre || '',
      username: user.username || '',
      password: '',
      role_key: user.role_key || 'edicion',
      estado: user.estado || 'activo',
      cajas: (user.cajas || []).map((cashBox) => ({
        cash_box_id: Number(cashBox.cash_box_id),
        access_level: cashBox.access_level,
      })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsSaving(true);
      const payload = {
        nombre: form.nombre.trim(),
        username: form.username.trim(),
        role_key: form.role_key,
        estado: form.estado,
        cajas: form.cajas,
      };

      if (isEditing) {
        await updateUser(form.id, payload);
      } else {
        await createUser({ ...payload, password: form.password });
      }

      setForm(EMPTY_FORM);
      await loadData();
      setToast({
        title: isEditing ? 'Usuario actualizado' : 'Usuario creado',
        text: isEditing
          ? 'Los permisos y las cajas asignadas se actualizaron.'
          : 'La cuenta iniciará con contraseña temporal y guía de bienvenida.',
        type: 'success',
      });
    } catch (error) {
      setToast({ title: 'Revisa la información', text: error.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!resetTarget) return;

    try {
      setIsSaving(true);
      const result = await resetUserPassword(resetTarget.id, resetPassword);
      setResetTarget(null);
      setResetPassword('');
      setToast({ title: 'Contraseña restablecida', text: result.message, type: 'success' });
      await loadData();
    } catch (error) {
      setToast({ title: 'No se pudo restablecer', text: error.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header activePage="configuracion" />
      <main className="page-wrapper users-page">
        <section className="page-header screenshot-style-header users-page-header">
          <div>
            <p className="section-eyebrow">Configuración</p>
            <h1>Usuarios y accesos</h1>
            <p>Define quién puede consultar u operar cada caja sin exponer los registros de otros usuarios.</p>
          </div>
          <div className="users-summary" aria-label="Resumen de usuarios">
            <span><strong>{activeUsers}</strong> activos</span>
            <span><strong>{newUsers}</strong> nuevos</span>
          </div>
        </section>

        <section className="users-layout">
          <form className="card users-form-card" onSubmit={handleSubmit}>
            <div className="card-header">
              <div>
                <h2>{isEditing ? 'Editar usuario' : 'Nuevo usuario'}</h2>
                <p>{isEditing ? 'Los cambios de perfil o estado cierran la sesión vigente de esa cuenta.' : 'La primera vez deberá cambiar su contraseña y completar una guía breve.'}</p>
              </div>
              {isEditing && <button type="button" className="btn btn-light btn-small" onClick={() => setForm(EMPTY_FORM)}>Cancelar</button>}
            </div>
            <div className="users-form-body">
              <label>Nombre visible
                <input value={form.nombre} onChange={(event) => changeForm('nombre', event.target.value)} maxLength="120" required disabled={isSaving} placeholder="Ej. María López" />
              </label>
              <label>Usuario
                <input value={form.username} onChange={(event) => changeForm('username', event.target.value.toLowerCase())} maxLength="50" required disabled={isSaving} placeholder="maria.lopez" autoComplete="off" />
              </label>
              {!isEditing && <label>Contraseña temporal
                <input type="password" value={form.password} onChange={(event) => changeForm('password', event.target.value)} required disabled={isSaving} autoComplete="new-password" />
                <small>Mínimo 10 caracteres, con una letra y un número.</small>
              </label>}
              <div className="users-form-two-columns">
                <label>Perfil
                  <select value={form.role_key} onChange={(event) => {
                    const roleKey = event.target.value;
                    const accessLevel = getAssignmentLevel(roleKey);
                    setForm((current) => ({
                      ...current,
                      role_key: roleKey,
                      cajas: current.cajas.map((cashBox) => ({ ...cashBox, access_level: accessLevel })),
                    }));
                  }} disabled={isSaving}>
                    {roles.map((role) => <option key={role.clave} value={role.clave}>{role.nombre}</option>)}
                  </select>
                </label>
                <label>Estado
                  <select value={form.estado} onChange={(event) => changeForm('estado', event.target.value)} disabled={isSaving}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </label>
              </div>
              <fieldset className="users-box-assignment">
                <legend>Cajas asignadas</legend>
                <p>Administración tiene acceso global; para Edición y Lectura asigna al menos una caja. El nivel se toma del perfil elegido.</p>
                <div className="users-box-assignment-list">
                  {cashBoxes.map((cashBox) => {
                    const assignment = form.cajas.find((item) => Number(item.cash_box_id) === Number(cashBox.id));
                    return (
                      <div className={`user-box-assignment ${assignment ? 'selected' : ''}`} key={cashBox.id}>
                        <label>
                          <input type="checkbox" checked={Boolean(assignment)} onChange={() => toggleCashBox(cashBox.id)} disabled={isSaving} />
                          <span><strong>{cashBox.nombre}</strong><small>{cashBox.clave} · {cashBox.activa ? 'Activa' : 'Inactiva'}</small></span>
                        </label>
                        {assignment && <span className="user-box-access-label">{assignment.access_level === 'reader' ? 'Lectura' : 'Edición'}</span>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <button type="submit" className="btn btn-primary users-save-button" disabled={isSaving}>
                <span className="material-icons-outlined">{isEditing ? 'save' : 'person_add'}</span>
                {isSaving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>

          <section className="card users-list-card" aria-labelledby="usersListTitle">
            <div className="card-header">
              <div>
                <h2 id="usersListTitle">Cuentas registradas</h2>
                <p>“Nuevo” indica que la guía inicial aún está pendiente.</p>
              </div>
            </div>
            <div className="users-list">
              {isLoading ? <p className="users-empty">Cargando usuarios...</p> : users.length === 0 ? <p className="users-empty">Todavía no hay usuarios registrados.</p> : users.map((user) => (
                <article className={`user-record ${user.estado !== 'activo' ? 'inactive' : ''}`} key={user.id}>
                  <div className="user-record-avatar">{String(user.nombre || user.username).slice(0, 1).toUpperCase()}</div>
                  <div className="user-record-main">
                    <div className="user-record-title"><h3>{user.nombre}</h3><span className={`user-status ${user.estado}`}>{user.estado === 'activo' ? 'Activo' : 'Inactivo'}</span>{user.onboarding_status === 'pendiente' && <span className="user-status new">Nuevo</span>}</div>
                    <p>@{user.username} · <strong>{user.role_nombre || user.role_key}</strong></p>
                    <div className="user-record-boxes">{user.role_key === 'admin' ? <span>Acceso a todas las cajas</span> : user.cajas?.length ? user.cajas.map((cashBox) => <span key={cashBox.cash_box_id}>{cashBox.nombre}</span>) : <span>Sin cajas asignadas</span>}</div>
                  </div>
                  <div className="user-record-actions">
                    <button type="button" className="btn-icon-action btn-edit-row" onClick={() => editUser(user)} title="Editar usuario"><span className="material-icons-outlined">edit</span></button>
                    <button type="button" className="btn-icon-action btn-print-row" onClick={() => { setResetTarget(user); setResetPassword(''); }} title="Restablecer contraseña"><span className="material-icons-outlined">key</span></button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      </main>

      {resetTarget && <div className="report-modal-backdrop" role="presentation">
        <form className="user-password-modal" onSubmit={handleResetPassword} role="dialog" aria-modal="true" aria-labelledby="resetPasswordTitle">
          <button type="button" className="report-modal-close" onClick={() => setResetTarget(null)} aria-label="Cerrar">×</button>
          <span className="material-icons-outlined">lock_reset</span>
          <h2 id="resetPasswordTitle">Restablecer contraseña</h2>
          <p>Asigna una contraseña temporal a <strong>{resetTarget.nombre}</strong>. Sus sesiones activas se cerrarán y deberá cambiarla al iniciar.</p>
          <label>Nueva contraseña temporal
            <input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoFocus required disabled={isSaving} autoComplete="new-password" />
          </label>
          <small>Mínimo 10 caracteres, con una letra y un número.</small>
          <div className="user-password-actions"><button type="button" className="btn btn-light" onClick={() => setResetTarget(null)} disabled={isSaving}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Restablecer'}</button></div>
        </form>
      </div>}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export default Users;
