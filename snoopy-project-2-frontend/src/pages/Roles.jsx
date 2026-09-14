// Propósito: crear perfiles operativos para cajas autorizadas sin alterar los perfiles base.

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

const BASE_ROLE_DETAILS = {
  admin: {
    icon: 'admin_panel_settings',
    description: 'Control completo de usuarios, perfiles, cajas, movimientos y reportes.',
    capabilities: ['Administrar usuarios y perfiles', 'Ver todas las cajas', 'Operar todos los movimientos', 'Consultar y exportar reportes'],
  },
  edicion: {
    icon: 'edit_note',
    description: 'Registra y corrige movimientos únicamente dentro de las cajas autorizadas para su cuenta.',
    capabilities: ['Consultar cajas', 'Registrar movimientos', 'Editar movimientos', 'Consultar reportes'],
  },
  lectura: {
    icon: 'visibility',
    description: 'Consulta y exporta la información autorizada para su cuenta sin modificarla.',
    capabilities: ['Consultar cajas', 'Consultar movimientos', 'Consultar reportes', 'Exportar reportes'],
  },
};

const PERMISSION_LABELS = {
  'users.manage': 'Administrar usuarios',
  'roles.manage': 'Administrar perfiles',
  'cash_boxes.manage.all': 'Configurar cajas',
  'cash_boxes.read.all': 'Ver todas las cajas',
  'cash_boxes.read.assigned': 'Consultar cajas',
  'movements.read.all': 'Consultar movimientos',
  'movements.create.all': 'Registrar movimientos',
  'movements.edit.all': 'Editar movimientos',
  'movements.cancel.all': 'Cancelar movimientos',
  'movements.read.assigned': 'Consultar movimientos',
  'movements.create.assigned': 'Registrar movimientos',
  'movements.edit.assigned': 'Editar movimientos',
  'movements.cancel.assigned': 'Cancelar movimientos',
  'reports.read.all': 'Consultar reportes',
  'reports.export.all': 'Exportar reportes',
  'reports.read.assigned': 'Consultar reportes',
  'reports.export.assigned': 'Exportar reportes',
};

const PERMISSION_COPY = {
  'users.manage': ['Administrar usuarios', 'Crear, editar, activar, desactivar y restablecer cuentas.'],
  'roles.manage': ['Administrar perfiles', 'Crear y ajustar perfiles personalizados.'],
  'cash_boxes.read.all': ['Consultar todas las cajas', 'Ver cualquier caja disponible en el sistema.'],
  'cash_boxes.read.assigned': ['Consultar cajas', 'Ver las cajas autorizadas para esta cuenta.'],
  'cash_boxes.manage.all': ['Administrar cajas', 'Crear, editar, activar y organizar cajas.'],
  'movements.read.all': ['Consultar todos los movimientos', 'Ver movimientos de cualquier caja.'],
  'movements.read.assigned': ['Consultar movimientos', 'Ver movimientos de las cajas autorizadas.'],
  'movements.create.all': ['Registrar movimientos en cualquier caja', 'Registrar movimientos en todas las cajas.'],
  'movements.create.assigned': ['Registrar movimientos', 'Registrar movimientos en las cajas autorizadas.'],
  'movements.edit.all': ['Editar cualquier movimiento', 'Editar movimientos de cualquier caja.'],
  'movements.edit.assigned': ['Editar movimientos', 'Editar movimientos de las cajas autorizadas.'],
  'movements.cancel.all': ['Cancelar movimientos', 'Cancelar movimientos de cualquier caja.'],
  'reports.read.all': ['Consultar todos los reportes', 'Consultar reportes de cualquier caja.'],
  'reports.read.assigned': ['Consultar reportes', 'Consultar reportes de las cajas autorizadas.'],
  'reports.export.all': ['Exportar todos los reportes', 'Exportar información de cualquier caja.'],
  'reports.export.assigned': ['Exportar reportes', 'Exportar información de las cajas autorizadas.'],
};

function getRoleDetails(role) {
  const baseDetails = BASE_ROLE_DETAILS[role.clave];
  if (baseDetails) return baseDetails;

  const capabilities = [...new Set((role.permissions || [])
    .map((permission) => PERMISSION_LABELS[permission])
    .filter(Boolean))];

  return {
    icon: 'badge',
    description: role.descripcion || 'Perfil personalizado para una combinación específica de accesos.',
    capabilities: capabilities.length > 0 ? capabilities : ['Consultar cajas', 'Consultar movimientos'],
  };
}

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
    // Es una carga inicial desde la API; no deriva estado del render actual.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
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
      setToast({
        title: isEditing ? 'Perfil actualizado' : 'Perfil creado',
        text: 'Ya puedes asignarlo desde Usuarios.',
        type: 'success',
      });
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
            <h1>Perfiles de acceso</h1>
            <p>Define qué puede hacer cada tipo de cuenta. Administrador mantiene el acceso completo; los demás perfiles operan únicamente dentro de sus permisos.</p>
          </div>
          <div className="users-summary">
            <span><strong>{roles.length}</strong> perfiles</span>
            <span><strong>{customRoles.length}</strong> personalizados</span>
          </div>
        </section>

        <section className="roles-layout">
          <form className="card users-form-card" onSubmit={submit}>
            <div className="card-header">
              <div>
                <h2>{isEditing ? 'Editar perfil' : 'Nuevo perfil'}</h2>
                <p>Incluye solo las capacidades que necesita el puesto.</p>
              </div>
              {isEditing && <button type="button" className="btn btn-light btn-small" onClick={() => setForm(EMPTY_FORM)}>Cancelar</button>}
            </div>
            <div className="users-form-body">
              <label>
                Nombre del perfil
                <input value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} maxLength="80" required disabled={isSaving} placeholder="Ej. Supervisor de caja" />
              </label>
              <label>
                Descripción
                <textarea className="roles-description-input" value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} maxLength="255" disabled={isSaving} placeholder="Para qué sirve este perfil" />
              </label>
              {isEditing && <label className="roles-active-control"><input type="checkbox" checked={form.activa} onChange={(event) => setForm((current) => ({ ...current, activa: event.target.checked }))} disabled={isSaving} /> Perfil activo</label>}
              <fieldset className="roles-permissions">
                <legend>Capacidades del perfil</legend>
                <p>El acceso básico a cajas y movimientos se incluye para que el perfil pueda usar el sistema.</p>
                {permissions.map((permission) => {
                  const required = REQUIRED_PERMISSIONS.includes(permission.codigo);
                  const [permissionName, permissionDescription] = PERMISSION_COPY[permission.codigo] || [permission.nombre, permission.descripcion];
                  return (
                    <label key={permission.codigo} className={form.permissions.includes(permission.codigo) ? 'selected' : ''}>
                      <input type="checkbox" checked={form.permissions.includes(permission.codigo)} onChange={() => togglePermission(permission.codigo)} disabled={required || isSaving} />
                      <span><strong>{permissionName}</strong><small>{permissionDescription}</small></span>
                      {required && <em>Incluido</em>}
                    </label>
                  );
                })}
              </fieldset>
              <button type="submit" className="btn btn-primary users-save-button" disabled={isSaving}>
                <span className="material-icons-outlined">{isEditing ? 'save' : 'add_task'}</span>
                {isSaving ? 'Guardando...' : isEditing ? 'Guardar perfil' : 'Crear perfil'}
              </button>
            </div>
          </form>

          <section className="card roles-list-card">
            <div className="card-header">
              <div>
                <h2>Perfiles disponibles</h2>
                <p>Los perfiles predeterminados mantienen una jerarquía clara y no se pueden modificar.</p>
              </div>
            </div>
            <div className="roles-list">
              {isLoading ? <p className="users-empty">Cargando perfiles...</p> : roles.map((role) => {
                const details = getRoleDetails(role);
                return (
                  <article className={`role-record ${role.activo ? '' : 'inactive'}`} key={role.id}>
                    <div className="role-record-icon"><span className="material-icons-outlined">{details.icon}</span></div>
                    <div>
                      <div className="role-record-title">
                        <h3>{role.nombre}</h3>
                        <span className={role.es_sistema ? 'role-status base' : 'role-status custom'}>{role.es_sistema ? 'Predeterminado' : 'Personalizado'}</span>
                        {!role.activo && <span className="user-status inactivo">Inactivo</span>}
                      </div>
                      <p>{details.description}</p>
                      <div className="role-capability-list" aria-label={`Capacidades de ${role.nombre}`}>
                        {details.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
                      </div>
                      <small>En uso por {role.usuarios_count} {role.usuarios_count === 1 ? 'usuario' : 'usuarios'}</small>
                    </div>
                    {!role.es_sistema && <button type="button" className="btn-icon-action btn-edit-row" onClick={() => editRole(role)} title="Editar perfil"><span className="material-icons-outlined">edit</span></button>}
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export default Roles;
