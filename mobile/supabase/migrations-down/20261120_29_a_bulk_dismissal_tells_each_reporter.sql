-- Undo of 20261120_29: a bulk dismissal tells each reporter, as a single dismissal does, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B9, undone: a bulk dismissal closes and records its cases, and tells no reporter ──

-- As 20261002_05 left it.
-- add-only (3): it only fixes: the undo of H-B9, a bulk dismissal as round 4 made it (TestFlight build 41 and the website call it so)
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
    RETURNING id, target_user_id
  )
  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason)
  SELECT d.id, d.target_user_id, v_admin_id, 'dismiss', p_reason FROM dismissed d;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
