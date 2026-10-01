-- ════════════════════════════════════════════════════════════════════════════
-- 20261001_03 — a report is filed through one door, once per member per thing
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
-- The Tribunal reads its docket most-reported first (get_priority_reports
-- ranks by COUNT(*) per content), and nothing stopped one member counting
-- many times:
--   · submit_report had a rate limit and no rule against reporting the same
--     thing twice; the apps' "already reported" list lives in memory and
--     empties on every restart.
--   · Members held INSERT on the table itself (users_insert_own_reports), so a
--     direct insert skipped even the rate limit, and could set status,
--     resolved_by or resolution on its own row. The web's report button
--     wrote this way.
-- So one member could raise anything to the head of the docket, which clause V
-- of the house rules says is the opposite of how a report works.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
-- 1. One PENDING report per member per thing (a unique partial index). Once
--    it is resolved, the member may report that thing again.
-- 2. submit_report answers a second report with 23505 'Already reported',
--    which the apps say in words and the offline queue treats as written.
-- 3. The table takes no writes from a client. Every report is filed through
--    submit_report and every resolution through the Tribunal's functions, all
--    SECURITY DEFINER and owned by the table's owner.
-- With (1), COUNT(*) per content on the docket counts members, not rows.
--
-- Production held 0 reports when this was written (2026-10-01).
-- No transaction control here: the rehearsal
-- (mobile/supabase/diagnostics/a_report_is_counted_once_rehearsal.sql)
-- includes this file inside its own transaction.
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS reports_one_pending_per_member
    ON public.reports (reporter_id, content_type, content_id)
    WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text DEFAULT NULL::text, p_target_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
  v_recent_count int;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM reports
  WHERE reporter_id = v_reporter_id
    AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour';
  END IF;

  IF p_content_type = 'profile' AND v_reporter_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot report your own profile';
  END IF;

  BEGIN
    INSERT INTO reports (reporter_id, content_id, content_type, reason, details, target_user_id, status)
    VALUES (v_reporter_id, p_content_id, p_content_type, p_reason, p_details, p_target_user_id, 'pending')
    RETURNING id INTO v_report_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Already reported' USING ERRCODE = '23505';
  END;

  RETURN v_report_id;
END;
$$;

DROP POLICY IF EXISTS users_insert_own_reports ON public.reports;
DROP POLICY IF EXISTS admins_update_reports ON public.reports;
REVOKE INSERT, UPDATE, DELETE ON public.reports FROM anon, authenticated;
