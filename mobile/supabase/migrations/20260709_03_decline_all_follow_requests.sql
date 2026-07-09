-- ═══════════════════════════════════════════════════════════════════════════════
-- decline_all_follow_requests() — bulk "clear the door" for the At the Door panel
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- Powers the panel's "Decline all remaining" action. A client loop of
-- decline_follow_request() over thousands of rows would be barbaric (thousands of
-- round-trips); this does it in one statement. Deletes every pending follow_request
-- targeting the caller. The existing per-row DELETE trigger (handle_interaction_removal)
-- fires per row to clean up the matching 'follow_request' notifications, exactly as a
-- single decline would. Returns how many were cleared.
--
-- SECURITY DEFINER + pinned search_path: scoped strictly to auth.uid()'s own inbox,
-- so a caller can only ever clear requests addressed to themselves.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decline_all_follow_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.interactions
    WHERE target_user_id = auth.uid()
      AND type = 'follow_request'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_all_follow_requests() TO authenticated;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
--   SELECT public.decline_all_follow_requests();  -- returns integer count cleared
