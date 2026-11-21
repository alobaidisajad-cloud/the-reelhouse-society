-- Undo of 20261122_06: a stack's count read as its stack is, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- list_certify_count as 20261120_32 left it.
-- add-only (3): it only fixes: the undo puts back the definition 20261120_32 left, whole
CREATE OR REPLACE FUNCTION public.list_certify_count(p_list_id uuid) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT count(*)::bigint
  FROM public.interactions i
  WHERE i.target_list_id = p_list_id
    AND i.type = 'endorse_list'
    AND EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = p_list_id
        AND ((l.is_private = false AND l.withheld_at IS NULL) OR l.user_id = auth.uid())
    );
$$;

-- list_certify_counts as 20261120_32 left it.
-- add-only (3): it only fixes: the undo puts back the definition 20261120_32 left, whole
CREATE OR REPLACE FUNCTION public.list_certify_counts(p_list_ids uuid[]) RETURNS TABLE(list_id uuid, certify_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT t.id, (
    SELECT count(*)::bigint
    FROM public.interactions i
    WHERE i.target_list_id = t.id
      AND i.type = 'endorse_list'
      AND EXISTS (
        SELECT 1 FROM public.lists l
        WHERE l.id = t.id
          AND ((l.is_private = false AND l.withheld_at IS NULL) OR l.user_id = auth.uid())
      )
  )
  FROM unnest(p_list_ids) AS t(id);
$$;
