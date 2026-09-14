// Propósito: crear perfiles operativos para cajas asignadas sin alterar los perfiles base.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Toast from '../components/ui/Toast.jsx';
import { hasCurrentPermission, isAuthenticated } from '../utils/session.js';
import { createRole, getRoles, getRolesConfiguration, updateRole } from '../services/rolesApi.js';

const REQUIRED_PERMISSIONS = ['cash_boxes.read.assigned', 'movements.read.assigned'];
const EMPTY_FORM = {
  id: null,
  nombre: '',
  descripcion: '',
  activa: true,
  permissions: REQUIRED_PERMISSIONS,
};

function Roles() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const isEditing = Boolean(form.id);
  const customRoles = useMemo(() => roles.filter((role) => !role.es_sistema), [roles]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [rolesData, configuration] = await Promise.all([getRoles(), getRolesConfiguration()]);
      setRoles(rolesData);
      setPermissions(configuration.permissions || []);
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
    if (!hasCurrentPermission('roles.manage')) {
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

  const togglePermission = (code) => {
    if (REQUIRED_PERMISSIONS.includes(code)) return;
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(code)
        ? current.permissions.filter((permission) => permission !== code)
        : [...current.permissions, code],
    }));
  };

  const editRole = (role) => {
    if (role.es_sistema) return;
    setForm({
      id: role.id,
      nombre: role.nombre,
      descripcion: role.descripcion || '',
      activa: role.activo,
      permissions: role.permissions || REQUIRED_PERMISSIONS,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        activa: form.activa,
        permissions: form.permissions,
      };
      if (isEditing) await updateRole(form.id, payload);
      else await createRole(payload);
      setForm(EMPTY_FORM);
      await loadData();
      setToast({ title: isEditing ? 'Perfil actualizado' : 'Perfil creado', text: 'Ya puedes asignarlo desde Usuarios.', type: 'success' });
    } catch (error) {
      setToast({ title: 'Revisa el perfil', text: error.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header activePage="configuracion" />
      <main className="page-wrapper roles-page">
        <section className="page-header screenshot-style-header users-page-header">
          <div>
            <p className="section-eyebrow">Configuración</p>
            <h1>Perfiles y permisos</h1>
            <p>Administración se mantiene como el perfil superior. Los perfiles personalizados solo operan dentro de cajas asignadas.</p>
          </div>
          <div className="users-summary"><span><strong>{roles.length}</strong> perfiles</span><span><strong>{customRoles.length}</strong> personalizados</span></div>
        </section>

        <section className="roles-layout">
          <form className="card users-form-card" onSubmit={submit}>
            <div className="card-header"><div><h2>{isEditing ? 'Editar perfil' : 'Nuevo perfil'}</h2><p>Incluye solo las capacidades que necesita el puesto.</p></div>{isEditing && <button type="button" className="btn btn-light btn-small" onClick={() => setForm(EMPTY_FORM)}>Cancelar</button>}</div>
            <div className="users-form-body">
              <label>Nombre del perfil<input value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} maxLength="80" required disabled={isSaving} placeholder="Ej. Supervisor de caja" /></label>
              <label>Descripción<textarea className="roles-description-input" value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} maxLength="255" disabled={isSaving} placeholder="Para qué sirve este perfil" /></label>
              {isEditing && <label className="roles-active-control"><input type="checkbox" checked={form.activa} onChange={(event) => setForm((current) => ({ ...current, activa: event.target.checked }))} disabled={isSaving} /> Perfil activo</label>}
              <fieldset className="roles-permissions"><legend>Capacidades del perfil</legend><p>Las dos primeras son indispensables para que pueda usar sus cajas asignadas.</p>
                {permissions.map((permission) => {
                  const required = REQUIRED_PERMISSIONS.includes(permission.codigo);
                  return <label key={permission.codigo} className={form.permissions.includes(permission.codigo) ? 'selected' : ''}><input type="checkbox" checked={form.permissions.includes(permission.codigo)} onChange={() => togglePermission(permission.codigo)} disabled={required || isSaving} /><span><strong>{permission.nombre}</strong><small>{permission.descripcion}</small></span>{required && <em>Base</em>}</label>;
                })}
              </fieldset>
              <button type="submit" className="btn btn-primary users-save-button" disabled={isSaving}><span className="material-icons-outlined">{isEditing ? 'save' : 'add_task'}</span>{isSaving ? 'Guardando...' : isEditing ? 'Guardar perfil' : 'Crear perfil'}</button>
            </div>
          </form>

          <section className="card roles-list-card"><div className="card-header"><div><h2>Perfiles disponibles</h2><p>Los perfiles base están protegidos para conservar una jerarquía clara.</p></div></div><div className="roles-list">
            {isLoading ? <p className="users-empty">Cargando perfiles...</p> : roles.map((role) => <article className={`role-record ${role.activo ? '' : 'inactive'}`} key={role.id}><div className="role-record-icon"><span className="material-icons-outlined">{role.clave === 'admin' ? 'admin_panel_settings' : role.clave === 'edicion' ? 'edit_note' : role.clave === 'lectura' ? 'visibility' : 'badge'}</span></div><div><div className="role-record-title"><h3>{role.nombre}</h3><span className={role.es_sistema ? 'role-status base' : 'role-status custom'}>{role.es_sistema ? 'Base' : 'Personalizado'}</span>{!role.activo && <span className="user-status inactivo">Inactivo</span>}</div><p>{role.descripcion || 'Sin descripción.'}</p><div className="role-permission-tags">{role.permissions.map((permission) => <span key={permission}>{permission.split('.').slice(1).join(' · ')}</span>)}</div><small>{role.usuarios_count} usuario(s) asignado(s)</small></div>{!role.es_sistema && <button type="button" className="btn-icon-action btn-edit-row" onClick={() => editRole(role)} title="Editar perfil"><span className="material-icons-outlined">edit</span></button>}</article>)}
          </div></section>
        </section>
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export default Roles;
