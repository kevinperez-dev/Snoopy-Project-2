-- ============================================================
-- OPCIONAL: consolidar historial duplicado generado por versiones anteriores
-- Propósito:
-- Si una edición anterior creó varias filas en movement_edits para el mismo
-- movimiento y la misma fecha/hora exacta de edición, este script las une en
-- una sola fila.
--
-- Ejecuta primero el SELECT de revisión. Si el resultado tiene grupos que
-- sí pertenecen a una misma edición, puedes ejecutar la parte de consolidación.
-- ============================================================

ROLLBACK;

-- ============================================================
-- 1. Revisión de posibles duplicados exactos
-- ============================================================

SELECT
    movement_id,
    edited_at,
    COUNT(*) AS filas_encontradas
FROM public.movement_edits
GROUP BY movement_id, edited_at
HAVING COUNT(*) > 1
ORDER BY edited_at DESC, movement_id;

-- ============================================================
-- 2. Consolidación segura por movement_id + edited_at exacto
-- ============================================================

BEGIN;

CREATE TEMP TABLE tmp_movement_edits_duplicados AS
SELECT
    movement_id,
    edited_at
FROM public.movement_edits
GROUP BY movement_id, edited_at
HAVING COUNT(*) > 1;

CREATE TEMP TABLE tmp_movement_edits_consolidados AS
SELECT
    MIN(me.id) AS id_principal,
    me.movement_id,
    me.edited_at,
    MIN(me.edited_by) AS edited_by,

    MAX(me.tipo_anterior) AS tipo_anterior,
    MAX(me.tipo_nuevo) AS tipo_nuevo,
    MAX(me.fecha_anterior) AS fecha_anterior,
    MAX(me.fecha_nueva) AS fecha_nueva,
    MAX(me.folio_anterior) AS folio_anterior,
    MAX(me.folio_nuevo) AS folio_nuevo,
    MAX(me.nombre_anterior) AS nombre_anterior,
    MAX(me.nombre_nuevo) AS nombre_nuevo,
    MAX(me.descripcion_anterior) AS descripcion_anterior,
    MAX(me.descripcion_nueva) AS descripcion_nueva,
    MAX(me.cantidad_anterior) AS cantidad_anterior,
    MAX(me.moneda_anterior) AS moneda_anterior,
    MAX(me.cantidad_nueva) AS cantidad_nueva,
    MAX(me.moneda_nueva) AS moneda_nueva,
    STRING_AGG(DISTINCT NULLIF(TRIM(me.comentario), ''), ' | ') AS comentario
FROM public.movement_edits me
INNER JOIN tmp_movement_edits_duplicados d
    ON d.movement_id = me.movement_id
   AND d.edited_at = me.edited_at
GROUP BY me.movement_id, me.edited_at;

DELETE FROM public.movement_edits me
USING tmp_movement_edits_duplicados d
WHERE d.movement_id = me.movement_id
  AND d.edited_at = me.edited_at;

INSERT INTO public.movement_edits (
    movement_id,
    tipo_anterior,
    tipo_nuevo,
    fecha_anterior,
    fecha_nueva,
    folio_anterior,
    folio_nuevo,
    nombre_anterior,
    nombre_nuevo,
    descripcion_anterior,
    descripcion_nueva,
    cantidad_anterior,
    moneda_anterior,
    cantidad_nueva,
    moneda_nueva,
    edited_by,
    edited_at,
    comentario
)
SELECT
    movement_id,
    tipo_anterior,
    tipo_nuevo,
    fecha_anterior,
    fecha_nueva,
    folio_anterior,
    folio_nuevo,
    nombre_anterior,
    nombre_nuevo,
    descripcion_anterior,
    descripcion_nueva,
    cantidad_anterior,
    moneda_anterior,
    cantidad_nueva,
    moneda_nueva,
    edited_by,
    edited_at,
    COALESCE(NULLIF(comentario, ''), 'Edición consolidada')
FROM tmp_movement_edits_consolidados;

COMMIT;

-- ============================================================
-- 3. Verificación posterior
-- ============================================================

SELECT
    movement_id,
    edited_at,
    COUNT(*) AS filas_encontradas
FROM public.movement_edits
GROUP BY movement_id, edited_at
HAVING COUNT(*) > 1
ORDER BY edited_at DESC, movement_id;
