-- Undo of 20261119_13: a token registered before round 13 is sent to only while a session that could have registered it stands, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B8 undone · a token with no session is sent to while its member has any session standing (as B1 made it) ──
-- add-only (1): no shipped client uses it: a function round 13 makes, called by notify-push alone (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.push_tokens_of(p_user uuid) RETURNS TABLE (token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- A token whose session has ended goes: the phone is no longer signed in as this member. One
  -- registered before round 13 names no session, and goes only when its member has none standing.
  DELETE FROM public.push_tokens t
   WHERE t.user_id = p_user
     AND CASE WHEN t.session_id IS NOT NULL
              THEN NOT EXISTS (SELECT 1 FROM auth.sessions s
                                WHERE s.id = t.session_id AND s.user_id = p_user
                                  AND (s.not_after IS NULL OR s.not_after > now()))
              ELSE NOT EXISTS (SELECT 1 FROM auth.sessions s
                                WHERE s.user_id = p_user
                                  AND (s.not_after IS NULL OR s.not_after > now()))
         END;
  RETURN QUERY
    SELECT t.token FROM public.push_tokens t WHERE t.user_id = p_user ORDER BY t.updated_at DESC, t.id DESC;
END $$;
