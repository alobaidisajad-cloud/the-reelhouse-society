-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_13 — a token registered before round 13 is sent to only while a session that could have registered it stands.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A token registered before round 13 names no session, and 20261119_12 sent to it while its member had any
--      session standing: a phone left signed out was pushed while the member kept another. It is sent
--      to only while a session made at or before it, and no other token's, stands, and never past 30
--      days unregistered (review round 13).
--   push_tokens_of only, as 20261119_12 made it but for that rule; no table is locked.
-- Undo: mobile/supabase/migrations-down/20261119_13_an_old_token_follows_the_session_that_made_it.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B8 · a token registered before round 13 is sent to only while a session that could have registered it stands, and never past a month unregistered (review round 13) ──
--   B1 tied each token to the session it is registered under, and push_tokens_of sends only to a
--   token whose session stands. A token registered before round 13 names no session (none was kept),
--   and B1 sent to it while its member had ANY session standing: a member who signed out on one phone
--   (its session ended elsewhere) and kept another, or kept the website open, went on being pushed on
--   the phone they left, until that phone opened the app again, which it may never do.
--   What the house can prove of such a token, with no guess:
--   1. It was registered (its updated_at) under a session of its member that stood at that moment, so
--      a session made after it cannot be the one: a session that could have registered it was made at
--      or before its updated_at.
--   2. A session lives on one device, and a device holds one token: a session another token of the
--      member is registered under (round 13's) is that other phone's, not this token's.
--   So it is sent to only while a session of its member stands that was made at or before it and is
--   no other token's. When none stands, the session that registered it has ended: the phone was signed
--   out, and the token goes. Once the phone a member kept opens the app (it registers its token at each
--   launch, and on a return to the front once its last registration is a day old, under its session;
--   "Sign out of every other device" ties it at once, B11), that session is claimed, and the token of
--   the phone they left goes at the next notice.
--   3. What no proof reaches (a session older than the token and claimed by no phone, e.g. the
--      website's, still standing): a phone in use registers its token at least once a day it is
--      opened, so a token with no session that has not been registered for 30 days is let go. The
--      only cost falls on a phone signed in but not opened for a month since its last registration
--      before round 13: it is pushed again from its next opening, which registers it under its
--      session. A token registered under a session (every registration from round 13 on) has no such
--      bound: its session decides, exactly.
--   Every other step of push_tokens_of is as B1 made it.

-- As B1 made it, with the rule for a token that names no session.
-- add-only (1): no shipped client uses it: a function round 13 makes, called by notify-push alone (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.push_tokens_of(p_user uuid) RETURNS TABLE (token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- A token whose session has ended goes: the phone is no longer signed in as this member.
  -- One registered before round 13 names no session: it goes once no session that could have
  -- registered it stands (made at or before its last registration, and no other token's), or once it
  -- has not been registered for 30 days.
  DELETE FROM public.push_tokens t
   WHERE t.user_id = p_user
     AND CASE WHEN t.session_id IS NOT NULL
              THEN NOT EXISTS (SELECT 1 FROM auth.sessions s
                                WHERE s.id = t.session_id AND s.user_id = p_user
                                  AND (s.not_after IS NULL OR s.not_after > now()))
              ELSE t.updated_at <= now() - interval '30 days'
                OR NOT EXISTS (SELECT 1 FROM auth.sessions s
                                WHERE s.user_id = p_user
                                  AND (s.not_after IS NULL OR s.not_after > now())
                                  AND s.created_at <= t.updated_at
                                  AND NOT EXISTS (SELECT 1 FROM public.push_tokens o
                                                   WHERE o.user_id = p_user AND o.id <> t.id
                                                     AND o.session_id = s.id))
         END;
  RETURN QUERY
    SELECT t.token FROM public.push_tokens t WHERE t.user_id = p_user ORDER BY t.updated_at DESC, t.id DESC;
END $$;
