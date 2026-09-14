-- Migración para identificar los folios según la caja que los genera.
-- Ejemplos: A-26091202, B-26091202.

ALTER TABLE cash_boxes
    ADD COLUMN IF NOT EXISTS clave VARCHAR(10);

ALTER TABLE cash_boxes
    ALTER COLUMN clave TYPE VARCHAR(10);

-- La caja principal conserva siempre la clave A.
UPDATE cash_boxes
SET clave = 'A'
WHERE principal = TRUE;

-- Asigna claves consecutivas a las cajas no principales que aún no tienen una.
WITH cajas_sin_clave AS (
    SELECT
        id,
        chr(65 + row_number() OVER (ORDER BY id)::integer) AS clave_nueva
    FROM cash_boxes
    WHERE principal = FALSE
      AND clave IS NULL
)
UPDATE cash_boxes cb
SET clave = csc.clave_nueva
FROM cajas_sin_clave csc
WHERE cb.id = csc.id;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cash_boxes WHERE clave IS NULL) THEN
        RAISE EXCEPTION 'No fue posible asignar una clave a todas las cajas.';
    END IF;

    IF EXISTS (
        SELECT clave
        FROM cash_boxes
        GROUP BY clave
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existen claves de caja duplicadas.';
    END IF;
END $$;

ALTER TABLE cash_boxes
    ALTER COLUMN clave SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        INNER JOIN pg_attribute attribute_record
            ON attribute_record.attrelid = constraint_record.conrelid
           AND attribute_record.attnum = ANY(constraint_record.conkey)
        WHERE constraint_record.conrelid = 'cash_boxes'::regclass
          AND constraint_record.contype = 'u'
          AND array_length(constraint_record.conkey, 1) = 1
          AND attribute_record.attname = 'clave'
    ) THEN
        ALTER TABLE cash_boxes
            ADD CONSTRAINT cash_boxes_clave_unique UNIQUE (clave);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'cash_boxes'::regclass
          AND conname = 'cash_boxes_clave_format_check'
    ) THEN
        ALTER TABLE cash_boxes
            ADD CONSTRAINT cash_boxes_clave_format_check
            CHECK (clave ~ '^[A-Z]+$');
    END IF;
END $$;

-- Los registros históricos se actualizan usando la caja a la que ya pertenecen.
UPDATE movements m
SET folio = cb.clave || '-' || m.folio
FROM cash_boxes cb
WHERE cb.id = m.caja_id
  AND m.folio ~ '^[0-9]{8}$';

-- Mantiene consistentes los folios guardados en el historial de ediciones.
UPDATE movement_edits me
SET
    folio_anterior = CASE
        WHEN me.folio_anterior ~ '^[0-9]{8}$'
            THEN cb.clave || '-' || me.folio_anterior
        ELSE me.folio_anterior
    END,
    folio_nuevo = CASE
        WHEN me.folio_nuevo ~ '^[0-9]{8}$'
            THEN cb.clave || '-' || me.folio_nuevo
        ELSE me.folio_nuevo
    END
FROM movements m
INNER JOIN cash_boxes cb ON cb.id = m.caja_id
WHERE me.movement_id = m.id;
