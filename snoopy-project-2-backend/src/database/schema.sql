-- Archivo: src/database/schema.sql
-- Propósito: crear las tablas iniciales del sistema Snoopy Project 2.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_movement_edits_movement_id ON movement_edits(movement_id);
CREATE INDEX IF NOT EXISTS idx_movement_edits_edited_at ON movement_edits(edited_at);
CREATE INDEX IF NOT EXISTS idx_movement_edits_edited_by ON movement_edits(edited_by);
