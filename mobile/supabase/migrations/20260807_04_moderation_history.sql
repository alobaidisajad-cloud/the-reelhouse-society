-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 20 · PART 4 — the Tribunal's enforcement records, in one query
-- ════════════════════════════════════════════════════════════════════════════
-- WHY NOT A PLAIN `IN (...)`. The naive batch has two failure modes, both found
-- by testing the idea rather than the code:
--   1. one prolific offender's records fill any overall limit and the other
--      nineteen members render EMPTY — worse than the per-card queries it
--      replaces.
--   2. the docket appends pages, so a batch keyed to page one leaves every later
--      card blank.
-- Ranking WITHIN each member fixes (1) outright; the client re-runs this with the
-- accumulated id set, which fixes (2).
--
-- SECURITY INVOKER, deliberately: `mod_actions` is already protected by row
-- security for admins. Running as the caller means this function cannot become a
-- way to read the audit log — the worst it can do is return less.
CREATE OR REPLACE FUNCTION public.get_moderation_history_for_users(
  p_user_ids uuid[],
  p_per_user integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  report_id uuid,
  target_user_id uuid,
  admin_id uuid,
  action text,
  reason text,
  duration_hours integer,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT r.id, r.report_id, r.target_user_id, r.admin_id, r.action, r.reason,
         r.duration_hours, r.expires_at, r.created_at
  FROM (
    SELECT m.*,
           ROW_NUMBER() OVER (PARTITION BY m.target_user_id ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM public.mod_actions m
    WHERE m.target_user_id = ANY(COALESCE(p_user_ids, ARRAY[]::uuid[]))
  ) r
  -- Clamped: this is callable by any signed-in role, and an unbounded per-user
  -- count would hand back the whole audit log for those members.
  WHERE r.rn <= LEAST(GREATEST(COALESCE(p_per_user, 5), 0), 20)
  ORDER BY r.target_user_id, r.created_at DESC, r.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) TO authenticated';
  END IF;
END $$;
