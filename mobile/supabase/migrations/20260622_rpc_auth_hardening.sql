-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX: RPC authorization hardening — derive identity from auth.uid()
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problem (5 SECURITY DEFINER functions trusted a CLIENT-SUPPLIED id for their
-- authorization decision instead of the JWT-verified caller, auth.uid()):
--
--   1. resolve_moderation_report_v2(p_admin_id) — any authenticated user who
--      knows ANY admin's UUID could ban/suspend/exile/warn arbitrary users and
--      resolve reports, attributed to that admin.
--   2. bulk_dismiss_reports(p_admin_id)         — same: mass-close pending reports.
--   3. submit_report(p_reporter_id)             — forge reports as any user and
--      poison that user's 10/hr rate-limit budget (SECURITY DEFINER bypasses the
--      reporter_id = auth.uid() RLS WITH CHECK).
--   4. get_priority_reports()                   — NO admin check at all: any
--      authenticated user could read the entire pending-report queue
--      (reporter_id / target_user_id disclosure).
--   5. claim_founding_seat(p_user_id)           — open EXECUTE (default PUBLIC),
--      lets any authenticated user set is_founding=true on themselves (→ 'founding'
--      tier via resolveTier → unlocks auteur-plus gated features) or any user,
--      and burn seats from the 100-cap. This one is legitimately called only by
--      the service-role Edge Function, so the fix is a grant lockdown, not auth.uid().
--
-- Fix strategy (zero client breakage, server-only deploy):
--   • Functions 1–4: derive identity from auth.uid() INSIDE the function and
--     ignore the spoofable parameter. Signatures are kept identical so the
--     deployed client, the offline-queue submit_report payloads, and existing
--     tests all keep working. (A later cleanup PR may drop the now-dead params.)
--   • Function 5: REVOKE EXECUTE FROM PUBLIC and GRANT only to service_role.
--   • All: add `SET search_path = public` (closes the SECURITY DEFINER search-path
--     vector these functions previously lacked — matches the 20260609 convention).
--   • All grants: REVOKE FROM PUBLIC (a privilege held via PUBLIC is NOT removed
--     by revoking from a specific role) then GRANT to the intended role.
--
-- auth.uid() inside SECURITY DEFINER is the established pattern in this codebase
-- (see 20260609_security_definer_hardening.sql) — SECURITY DEFINER swaps the role,
-- not the request JWT claims, so auth.uid() resolves the real caller correctly.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1. submit_report — reporter is the JWT caller, never the client parameter
-- ════════════════════════════════════════════════════════════════════════
-- p_reporter_id is RETAINED for signature compatibility (offline-queue payloads
-- and the deployed client still send it) but is IGNORED in favour of auth.uid().
CREATE OR REPLACE FUNCTION submit_report(
  p_reporter_id uuid,
  p_content_id uuid,
  p_content_type text,
  p_reason text,
  p_details text DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter_id uuid := auth.uid();   -- canonical identity, not the parameter
  v_report_id uuid;
  v_recent_count int;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limit: max 10 reports per user per hour (keyed on the real caller)
  SELECT COUNT(*) INTO v_recent_count
  FROM reports
  WHERE reporter_id = v_reporter_id
    AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour';
  END IF;

  -- Prevent self-reporting on profile content type
  IF p_content_type = 'profile' AND v_reporter_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot report your own profile';
  END IF;

  INSERT INTO reports (reporter_id, content_id, content_type, reason, details, target_user_id, status)
  VALUES (v_reporter_id, p_content_id, p_content_type, p_reason, p_details, p_target_user_id, 'pending')
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_report(uuid, uuid, text, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION submit_report(uuid, uuid, text, text, text, uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- 2. resolve_moderation_report_v2 — admin is the JWT caller, never the param
-- ════════════════════════════════════════════════════════════════════════
-- p_admin_id RETAINED for signature compatibility (client + test still send it)
-- but IGNORED in favour of auth.uid().
CREATE OR REPLACE FUNCTION resolve_moderation_report_v2(
  p_report_id uuid,
  p_action text,
  p_admin_id uuid,
  p_reason text,
  p_duration_hours int DEFAULT NULL,
  p_notify_user boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();   -- canonical identity, not the parameter
  v_target_user_id uuid;
  v_reporter_id uuid;
  v_content_id uuid;
  v_content_type text;
  v_expires_at timestamptz;
BEGIN
  -- Verify the CALLER is an admin (not merely that some passed-in id is an admin)
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  -- Fetch report details (only pending reports can be resolved)
  SELECT target_user_id, reporter_id, content_id, content_type
  INTO v_target_user_id, v_reporter_id, v_content_id, v_content_type
  FROM reports
  WHERE id = p_report_id AND status = 'pending';

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  -- Calculate expiry for time-limited actions (suspend, mute_user)
  IF p_action = 'suspend' AND p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  -- 1. Update report status to resolved
  UPDATE reports
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = v_admin_id,
      resolution_action = p_action
  WHERE id = p_report_id;

  -- 2. Execute enforcement action on target user
  CASE p_action
    WHEN 'warn' THEN
      INSERT INTO warnings (user_id, admin_id, reason)
      VALUES (v_target_user_id, v_admin_id, p_reason);
      UPDATE profiles SET warning_count = warning_count + 1
      WHERE id = v_target_user_id;

    WHEN 'suspend' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'ban' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'permanent_exile' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = 'PERMANENT EXILE: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'delete_content' THEN
      -- Content deletion is handled out-of-band; no direct profiles op here.
      NULL;

    WHEN 'mute_user' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = 'Muted: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'dismiss' THEN
      NULL;
  END CASE;

  -- 3. Insert audit log entry
  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at)
  VALUES (p_report_id, v_target_user_id, v_admin_id, p_action, p_reason, p_duration_hours, v_expires_at);

  -- 4. Create notifications (if requested)
  IF p_notify_user THEN
    INSERT INTO notifications (user_id, type, title, body, metadata)
    VALUES (
      v_reporter_id,
      'moderation',
      'Report Reviewed',
      'The Tribunal has reviewed your report. Action: ' || p_action,
      jsonb_build_object('report_id', p_report_id, 'action', p_action)
    );

    IF p_action != 'dismiss' THEN
      INSERT INTO notifications (user_id, type, title, body, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'Moderation Notice',
        'The Tribunal has taken action on your account: ' || p_action || '. Reason: ' || p_reason,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at)
      );
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_moderation_report_v2(uuid, text, uuid, text, int, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION resolve_moderation_report_v2(uuid, text, uuid, text, int, boolean) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- 3. bulk_dismiss_reports — admin is the JWT caller, never the parameter
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION bulk_dismiss_reports(
  p_report_ids uuid[],
  p_admin_id uuid,
  p_reason text DEFAULT 'Bulk dismissed'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();   -- canonical identity, not the parameter
  v_count int;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  -- Dismiss all specified pending reports
  UPDATE reports
  SET status = 'resolved', resolved_at = now(), resolved_by = v_admin_id, resolution_action = 'dismiss'
  WHERE id = ANY(p_report_ids) AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert audit log entry for each dismissed report
  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason)
  SELECT r.id, r.target_user_id, v_admin_id, 'dismiss', p_reason
  FROM reports r WHERE r.id = ANY(p_report_ids);

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION bulk_dismiss_reports(uuid[], uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bulk_dismiss_reports(uuid[], uuid, text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- 4. get_priority_reports — add the missing admin gate
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_priority_reports(
  p_limit int DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  content_id uuid,
  content_type text,
  reason text,
  details text,
  reporter_id uuid,
  target_user_id uuid,
  created_at timestamptz,
  report_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.content_id,
    r.content_type,
    r.reason,
    r.details,
    r.reporter_id,
    r.target_user_id,
    r.created_at,
    COUNT(*) OVER (PARTITION BY r.content_id) AS report_count
  FROM reports r
  WHERE r.status = 'pending'
    AND (p_cursor IS NULL OR r.created_at < p_cursor)
  ORDER BY report_count DESC, r.created_at ASC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_priority_reports(int, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_priority_reports(int, timestamptz) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- 5. claim_founding_seat — service-role only (legitimately needs p_user_id)
-- ════════════════════════════════════════════════════════════════════════
-- Called solely by the sync-entitlement Edge Function under the service-role key
-- (which has already validated the user's JWT and verified the purchase with
-- RevenueCat S2S). auth.uid() is NULL in that context, so the param is correct —
-- the fix is to make the function unreachable by client roles.
ALTER FUNCTION public.claim_founding_seat(uuid, integer) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.claim_founding_seat(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_founding_seat(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_founding_seat(uuid, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_founding_seat(uuid, integer) TO service_role;

COMMIT;
