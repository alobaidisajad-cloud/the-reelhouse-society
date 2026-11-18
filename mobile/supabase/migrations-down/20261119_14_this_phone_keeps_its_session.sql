-- Undo of 20261119_14: signing out every other device ties this phone's token to its session, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B11 undone · this phone's row is left as it was (as B1 made it) ──
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
  -- Every other phone's token of the member: this phone keeps its own, named by the token it holds
  -- or registered under this session.
  DELETE FROM public.push_tokens
   WHERE user_id = auth.uid()
     AND token IS DISTINCT FROM p_keep_token
     AND (v_session IS NULL OR session_id IS DISTINCT FROM v_session);
  GET DIAGNOSTICS v_gone = ROW_COUNT;
  RETURN v_gone;
END $$;
