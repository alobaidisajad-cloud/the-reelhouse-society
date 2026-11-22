-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_61 — a member's history before the Tribunal is read as their own page, never every verdict.
-- ════════════════════════════════════════════════════════════════════════════
--   get_moderation_history_for_users answered the moderator's page of reports with each member's newest
--   verdicts, but ranked every verdict of the members asked for by a window over them all, and the
--   planner read every verdict the house holds to find them (a sequential scan of mod_actions: 8,044 rows
--   for twenty members at 100,000 members, load 45042605575; it grows with the house's whole record).
--   Now each member asked for is read alone, newest first, from the front of their own index
--   (idx_mod_actions_target: the member, then the moment), and the read stops at their page: at most
--   twenty a member (five unless asked), at any size of house. The same verdicts in the same order: each
--   member once however often named, the newest first, a tie in the moment by the id.
--   One function replaced; no table is locked; no column or index is added, so no statistics change.
-- Undo: mobile/supabase/migrations-down/20261122_61_a_members_history_is_read_by_their_own_page.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the same verdicts in the same order for every page asked (the rehearsal replays members named twice, a member with none, a null, and every page size from none to past twenty, as a moderator and as a member, against the old reading); TestFlight build 41 and the website read the same columns
CREATE OR REPLACE FUNCTION public.get_moderation_history_for_users(p_user_ids uuid[], p_per_user integer DEFAULT 5) RETURNS TABLE(id uuid, report_id uuid, target_user_id uuid, admin_id uuid, action text, reason text, duration_hours integer, expires_at timestamp with time zone, created_at timestamp with time zone, lifted_at timestamp with time zone, appeal_status text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Each member named once, then read alone: their newest verdicts from the front of
  -- idx_mod_actions_target, to their page and no further.
  SELECT m.id, m.report_id, m.target_user_id, m.admin_id, m.action, m.reason,
         m.duration_hours, m.expires_at, m.created_at, m.lifted_at, m.appeal_status
    FROM (SELECT DISTINCT u FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) u WHERE u IS NOT NULL) who
   CROSS JOIN LATERAL (
     SELECT a.id, a.report_id, a.target_user_id, a.admin_id, a.action, a.reason,
            a.duration_hours, a.expires_at, a.created_at, a.lifted_at, a.appeal_status
       FROM public.mod_actions a
      WHERE a.target_user_id = who.u
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT LEAST(GREATEST(COALESCE(p_per_user, 5), 0), 20)
   ) m
   WHERE EXISTS (
     SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
   )
   ORDER BY m.target_user_id, m.created_at DESC, m.id DESC;
$$;
