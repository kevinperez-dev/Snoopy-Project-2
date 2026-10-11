-- Normaliza instalaciones existentes antes de asignar claves y prefijos de folio.
-- Conserva la caja de invitados con historial como la única principal y retira
-- únicamente duplicados vacíos. Se puede ejecutar más de una vez sin perder registros.

BEGIN;

DO $$
DECLARE
    preferred_box_id INTEGER;
BEGIN
    SELECT cb.id
    INTO preferred_box_id
    FROM cash_boxes cb
    WHERE LOWER(cb.nombre) = LOWER('Caja invitados')
    ORDER BY
        EXISTS (SELECT 1 FROM movements m WHERE m.caja_id = cb.id) DESC,
        (SELECT COUNT(*) FROM movements m WHERE m.caja_id = cb.id) DESC,
        cb.id ASC
    LIMIT 1;

    IF preferred_box_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró una caja de invitados para establecer como principal.';
    END IF;

    UPDATE cash_boxes
    SET principal = (id = preferred_box_id)
    WHERE principal = TRUE OR id = preferred_box_id;
END $$;

-- Solo desactiva candidatos duplicados cuando ya existe una caja homónima con movimientos.
WITH duplicate_candidates AS (
    SELECT cb.id
    FROM cash_boxes cb
    WHERE NOT EXISTS (SELECT 1 FROM movements m WHERE m.caja_id = cb.id)
      AND EXISTS (
          SELECT 1
          FROM cash_boxes retained_box
          WHERE retained_box.id <> cb.id
            AND LOWER(retained_box.nombre) = LOWER(cb.nombre)
            AND EXISTS (SELECT 1 FROM movements m WHERE m.caja_id = retained_box.id)
      )
)
UPDATE cash_boxes cb
SET activa = FALSE,
    principal = FALSE
FROM duplicate_candidates dc
WHERE cb.id = dc.id;

-- Elimina solo los duplicados ya inactivos, sin movimientos ni sesiones de balanza.
DELETE FROM cash_boxes cb
WHERE cb.activa = FALSE
  AND cb.principal = FALSE
  AND NOT EXISTS (SELECT 1 FROM movements m WHERE m.caja_id = cb.id)
  AND NOT EXISTS (SELECT 1 FROM balance_sessions bs WHERE bs.caja_id = cb.id)
  AND EXISTS (
      SELECT 1
      FROM cash_boxes retained_box
      WHERE retained_box.id <> cb.id
        AND LOWER(retained_box.nombre) = LOWER(cb.nombre)
        AND EXISTS (SELECT 1 FROM movements m WHERE m.caja_id = retained_box.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS cash_boxes_single_principal_idx
    ON cash_boxes (principal)
    WHERE principal = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS cash_boxes_nombre_ci_unique
    ON cash_boxes (LOWER(nombre));

COMMIT;
