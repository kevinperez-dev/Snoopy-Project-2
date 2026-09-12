-- Migracion para separar los movimientos por caja sin mezclar saldos.

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

ALTER TABLE movements ADD COLUMN IF NOT EXISTS caja_id INTEGER;

UPDATE movements
SET caja_id = (SELECT id FROM cash_boxes WHERE nombre = 'Caja normal')
WHERE caja_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'movements_caja_id_fkey'
    ) THEN
        ALTER TABLE movements
            ADD CONSTRAINT movements_caja_id_fkey
            FOREIGN KEY (caja_id) REFERENCES cash_boxes(id);
    END IF;
END $$;

ALTER TABLE movements ALTER COLUMN caja_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movements_caja_id ON movements(caja_id);
