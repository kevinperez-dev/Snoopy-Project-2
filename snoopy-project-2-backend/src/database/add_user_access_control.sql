-- Migración: usuarios, roles, permisos y asignación segura de cajas.
-- Es idempotente para poder aplicarse sobre instalaciones existentes.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nombre VARCHAR(120),
    ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'activo',
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_estado_check') THEN
        ALTER TABLE users
            ADD CONSTRAINT users_estado_check CHECK (estado IN ('activo', 'inactivo'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_onboarding_status_check') THEN
        ALTER TABLE users
            ADD CONSTRAINT users_onboarding_status_check
            CHECK (onboarding_status IN ('pendiente', 'completado', 'omitido'));
    END IF;
END $$;

-- Las cuentas existentes ya han usado el sistema: no deben recibir el tutorial ni cambio forzado.
UPDATE users
SET
    nombre = COALESCE(NULLIF(nombre, ''), username),
    estado = 'activo',
    onboarding_status = 'completado',
    must_change_password = FALSE,
    token_version = GREATEST(COALESCE(token_version, 1), 1)
WHERE nombre IS NULL
   OR nombre = ''
   OR estado IS NULL
   OR onboarding_status IS NULL
   OR token_version IS NULL;

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(80) NOT NULL,
    descripcion VARCHAR(255),
    nivel SMALLINT NOT NULL,
    es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roles_clave_format_check CHECK (clave ~ '^[a-z0-9_]+$'),
    CONSTRAINT roles_nivel_check CHECK (nivel > 0)
);

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(80) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(255),
    categoria VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT permissions_codigo_format_check CHECK (codigo ~ '^[a-z0-9._]+$')
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

INSERT INTO roles (clave, nombre, descripcion, nivel, es_sistema)
VALUES
    ('admin', 'Administrador', 'Administra usuarios, roles, cajas y todos los registros.', 300, TRUE),
    ('edicion', 'Edición', 'Opera y edita movimientos únicamente en las cajas asignadas.', 200, TRUE),
    ('lectura', 'Lectura', 'Consulta y exporta información de las cajas asignadas.', 100, TRUE)
ON CONFLICT (clave) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    nivel = EXCLUDED.nivel,
    es_sistema = EXCLUDED.es_sistema;

INSERT INTO permissions (codigo, nombre, descripcion, categoria)
VALUES
    ('users.manage', 'Administrar usuarios', 'Crear, editar, activar, desactivar y restablecer usuarios.', 'Usuarios'),
    ('roles.manage', 'Administrar roles', 'Configurar los permisos de roles personalizados.', 'Usuarios'),
    ('cash_boxes.read.all', 'Consultar todas las cajas', 'Consultar cualquier caja del sistema.', 'Cajas'),
    ('cash_boxes.read.assigned', 'Consultar cajas asignadas', 'Consultar solamente cajas asignadas al usuario.', 'Cajas'),
    ('cash_boxes.manage.all', 'Administrar cajas', 'Crear, editar, activar y asignar cajas.', 'Cajas'),
    ('movements.read.all', 'Consultar todos los movimientos', 'Consultar movimientos de cualquier caja.', 'Movimientos'),
    ('movements.read.assigned', 'Consultar movimientos asignados', 'Consultar movimientos de cajas asignadas.', 'Movimientos'),
    ('movements.create.all', 'Registrar movimientos en cualquier caja', 'Registrar movimientos en todas las cajas.', 'Movimientos'),
    ('movements.create.assigned', 'Registrar movimientos asignados', 'Registrar movimientos en cajas asignadas.', 'Movimientos'),
    ('movements.edit.all', 'Editar cualquier movimiento', 'Editar movimientos de cualquier caja.', 'Movimientos'),
    ('movements.edit.assigned', 'Editar movimientos asignados', 'Editar movimientos de cajas asignadas.', 'Movimientos'),
    ('movements.cancel.all', 'Cancelar movimientos', 'Cancelar movimientos de cualquier caja.', 'Movimientos'),
    ('reports.read.all', 'Consultar todos los reportes', 'Consultar reportes de cualquier caja.', 'Reportes'),
    ('reports.read.assigned', 'Consultar reportes asignados', 'Consultar reportes de cajas asignadas.', 'Reportes'),
    ('reports.export.all', 'Exportar todos los reportes', 'Exportar información de cualquier caja.', 'Reportes'),
    ('reports.export.assigned', 'Exportar reportes asignados', 'Exportar información de cajas asignadas.', 'Reportes')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    categoria = EXCLUDED.categoria;

-- Perfiles iniciales. Se insertan sin borrar permisos personalizados existentes.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.codigo IN (
    'users.manage', 'roles.manage',
    'cash_boxes.read.all', 'cash_boxes.manage.all',
    'movements.read.all', 'movements.create.all', 'movements.edit.all', 'movements.cancel.all',
    'reports.read.all', 'reports.export.all'
)
WHERE r.clave = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.codigo IN (
    'cash_boxes.read.assigned',
    'movements.read.assigned', 'movements.create.assigned', 'movements.edit.assigned',
    'reports.read.assigned', 'reports.export.assigned'
)
WHERE r.clave = 'edicion'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.codigo IN (
    'cash_boxes.read.assigned',
    'movements.read.assigned',
    'reports.read.assigned', 'reports.export.assigned'
)
WHERE r.clave = 'lectura'
ON CONFLICT DO NOTHING;

-- Conserva la columna legacy users.role por compatibilidad y crea la relación normalizada.
UPDATE users
SET role = CASE
    WHEN LOWER(COALESCE(role, '')) = 'admin' THEN 'admin'
    WHEN LOWER(COALESCE(role, '')) IN ('lectura', 'reader', 'read') THEN 'lectura'
    ELSE 'edicion'
END;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
INNER JOIN roles r ON r.clave = u.role
ON CONFLICT DO NOTHING;

ALTER TABLE cash_boxes
    ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS cash_box_members (
    cash_box_id INTEGER NOT NULL REFERENCES cash_boxes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_level VARCHAR(20) NOT NULL DEFAULT 'editor',
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cash_box_id, user_id),
    CONSTRAINT cash_box_members_access_level_check CHECK (access_level IN ('owner', 'editor', 'reader'))
);

-- Los administradores existentes conservan acceso a todas las cajas creadas antes de esta versión.
INSERT INTO cash_box_members (cash_box_id, user_id, access_level, assigned_by)
SELECT cb.id, ur.user_id, 'owner', ur.user_id
FROM cash_boxes cb
INNER JOIN user_roles ur ON TRUE
INNER JOIN roles r ON r.id = ur.role_id AND r.clave = 'admin'
ON CONFLICT (cash_box_id, user_id) DO NOTHING;

WITH first_admin AS (
    SELECT ur.user_id
    FROM user_roles ur
    INNER JOIN roles r ON r.id = ur.role_id
    WHERE r.clave = 'admin'
    ORDER BY ur.user_id
    LIMIT 1
)
UPDATE cash_boxes
SET
    created_by = COALESCE(created_by, (SELECT user_id FROM first_admin)),
    owner_user_id = COALESCE(owner_user_id, (SELECT user_id FROM first_admin))
WHERE created_by IS NULL OR owner_user_id IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_estado ON users(estado);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_cash_box_members_user_id ON cash_box_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_boxes_owner_user_id ON cash_boxes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created_at ON audit_log(actor_user_id, created_at DESC);
