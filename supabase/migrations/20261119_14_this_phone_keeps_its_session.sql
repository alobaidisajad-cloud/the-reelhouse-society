-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_14 — signing out every other device ties this phone's token to its session.
-- ════════════════════════════════════════════════════════════════════════════
--   1. "Sign out of every other device" left this phone's own token untied to its session, so 20261119_13 could
--      only bound another phone's untied token by age: this phone's row is now written under the session
--      the call is made from (review round 13).
--   forget_other_devices only, as 20261119_12 made it but for that; no table is locked.
-- Undo: mobile/supabase/migrations-down/20261119_14_this_phone_keeps_its_session.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B11 · signing out every other device ties this phone's token to its session (review round 13) ──
--   "Sign out of every other device" took every other phone's token, but left this phone's own row as
--   it was: a token registered before round 13 names no session, and push_tokens_of (B8) could then
--   only bound it by age, and kept another phone's untied token alive while this phone's session (made
--   before it, claimed by no token) stood. Now this phone's row is written under the session the call
--   is made from, so it is claimed, and B8 takes every untied token no other standing session could
--   have registered. Every other step is as B1 made it.
-- As B1 made it, this phone's row tied to this session first.
-- add-only (1): no shipped client uses it: a function round 13 makes (B1), called by the phone after "Sign out of every other device" (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.forget_other_devices(p_keep_token text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_claim   text := auth.jwt() ->> 'session_id';
  v_session uuid := CASE WHEN v_claim ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         THEN v_claim::uuid END;
  v_gone    integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- This phone's own row, written under the session this call is made from: claimed, so B8 reads
  -- every untied token that session could have registered as another phone's.
  IF v_session IS NOT NULL AND p_keep_token IS NOT NULL THEN
    UPDATE public.push_tokens SET session_id = v_session
     WHERE user_id = auth.uid() AND token = p_keep_token AND session_id IS DISTINCT FROM v_session;
  END IF;
  -- Every other phone's token of the member: this phone keeps its own, named by the token it holds
  -- or registered under this session.
  DELETE FROM public.push_tokens
   WHERE user_id = auth.uid()
     AND token IS DISTINCT FROM p_keep_token
     AND (v_session IS NULL OR session_id IS DISTINCT FROM v_session);
  GET DIAGNOSTICS v_gone = ROW_COUNT;
  RETURN v_gone;
END $$;
