-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_12 — a session ended takes its phone's pushes with it.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A phone signed out elsewhere kept showing its member's notices: register_push_token keeps the
--      session (20261119_01's column), notify-push reads tokens through push_tokens_of alone, which keeps
--      only those whose session stands, "Sign out of every other device" takes the other phones'
--      tokens (forget_other_devices), and a phone forgets its own by the token (forget_push_token)
--      (review round 13).
--   Functions only. notify-push is deployed after this car: before it, push_tokens_of is not there. The
--   tokens are found by their member through the index of 20261119_02.
-- Undo: mobile/supabase/migrations-down/20261119_12_a_session_ended_takes_its_pushes.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B1 · a session ended takes its phone's pushes with it (review round 13) ──
--   A member who pressed "Sign out of every other device" (or whose session ended any other way than
--   by their own SIGN OUT on that phone: a refresh refused, a session gone when the app opened) left
--   that phone's push token standing, and the phone, no longer signed in as them, kept showing their
--   notices on its lock screen: who followed them, who critiqued their log, the private salon they were
--   admitted to. Nothing took a token when its session ended: the phone's own sign-out deleted its row
--   only while its session still stood (the row's policy is the member's own), and notify-push sent to
--   every token its member held. Now:
--   1. register_push_token keeps the session the token was registered under (the JWT's session_id,
--      B1.column), each time the phone opens the app or comes back to the front;
--   2. notify-push reads a member's tokens through push_tokens_of alone, which keeps only those whose
--      session still stands (in auth.sessions, not past its not_after) and deletes the rest. A token
--      registered before round 13 holds no session: here it is kept while its member has any session
--      at all, until its phone registers it again; B8 (a car after this one) narrows that to a session
--      that could have registered it, claimed by no other phone, for at most 30 days;
--   3. "Sign out of every other device" takes every other phone's token at once
--      (forget_other_devices), the ones with no session among them;
--   4. a phone forgets its own token by the token itself (forget_push_token), signed in or not: the
--      sign-out, a session ended elsewhere, and a launch that finds the session gone, each ask it,
--      and a phone offline asks again when the network comes back. The token is the proof: only the
--      phone holds it (an Expo token carries 22 random characters), and the member it was registered
--      to must be named with it, so a phone that has since been registered to another member is
--      never touched. One call takes at most one row (the token is UNIQUE), so it needs no throttle:
--      no call can take what its caller does not already hold.

-- As 20260929_01 made it, with the session kept beside the token.
-- add-only (3): it only fixes: a device is registered to the member signed in on it as before, and now under its session too; replayed as the members themselves (B1 rehearsal); TestFlight build 41 and the website call it with the same two arguments
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- The session this call is made under: a token is sent to only while it stands (push_tokens_of).
  v_claim   text := auth.jwt() ->> 'session_id';
  v_session uuid := CASE WHEN v_claim ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         THEN v_claim::uuid END;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The device is the token: claimed by the member signed in on it now, from
  -- whoever held it before (never two owners, never a stale one).
  INSERT INTO public.push_tokens (user_id, token, platform, session_id, updated_at)
  VALUES (auth.uid(), p_token, p_platform, v_session, now())
  ON CONFLICT (token)
  DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
                session_id = EXCLUDED.session_id, updated_at = now();

  -- A member's ten most recently seen devices; older ones go.
  DELETE FROM public.push_tokens
   WHERE user_id = auth.uid()
     AND id NOT IN (
       SELECT id FROM public.push_tokens
        WHERE user_id = auth.uid()
        ORDER BY updated_at DESC, id DESC
        LIMIT 10);
END;
$$;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by notify-push alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.push_tokens_of(uuid);
CREATE FUNCTION public.push_tokens_of(p_user uuid) RETURNS TABLE (token text)
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
-- add-only (1): no shipped client uses it: a function this piece makes, for notify-push (the service role) alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.push_tokens_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_tokens_of(uuid) TO service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.forget_other_devices(text);
CREATE FUNCTION public.forget_other_devices(p_keep_token text) RETURNS integer
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
-- add-only (1): no shipped client uses it: a function this piece makes, called by the phone after "Sign out of every other device" (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.forget_other_devices(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forget_other_devices(text) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.forget_push_token(text, uuid);
CREATE FUNCTION public.forget_push_token(p_token text, p_user uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Nothing a phone could hold: no row is looked for.
  IF p_token IS NULL OR p_user IS NULL OR char_length(p_token) NOT BETWEEN 1 AND 512 THEN
    RETURN false;
  END IF;
  -- The token, and the member it was registered to: a phone registered since to someone else keeps
  -- that member's row. At most one row (the token is UNIQUE).
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = p_user;
  RETURN true;
END $$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by a phone whose session has ended, so a visitor may call it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.forget_push_token(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forget_push_token(text, uuid) TO anon, authenticated, service_role;
