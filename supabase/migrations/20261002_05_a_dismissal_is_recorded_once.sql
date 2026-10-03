-- ════════════════════════════════════════════════════════════════════════════
-- 20261002_05 — a dismissal is recorded once, for the reports it dismissed.
-- ════════════════════════════════════════════════════════════════════════════
-- bulk_dismiss_reports dismissed only the PENDING reports it was given, but
-- wrote a mod_actions row for every id it was given: a report already resolved
-- (by another admin, or a second tap) got a second "dismiss" in the record of
-- what the Tribunal did, against a member, though nothing was done.
--
-- Now the record is written from the rows the update actually changed, and the
-- count returned is that same number. Who may call it, and what it does to a
-- pending report, are unchanged.
-- ════════════════════════════════════════════════════════════════════════════

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
