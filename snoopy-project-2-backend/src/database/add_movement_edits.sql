-- ============================================================
-- SCRIPT SNOOPY PROJECT 2: historial de ajustes
-- Propósito:
-- 1. Permitir tipo = ingreso, egreso y cancelado.
-- 2. Eliminar estatus si existe, usando solo movements.tipo.
-- 3. Permitir Pesos, Dólares y Dolares.
-- 4. Crear/actualizar movement_edits para guardar historial de ediciones.
-- ============================================================

-- Propósito: cerrar una transacción fallida previa en pgAdmin, si quedó bloqueada.
ROLLBACK;

-- ============================================================
-- 1. Eliminar restricciones CHECK viejas relacionadas con tipo
-- ============================================================
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.movements'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%tipo%'
    LOOP
        EXECUTE format('ALTER TABLE public.movements DROP CONSTRAINT %I', constraint_record.conname);
    END LOOP;
END $$;

-- Propósito: si existe estatus, migrar cancelados hacia movements.tipo.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'movements'
          AND column_name = 'estatus'
    ) THEN
        UPDATE public.movements
        SET tipo = 'cancelado'
        WHERE LOWER(TRIM(estatus)) IN ('cancelado', 'cancelada', 'cancelled', 'canceled');
    END IF;
END $$;

-- Propósito: normalizar variantes existentes de tipo.
UPDATE public.movements SET tipo = LOWER(TRIM(tipo));
UPDATE public.movements SET tipo = 'ingreso' WHERE tipo IN ('ingresos', 'income');
UPDATE public.movements SET tipo = 'egreso' WHERE tipo IN ('egresos', 'expense', 'expenses', 'gasto', 'gastos');
UPDATE public.movements SET tipo = 'cancelado' WHERE tipo IN ('cancelada', 'cancelled', 'canceled');

-- Propósito: detener si todavía queda algún valor inválido en tipo.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.movements
        WHERE tipo NOT IN ('ingreso', 'egreso', 'cancelado')
    ) THEN
        RAISE EXCEPTION 'Existen valores inválidos en movements.tipo. Revisa con: SELECT DISTINCT tipo FROM public.movements;';
    END IF;
END $$;

-- Propósito: crear la nueva regla permitida para tipo.
ALTER TABLE public.movements
ADD CONSTRAINT movements_tipo_check
CHECK (tipo IN ('ingreso', 'egreso', 'cancelado'));

-- ============================================================
-- 2. Corregir restricciones CHECK viejas relacionadas con moneda
-- ============================================================
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.movements'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%moneda%'
    LOOP
        EXECUTE format('ALTER TABLE public.movements DROP CONSTRAINT %I', constraint_record.conname);
    END LOOP;
END $$;

-- Propósito: normalizar variantes comunes de moneda sin afectar registros válidos.
UPDATE public.movements SET moneda = 'Pesos' WHERE moneda IN ('pesos', 'PESOS', 'MXN', 'mxn');
UPDATE public.movements SET moneda = 'Dolares' WHERE moneda IN ('dolares', 'DOLARES', 'USD', 'usd');
UPDATE public.movements SET moneda = 'Dólares' WHERE moneda IN ('dólares', 'DÓLARES');

ALTER TABLE public.movements
ADD CONSTRAINT movements_moneda_check
CHECK (moneda IN ('Pesos', 'Dólares', 'Dolares'));

-- ============================================================
-- 3. Eliminar columna estatus si existe
-- ============================================================
ALTER TABLE public.movements
DROP COLUMN IF EXISTS estatus;

-- ============================================================
-- 4. Crear tabla de historial de ajustes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movement_edits (
    id SERIAL PRIMARY KEY,
    movement_id INTEGER NOT NULL REFERENCES public.movements(id) ON DELETE CASCADE,
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
    cantidad_anterior NUMERIC(12, 2) NOT NULL,
    moneda_anterior VARCHAR(20) NOT NULL,
    cantidad_nueva NUMERIC(12, 2) NOT NULL,
    moneda_nueva VARCHAR(20) NOT NULL,
    edited_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comentario VARCHAR(255)
);

-- Propósito: agregar columnas nuevas si la tabla ya existía con la versión anterior.
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS tipo_anterior VARCHAR(20);
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS tipo_nuevo VARCHAR(20);
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS fecha_anterior DATE;
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS fecha_nueva DATE;
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS folio_anterior VARCHAR(30);
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS folio_nuevo VARCHAR(30);
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS nombre_anterior VARCHAR(150);
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS nombre_nuevo VARCHAR(150);
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS descripcion_anterior TEXT;
ALTER TABLE public.movement_edits ADD COLUMN IF NOT EXISTS descripcion_nueva TEXT;

-- Propósito: eliminar restricciones anteriores de movement_edits para recrearlas seguras.
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.movement_edits'::regclass
          AND contype = 'c'
    LOOP
        EXECUTE format('ALTER TABLE public.movement_edits DROP CONSTRAINT %I', constraint_record.conname);
    END LOOP;
END $$;

ALTER TABLE public.movement_edits
ADD CONSTRAINT movement_edits_moneda_anterior_check
CHECK (moneda_anterior IN ('Pesos', 'Dólares', 'Dolares'));

ALTER TABLE public.movement_edits
ADD CONSTRAINT movement_edits_moneda_nueva_check
CHECK (moneda_nueva IN ('Pesos', 'Dólares', 'Dolares'));

ALTER TABLE public.movement_edits
ADD CONSTRAINT movement_edits_cantidad_anterior_check
CHECK (cantidad_anterior > 0);

ALTER TABLE public.movement_edits
ADD CONSTRAINT movement_edits_cantidad_nueva_check
CHECK (cantidad_nueva > 0);

ALTER TABLE public.movement_edits
ADD CONSTRAINT movement_edits_tipo_anterior_check
CHECK (tipo_anterior IS NULL OR tipo_anterior IN ('ingreso', 'egreso', 'cancelado'));

ALTER TABLE public.movement_edits
ADD CONSTRAINT movement_edits_tipo_nuevo_check
CHECK (tipo_nuevo IS NULL OR tipo_nuevo IN ('ingreso', 'egreso', 'cancelado'));

-- ============================================================
-- 5. Índices útiles
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_movements_tipo ON public.movements(tipo);
CREATE INDEX IF NOT EXISTS idx_movements_fecha ON public.movements(fecha);
CREATE INDEX IF NOT EXISTS idx_movements_folio ON public.movements(folio);
CREATE INDEX IF NOT EXISTS idx_movement_edits_movement_id ON public.movement_edits(movement_id);
CREATE INDEX IF NOT EXISTS idx_movement_edits_edited_at ON public.movement_edits(edited_at);
CREATE INDEX IF NOT EXISTS idx_movement_edits_edited_by ON public.movement_edits(edited_by);

-- ============================================================
-- 6. Verificación final
-- ============================================================
SELECT tipo, COUNT(*) AS total
FROM public.movements
GROUP BY tipo
ORDER BY tipo;

SELECT moneda, COUNT(*) AS total
FROM public.movements
GROUP BY moneda
ORDER BY moneda;

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'movement_edits'
ORDER BY ordinal_position;
