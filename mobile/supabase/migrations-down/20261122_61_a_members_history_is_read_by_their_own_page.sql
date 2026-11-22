-- Undo of 20261122_61: a member's history before the Tribunal as production holds it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as production holds it
CREATE OR REPLACE FUNCTION public.get_moderation_history_for_users(p_user_ids uuid[], p_per_user integer DEFAULT 5) RETURNS TABLE(id uuid, report_id uuid, target_user_id uuid, admin_id uuid, action text, reason text, duration_hours integer, expires_at timestamp with time zone, created_at timestamp with time zone, lifted_at timestamp with time zone, appeal_status text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT r.id, r.report_id, r.target_user_id, r.admin_id, r.action, r.reason,
         r.duration_hours, r.expires_at, r.created_at, r.lifted_at, r.appeal_status
  FROM (
    SELECT m.*,
           ROW_NUMBER() OVER (PARTITION BY m.target_user_id ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM public.mod_actions m
    WHERE m.target_user_id = ANY(COALESCE(p_user_ids, ARRAY[]::uuid[]))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
      )
  ) r
  WHERE r.rn <= LEAST(GREATEST(COALESCE(p_per_user, 5), 0), 20)
  ORDER BY r.target_user_id, r.created_at DESC, r.id DESC;
$$;
