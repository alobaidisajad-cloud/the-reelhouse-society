-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_29 — a bulk dismissal tells each reporter, as a single dismissal does.
-- ════════════════════════════════════════════════════════════════════════════
--   1. BULK DISMISS closed its cases and told no reporter: each report it closes tells its reporter as
--      resolve_moderation_report_v2 does for a dismissal, and a case judged meanwhile is not closed again
--      (review round 14).
--   bulk_dismiss_reports only; no table is locked.
-- Undo: mobile/supabase/migrations-down/20261120_29_a_bulk_dismissal_tells_each_reporter.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B9 · a bulk dismissal tells each reporter, as a single dismissal does (review round 14) ──
--   A moderator who selected twelve cases on THE DOCKET and pressed BULK DISMISS closed them and recorded
--   each, and told no reporter: where DISMISS on one case sends its reporter "Your Report Was Reviewed",
--   the twelve heard nothing, and their reports sat unanswered for good. Now each report the bulk
--   dismissal closes tells its reporter the same notice, in the same words and with the same keys, as
--   resolve_moderation_report_v2 sends for a dismissal; a case judged meanwhile by another moderator is
--   not closed again and tells no one twice. The count it answers is still the cases it closed.

-- As 20261002_05 left it, each report it closes telling its reporter.
-- add-only (3): it only fixes: the cases are closed, recorded and counted as before, and each reporter is told, as the H-B9 rehearsal replays as the moderator and the members; TestFlight build 41 and the website call it as admins alone, and meet no new refusal
CREATE OR REPLACE FUNCTION public.bulk_dismiss_reports(p_report_ids uuid[], p_admin_id uuid, p_reason text DEFAULT 'Bulk dismissed'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  WITH dismissed AS (
    UPDATE reports
       SET status = 'resolved', resolved_at = now(), resolved_by = v_admin_id, resolution_action = 'dismiss'
     WHERE id = ANY(p_report_ids) AND status = 'pending'
    RETURNING id, target_user_id, reporter_id
  ), recorded AS (
    INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason)
    SELECT d.id, d.target_user_id, v_admin_id, 'dismiss', p_reason FROM dismissed d
    RETURNING report_id
  ), told AS (
    -- Each reporter told as a single dismissal tells them (resolve_moderation_report_v2).
    INSERT INTO notifications (user_id, type, title, body, message, metadata)
    SELECT d.reporter_id, 'moderation', 'Your Report Was Reviewed',
           'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
           'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
           jsonb_build_object('report_id', d.id, 'action', 'dismiss')
      FROM dismissed d
     WHERE d.reporter_id IS NOT NULL
  )
  SELECT count(*) INTO v_count FROM recorded;

  RETURN v_count;
END;
$$;
