-- Archivo: src/database/schema.sql
-- Propósito: crear las tablas iniciales del sistema Snoopy Project 2.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_boxes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    principal BOOLEAN NOT NULL DEFAULT FALSE,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE cash_boxes ADD COLUMN IF NOT EXISTS principal BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO cash_boxes (nombre, descripcion, principal)
VALUES
    ('Caja normal', 'Caja principal de la operacion diaria.', TRUE),
    ('Caja invitados', 'Caja separada para movimientos de invitados o personas externas.', FALSE)
ON CONFLICT (nombre) DO NOTHING;

UPDATE cash_boxes SET principal = TRUE, activa = TRUE WHERE nombre = 'Caja normal';

CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
    caja_id INTEGER NOT NULL REFERENCES cash_boxes(id),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ingreso', 'egreso', 'cancelado')),
    fecha DATE NOT NULL,
    folio VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    cantidad NUMERIC(12, 2) NOT NULL CHECK (cantidad > 0),
    moneda VARCHAR(20) NOT NULL CHECK (moneda IN ('Pesos', 'Dólares', 'Dolares')),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movement_edits (
    id SERIAL PRIMARY KEY,
    movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    tipo_anterior VARCHAR(20),
    tipo_nuevo VARCHAR(20),
    fecha_anterior DATE,
    fecha_nueva DATE,
    folio_anterior VARCHAR(30),
    folio_nuevo VARCHAR(30),
    nombre_anterior VARCHAR(150),
    nombre_nuevo VARCHAR(150),
    descripcion_anterior TEXT,
    descripcion_nueva TEXT,
    cantidad_anterior NUMERIC(12, 2) NOT NULL CHECK (cantidad_anterior > 0),
    moneda_anterior VARCHAR(20) NOT NULL CHECK (moneda_anterior IN ('Pesos', 'Dólares', 'Dolares')),
    cantidad_nueva NUMERIC(12, 2) NOT NULL CHECK (cantidad_nueva > 0),
    moneda_nueva VARCHAR(20) NOT NULL CHECK (moneda_nueva IN ('Pesos', 'Dólares', 'Dolares')),
    edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comentario VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_movements_fecha ON movements(fecha);
CREATE INDEX IF NOT EXISTS idx_movements_tipo ON movements(tipo);
CREATE INDEX IF NOT EXISTS idx_movements_folio ON movements(folio);
CREATE INDEX IF NOT EXISTS idx_movements_caja_id ON movements(caja_id);
CREATE INDEX IF NOT EXISTS idx_movement_edits_movement_id ON movement_edits(movement_id);
CREATE INDEX IF NOT EXISTS idx_movement_edits_edited_at ON movement_edits(edited_at);
CREATE INDEX IF NOT EXISTS idx_movement_edits_edited_by ON movement_edits(edited_by);

CREATE TABLE IF NOT EXISTS balance_sessions (
    id SERIAL PRIMARY KEY,
    caja_id INTEGER NOT NULL REFERENCES cash_boxes(id),
    fecha DATE NOT NULL,
    moneda VARCHAR(20) NOT NULL CHECK (moneda IN ('Pesos', 'Dólares', 'Dolares')),
    saldo_sistema NUMERIC(14, 2) NOT NULL,
    total_contado NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_contado >= 0),
    diferencia NUMERIC(14, 2) NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'faltante', 'sobrante', 'cuadrada')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS balance_denominations (
    id SERIAL PRIMARY KEY,
    balance_id INTEGER NOT NULL REFERENCES balance_sessions(id) ON DELETE CASCADE,
    denominacion NUMERIC(12, 2) NOT NULL CHECK (denominacion > 0),
    cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
    subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    UNIQUE (balance_id, denominacion)
);

CREATE TABLE IF NOT EXISTS balance_checked_movements (
    id SERIAL PRIMARY KEY,
    balance_id INTEGER NOT NULL REFERENCES balance_sessions(id) ON DELETE CASCADE,
    movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (balance_id, movement_id)
);

CREATE INDEX IF NOT EXISTS idx_balance_sessions_caja_fecha ON balance_sessions(caja_id, fecha);
CREATE INDEX IF NOT EXISTS idx_balance_sessions_created_at ON balance_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_balance_denominations_balance_id ON balance_denominations(balance_id);
CREATE INDEX IF NOT EXISTS idx_balance_checked_movements_balance_id ON balance_checked_movements(balance_id);
CREATE INDEX IF NOT EXISTS idx_balance_checked_movements_movement_id ON balance_checked_movements(movement_id);
