-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_06 — a stack's certifications are counted only for a reader who may read the stack.
-- ════════════════════════════════════════════════════════════════════════════
--   list_certify_count and list_certify_counts answer a stack's certifications, counted past the
--   interactions' rule (a sealed member's certification is counted for all), and gated on the stack:
--   counted for anyone while the stack was open and not withheld. The kinds pass (stage C, kind 5: a
--   reader's protection kept per surface) called every function across a block and found the gate
--   was not the stack's own read rule: the stack of a member the reader blocked, or of one who
--   blocked the reader, and an open stack of a private member the reader does not follow, all hidden
--   from the reader by the lists' rules, still had their counts answered.
--   Now each count is given only where the reader may read the stack, by the lists' own rules: their
--   own stack, or an open, unwithheld stack of a member whose record they may read and who is not
--   hidden from them (private.hidden_authors, asked once a read). Any other stack answers 0, as a
--   private one did. Every count a reader may read is as before.
-- Undo: mobile/supabase/migrations-down/20261122_06_a_stacks_count_is_read_as_its_stack_is.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- As 20261120_32 left it, the stack read as its rules read it.
-- add-only (3): it only fixes: every count a reader may read as before; a stack its reader may not read (hidden by a block, or a private member's) answers 0, as a private stack did (TestFlight build 41 shows the stack's count only on a stack it could read; replayed in the rehearsal as the members themselves)
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
        AND (l.user_id = (SELECT auth.uid())
             OR (l.is_private = false AND l.withheld_at IS NULL
                 AND NOT COALESCE(l.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
                 AND private.can_view_user_data(l.user_id)))
    );
$$;

-- As 20261120_32 left it, each stack read as its rules read it.
-- add-only (3): it only fixes: every count a reader may read as before; a stack its reader may not read (hidden by a block, or a private member's) answers 0, as a private stack did (TestFlight build 41 shows the stack's count only on a stack it could read; replayed in the rehearsal as the members themselves)
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
          AND (l.user_id = (SELECT auth.uid())
               OR (l.is_private = false AND l.withheld_at IS NULL
                   AND NOT COALESCE(l.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
                   AND private.can_view_user_data(l.user_id)))
      )
  )
  FROM unnest(p_list_ids) AS t(id);
$$;
