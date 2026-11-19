-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_01 — a guesser rests only their own door, and the member always has a way in.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A script naming a new address on each call guessed any member's password through the handle
--      sign-in without end: sign_in_attempt counts each attempt per door (five wrong a day, then a
--      rest doubling from a minute to an hour) and in a room every unknown door shares (20, one more
--      every 5 minutes); a phone the right password signed in on before is never held by the room
--      (sign_in_cleared); an attempt nobody could answer is given back (sign_in_unasked) (review
--      round 14).
--   Functions for the service role alone; no table is locked. The tables are 20261120_00's.
--   sign-in-with-username is deployed after this car: before it, sign_in_attempt is not there.
-- Undo: mobile/supabase/migrations-down/20261120_01_a_guesser_rests_only_their_own_door.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A1 · a guesser rests only their own door; the member always has a way in (review round 14) ──
--   The handle sign-in (sign-in-with-username) held guesses only by the caller's address, the first
--   entry of X-Forwarded-For, which the caller writes: a script naming a new address on each call
--   guessed any member's password without end. The function now reads the address the platform
--   vouches for (_shared/callerAddress.js; IPv6 by its /64) and asks the house, which counts each
--   attempt on a member's handle in two ways (the tables are H-A1.table's):
--   1. Per door (the vouched address): five wrong passwords a day, then a rest after each, a minute
--      doubling to an hour. Attempts while a door rests are refused uncounted. A guesser rests only
--      their own door: the member, from any other door, is not held by it.
--   2. Per member, a pail every door shares that is not known to them: 20 attempts at once, one more
--      every 5 minutes (at most some 300 guesses a day at one member, however many doors a botnet
--      holds). A phone the member's right password signed in on before holds a key (sign_in_cleared
--      hands it; only its hash is kept) and is never held by the pail: the member's own phone is let
--      try whatever the doors elsewhere have spent. With no vouched address (the platform not
--      saying), the pail alone holds, never one shared pace for every caller.
--   Keeping the pail empty costs an attacker some 300 attempts a day at each member, from doors not
--   yet rested; the member still signs in from a phone that signed in before, and always by their
--   email address at Auth's own door, which this never rests. Each is said truly on the phone.
--   An attempt the house or Auth could not answer (503) is given back (sign_in_unasked): it never
--   counts. A handle no member holds is counted nowhere and leaves no row (handles are public; a rest
--   on an unknown one would protect no one), so no string a caller makes up grows a table.
--   All three are the service role's alone (the function's own key).

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by the sign-in function alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.sign_in_attempt(text, text, text);
CREATE FUNCTION public.sign_in_attempt(p_handle text, p_door text, p_device text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid    uuid;
  v_door   text := NULLIF(left(coalesce(p_door, ''), 64), '');
  v_known  boolean := false;
  v_row    public.sign_in_doors;
  v_pail   public.sign_in_handles;
  v_tokens real;
  v_free   constant integer := 5;     -- wrong passwords a door may try in a day before it rests
  v_cap    constant real := 20;       -- the shared pail: attempts at once
  v_every  constant integer := 300;   -- and one more every 300 seconds
BEGIN
  -- The member the handle names, as get_email_by_username finds them; none, nothing is counted.
  SELECT p.id INTO v_uid
    FROM public.profiles p JOIN auth.users au ON au.id = p.id
   WHERE lower(p.username) = lower(coalesce(p_handle, ''))
   LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('wait', 0, 'door', false, 'pail', false);
  END IF;

  -- Rows long quiet are let go, a few at a time, never waiting on one an attempt holds.
  DELETE FROM public.sign_in_doors
   WHERE (user_id, door) IN (SELECT d.user_id, d.door FROM public.sign_in_doors d
                              WHERE d.last_at < now() - interval '1 day'
                              ORDER BY d.last_at LIMIT 20 FOR UPDATE SKIP LOCKED);
  DELETE FROM public.sign_in_devices
   WHERE token_hash IN (SELECT v.token_hash FROM public.sign_in_devices v
                         WHERE v.used_at < now() - interval '90 days'
                         ORDER BY v.used_at LIMIT 20 FOR UPDATE SKIP LOCKED);

  -- A phone the member's right password signed in on before: not held by the shared pail.
  IF p_device IS NOT NULL AND char_length(p_device) BETWEEN 32 AND 128 THEN
    v_known := EXISTS (SELECT 1 FROM public.sign_in_devices
                        WHERE token_hash = sha256(convert_to(p_device, 'UTF8')) AND user_id = v_uid
                          AND used_at >= now() - interval '90 days');
  END IF;

  -- 1. The door: resting, refused uncounted.
  IF v_door IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sign_in_doors WHERE user_id = v_uid AND door = v_door)
       AND (SELECT count(*) FROM public.sign_in_doors WHERE user_id = v_uid) >= 64 THEN
      -- At most 64 doors per member: the least recent is let go.
      DELETE FROM public.sign_in_doors
       WHERE (user_id, door) IN (SELECT d.user_id, d.door FROM public.sign_in_doors d WHERE d.user_id = v_uid
                                  ORDER BY d.last_at LIMIT 1);
    END IF;
    INSERT INTO public.sign_in_doors (user_id, door, misses, last_at) VALUES (v_uid, v_door, 0, now())
    ON CONFLICT (user_id, door) DO NOTHING;
    SELECT * INTO v_row FROM public.sign_in_doors WHERE user_id = v_uid AND door = v_door FOR UPDATE;
    IF v_row.paused_until IS NOT NULL AND v_row.paused_until > now() THEN
      RETURN jsonb_build_object('wait', GREATEST(1, ceil(extract(epoch FROM v_row.paused_until - now()))::integer),
                                'from', 'here', 'door', false, 'pail', false);
    END IF;
    IF v_row.last_at < now() - interval '1 day' THEN
      v_row.misses := 0;  -- a day with no attempt from this door: its count starts again
    END IF;
  END IF;

  -- 2. The pail every door not known to the member shares: empty, refused uncounted.
  IF NOT v_known THEN
    INSERT INTO public.sign_in_handles (user_id, tokens, refilled_at) VALUES (v_uid, v_cap, now())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_pail FROM public.sign_in_handles WHERE user_id = v_uid FOR UPDATE;
    v_tokens := LEAST(v_cap, v_pail.tokens + extract(epoch FROM now() - v_pail.refilled_at)::real / v_every);
    IF v_tokens < 1 THEN
      UPDATE public.sign_in_handles SET tokens = v_tokens, refilled_at = now() WHERE user_id = v_uid;
      RETURN jsonb_build_object('wait', GREATEST(1, ceil((1 - v_tokens) * v_every))::integer,
                                'from', 'elsewhere', 'door', false, 'pail', false);
    END IF;
    UPDATE public.sign_in_handles SET tokens = v_tokens - 1, refilled_at = now() WHERE user_id = v_uid;
  END IF;

  -- Counted at the door: from the fifth on, each rests it after, 1, 2, 4 ... 60 minutes.
  IF v_door IS NOT NULL THEN
    UPDATE public.sign_in_doors
       SET misses = v_row.misses + 1,
           last_at = now(),
           paused_until = CASE WHEN v_row.misses + 1 >= v_free
                               THEN now() + make_interval(mins => LEAST(60, power(2, LEAST(v_row.misses + 1 - v_free, 6))::integer))
                               ELSE NULL END
     WHERE user_id = v_uid AND door = v_door;
  END IF;
  RETURN jsonb_build_object('wait', 0, 'door', v_door IS NOT NULL, 'pail', NOT v_known);
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the sign-in function alone with the service role's key (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.sign_in_attempt(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_in_attempt(text, text, text) TO service_role;
COMMENT ON FUNCTION public.sign_in_attempt(text, text, text) IS 'Counts one sign-in attempt on a member''s handle, per door (5 a day, then rests of 1 to 60 minutes) and in the pail every unknown door shares (20, one more every 5 minutes; a phone holding its key is not held by it). Answers {wait, from: here|elsewhere, door, pail}: what was counted, to give back if the house could not answer. Nothing for a handle no one holds. The service role''s alone.';

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by the sign-in function alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.sign_in_unasked(text, text, boolean);
CREATE FUNCTION public.sign_in_unasked(p_handle text, p_door text, p_pail boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid;
BEGIN
  -- An attempt the house or Auth could not answer: what it counted is given back, and any rest it
  -- earned with it (a rest earned before it had already ended, or the attempt would not have run).
  SELECT p.id INTO v_uid
    FROM public.profiles p JOIN auth.users au ON au.id = p.id
   WHERE lower(p.username) = lower(coalesce(p_handle, ''))
   LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF NULLIF(p_door, '') IS NOT NULL THEN
    UPDATE public.sign_in_doors SET misses = GREATEST(0, misses - 1), paused_until = NULL
     WHERE user_id = v_uid AND door = left(p_door, 64);
  END IF;
  IF coalesce(p_pail, false) THEN
    UPDATE public.sign_in_handles SET tokens = LEAST(20, tokens + 1) WHERE user_id = v_uid;
  END IF;
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the sign-in function alone with the service role's key (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.sign_in_unasked(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_in_unasked(text, text, boolean) TO service_role;
COMMENT ON FUNCTION public.sign_in_unasked(text, text, boolean) IS 'Gives back what sign_in_attempt counted for an attempt the house or Auth could not answer, and the rest it earned. The service role''s alone.';

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by the sign-in function alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.sign_in_cleared(text, text, boolean, text);
CREATE FUNCTION public.sign_in_cleared(p_handle text, p_door text, p_pail boolean, p_device text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid  uuid;
  v_key  text;
  v_hash bytea;
BEGIN
  -- The right password: this door's count goes, the member's own attempt is given back to the pail,
  -- and the phone is handed its key (the one it holds, if it is still theirs, or a new one).
  SELECT p.id INTO v_uid
    FROM public.profiles p JOIN auth.users au ON au.id = p.id
   WHERE lower(p.username) = lower(coalesce(p_handle, ''))
   LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  IF NULLIF(p_door, '') IS NOT NULL THEN
    DELETE FROM public.sign_in_doors WHERE user_id = v_uid AND door = left(p_door, 64);
  END IF;
  IF coalesce(p_pail, false) THEN
    UPDATE public.sign_in_handles SET tokens = LEAST(20, tokens + 1) WHERE user_id = v_uid;
  END IF;

  IF p_device IS NOT NULL AND char_length(p_device) BETWEEN 32 AND 128 THEN
    v_hash := sha256(convert_to(p_device, 'UTF8'));
    UPDATE public.sign_in_devices SET used_at = now() WHERE token_hash = v_hash AND user_id = v_uid;
    IF FOUND THEN
      RETURN p_device;
    END IF;
  END IF;
  -- 244 random bits (two version-4 ids), kept only as its hash.
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.sign_in_devices (token_hash, user_id, made_at, used_at)
  VALUES (sha256(convert_to(v_key, 'UTF8')), v_uid, now(), now());
  -- Ten phones per member at most: the least recently used is let go.
  DELETE FROM public.sign_in_devices
   WHERE user_id = v_uid
     AND token_hash NOT IN (SELECT v.token_hash FROM public.sign_in_devices v WHERE v.user_id = v_uid
                             ORDER BY v.used_at DESC LIMIT 10);
  RETURN v_key;
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the sign-in function alone with the service role's key (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.sign_in_cleared(text, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_in_cleared(text, text, boolean, text) TO service_role;
COMMENT ON FUNCTION public.sign_in_cleared(text, text, boolean, text) IS 'After the right password: lets the door''s count go, gives the attempt back to the pail, and answers the phone''s key (its own, still the member''s, or a new one; only hashes kept, ten per member). The service role''s alone.';
