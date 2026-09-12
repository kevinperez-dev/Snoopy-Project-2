-- Propósito: crear tablas para registrar balanzas sin modificar movimientos ni saldos.

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
