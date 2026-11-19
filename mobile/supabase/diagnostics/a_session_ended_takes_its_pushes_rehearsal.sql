-- ════════════════════════════════════════════════════════════════════════════
-- a_session_ended_takes_its_pushes_rehearsal.sql — 20261119_12. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_session_ended_takes_its_pushes_rehearsal.sql --with-train
--
-- The train applies 20261119_12 here (with_train), 20261119_00 to 20261119_11 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 13).
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 4) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE b1_m (n int PRIMARY KEY, id uuid, session uuid) ON COMMIT DROP;
GRANT SELECT ON b1_m TO anon, authenticated, service_role;
CREATE TEMP TABLE b1_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON b1_seen TO anon, authenticated, service_role;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_12 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── B1 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B1 rehearsal · a session ended takes its phone's pushes with it (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (its column car
-- applied before), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member A is one with a session standing (one of the house's, read; on a copy with none, one is laid
-- for rehearsal member 1), member B another rehearsal member. A, as themselves, registers a phone
-- under a session that has ended, and the house lays one with no session at all (a token from before
-- round 13, registered now). Then:
--   the push sender reads A's tokens: the one from before is sent to (the standing session could have
--   registered it, and no phone has claimed it: B8), the ended session's is not, and its row is gone;
--   A's phone of the standing session registers and is sent to; no member or visitor may read them so;
--   A signs out every other device: every token of A's but this phone's goes, B's stays;
--   a phone signed out (a visitor now) forgets its token by the token and its member: named with B,
--   nothing goes; named with A, it goes; a token no phone could hold looks for nothing;
--   B, with no session in the claims (an older client), still registers a phone.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE v_s uuid; v_u uuid;
BEGIN
  SELECT s.id, s.user_id INTO v_s, v_u
    FROM auth.sessions s JOIN public.profiles p ON p.id = s.user_id
   WHERE (s.not_after IS NULL OR s.not_after > now())
     -- Made before this transaction began: a session signed in meanwhile could not have registered
     -- a token laid at now() (push_tokens_of, B8, reads a token's session as made at or before it).
     AND s.created_at <= now() - interval '1 second'
   ORDER BY s.created_at DESC LIMIT 1;
  IF v_s IS NULL THEN
    -- A copy of the house with no session standing (the sealed world, a local copy): one is laid,
    -- written only here, so the house's own run never writes auth.sessions.
    v_u := (SELECT id FROM rehearsal_members WHERE n = 1);
    v_s := gen_random_uuid();
    EXECUTE format('INSERT INTO auth.sessions (id, user_id, created_at, updated_at) VALUES (%L, %L, now() - interval ''1 minute'', now() - interval ''1 minute'')', v_s, v_u);
  END IF;
  INSERT INTO b1_m VALUES (1, v_u, v_s);
  INSERT INTO b1_m SELECT 2, id, NULL FROM rehearsal_members WHERE id <> v_u ORDER BY n LIMIT 1;
END $$;
SELECT pg_temp.rh_need('a member with a session standing, and another member', (SELECT count(*) FROM b1_m), 2) AS done \gset rh_

-- One act as A or B, under the session named (null: claims with none), or as a visitor (p_member 0).
CREATE FUNCTION pg_temp.b1_as(p_member int, p_session uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  IF p_member = 0 THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
  ELSE
    PERFORM set_config('request.jwt.claims', json_strip_nulls(json_build_object(
      'sub', (SELECT id FROM b1_m WHERE n = p_member), 'role', 'authenticated', 'session_id', p_session))::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  -- A function that answers nothing (void) is done.
  RETURN coalesce(nullif(v_got, ''), 'done');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.b1_as(int, uuid, text) TO anon, authenticated;
CREATE FUNCTION pg_temp.b1_has(p_token text) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.push_tokens WHERE token = p_token;
$$;

-- A's phones, and B's one: first a phone from before round 13 and one under a session since ended.
INSERT INTO b1_seen VALUES ('A registers under a session since ended',
  pg_temp.b1_as(1, gen_random_uuid(), 'SELECT public.register_push_token(''rh-b1-ended'', ''android'')::text'));
INSERT INTO public.push_tokens (user_id, token, platform)
VALUES ((SELECT id FROM b1_m WHERE n = 1), 'rh-b1-before', 'ios');
INSERT INTO b1_seen VALUES ('B registers with no session in the claims',
  pg_temp.b1_as(2, NULL, 'SELECT public.register_push_token(''rh-b1-of-b'', ''ios'')::text'));

-- The push sender, as itself.
SET LOCAL ROLE service_role;
INSERT INTO b1_seen VALUES ('sent to',
  (SELECT string_agg(t.token, ',' ORDER BY t.token) FROM public.push_tokens_of((SELECT id FROM b1_m WHERE n = 1)) t
    WHERE t.token LIKE 'rh-b1-%'));
RESET ROLE;
-- Then the phone of the standing session registers, as it does on each opening, and is sent to.
INSERT INTO b1_seen VALUES ('A registers under the standing session',
  pg_temp.b1_as(1, (SELECT session FROM b1_m WHERE n = 1), 'SELECT public.register_push_token(''rh-b1-standing'', ''ios'')::text'));
SET LOCAL ROLE service_role;
INSERT INTO b1_seen VALUES ('sent to, registered',
  (SELECT string_agg(t.token, ',' ORDER BY t.token) FROM public.push_tokens_of((SELECT id FROM b1_m WHERE n = 1)) t
    WHERE 'rh-b1-standing' = t.token));
RESET ROLE;
INSERT INTO b1_seen VALUES ('the ended session''s row', pg_temp.b1_has('rh-b1-ended'));
INSERT INTO b1_seen VALUES ('the session kept', coalesce(
  (SELECT (session_id = (SELECT session FROM b1_m WHERE n = 1))::text FROM public.push_tokens WHERE 'rh-b1-standing' = token), 'missing'));
INSERT INTO b1_seen VALUES ('a member reads the tokens so',
  pg_temp.b1_as(1, (SELECT session FROM b1_m WHERE n = 1), format('SELECT count(*)::text FROM public.push_tokens_of(%L)', (SELECT id FROM b1_m WHERE n = 1))));
INSERT INTO b1_seen VALUES ('a visitor reads the tokens so',
  pg_temp.b1_as(0, NULL, format('SELECT count(*)::text FROM public.push_tokens_of(%L)', (SELECT id FROM b1_m WHERE n = 1))));

-- A, on the phone of the standing session, signs out every other device: this phone's token is kept.
INSERT INTO public.push_tokens (user_id, token, platform)
VALUES ((SELECT id FROM b1_m WHERE n = 1), 'rh-b1-another', 'android');
INSERT INTO b1_seen VALUES ('every other device forgotten',
  pg_temp.b1_as(1, (SELECT session FROM b1_m WHERE n = 1), 'SELECT public.forget_other_devices(''rh-b1-standing'')::text'));
INSERT INTO b1_seen VALUES ('A''s left', (SELECT string_agg(token, ',' ORDER BY token) FROM public.push_tokens
  WHERE user_id = (SELECT id FROM b1_m WHERE n = 1) AND token LIKE 'rh-b1-%'));
INSERT INTO b1_seen VALUES ('B''s left', pg_temp.b1_has('rh-b1-of-b'));
INSERT INTO b1_seen VALUES ('a visitor signs out no other device',
  pg_temp.b1_as(0, NULL, 'SELECT public.forget_other_devices(''rh-b1-standing'')::text'));

-- The phone, signed out (a visitor now), forgets its own token.
INSERT INTO b1_seen VALUES ('named with another member',
  pg_temp.b1_as(0, NULL, format('SELECT public.forget_push_token(''rh-b1-standing'', %L)::text', (SELECT id FROM b1_m WHERE n = 2))));
INSERT INTO b1_seen VALUES ('kept, named with another', pg_temp.b1_has('rh-b1-standing'));
INSERT INTO b1_seen VALUES ('named with its member',
  pg_temp.b1_as(0, NULL, format('SELECT public.forget_push_token(''rh-b1-standing'', %L)::text', (SELECT id FROM b1_m WHERE n = 1))));
INSERT INTO b1_seen VALUES ('gone, named with its member', pg_temp.b1_has('rh-b1-standing'));
INSERT INTO b1_seen VALUES ('a token no phone could hold',
  pg_temp.b1_as(0, NULL, format('SELECT public.forget_push_token(%L, %L)::text', repeat('x', 600), (SELECT id FROM b1_m WHERE n = 1))));
INSERT INTO b1_seen VALUES ('B forgets B''s own, signed in',
  pg_temp.b1_as(2, NULL, format('SELECT public.forget_push_token(''rh-b1-of-b'', %L)::text', (SELECT id FROM b1_m WHERE n = 2))));
INSERT INTO b1_seen VALUES ('B''s gone', pg_temp.b1_has('rh-b1-of-b'));

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a member registers a phone under a standing session', 'done', (SELECT got FROM b1_seen WHERE what = 'A registers under the standing session'));
  PERFORM pg_temp.rh_case('the token keeps the session it was registered under', 'true', (SELECT got FROM b1_seen WHERE what = 'the session kept'));
  PERFORM pg_temp.rh_case('the sender reaches the phone from before round 13 while a session that could have registered it stands, never the ended one''s', 'rh-b1-before',
    (SELECT got FROM b1_seen WHERE what = 'sent to'));
  PERFORM pg_temp.rh_case('and the phone registered under its standing session', 'rh-b1-standing', (SELECT got FROM b1_seen WHERE what = 'sent to, registered'));
  PERFORM pg_temp.rh_case('the ended session''s token is gone', '0', (SELECT got FROM b1_seen WHERE what = 'the ended session''s row'));
  PERFORM pg_temp.rh_case('no member reads the tokens through the sender''s door', 'refused: 42501', (SELECT got FROM b1_seen WHERE what = 'a member reads the tokens so'));
  PERFORM pg_temp.rh_case('no visitor does', 'refused: 42501', (SELECT got FROM b1_seen WHERE what = 'a visitor reads the tokens so'));
  PERFORM pg_temp.rh_case('signing out every other device says how many went', 'true',
    ((SELECT got FROM b1_seen WHERE what = 'every other device forgotten')::int >= 1)::text);
  PERFORM pg_temp.rh_case('it takes the other phones'' tokens and keeps this phone''s', 'rh-b1-standing', (SELECT got FROM b1_seen WHERE what = 'A''s left'));
  PERFORM pg_temp.rh_case('and touches no other member''s', '1', (SELECT got FROM b1_seen WHERE what = 'B''s left'));
  PERFORM pg_temp.rh_case('a visitor signs out no other device', 'refused: 42501', (SELECT got FROM b1_seen WHERE what = 'a visitor signs out no other device'));
  PERFORM pg_temp.rh_case('a token named with another member is asked of', 'true', (SELECT got FROM b1_seen WHERE what = 'named with another member'));
  PERFORM pg_temp.rh_case('and is kept: the phone may be another''s now', '1', (SELECT got FROM b1_seen WHERE what = 'kept, named with another'));
  PERFORM pg_temp.rh_case('a phone signed out forgets its token, named with its member', 'true', (SELECT got FROM b1_seen WHERE what = 'named with its member'));
  PERFORM pg_temp.rh_case('and it is gone', '0', (SELECT got FROM b1_seen WHERE what = 'gone, named with its member'));
  PERFORM pg_temp.rh_case('a token no phone could hold looks for nothing', 'false', (SELECT got FROM b1_seen WHERE what = 'a token no phone could hold'));
  PERFORM pg_temp.rh_case('a member signed in forgets their own phone''s token too', 'true', (SELECT got FROM b1_seen WHERE what = 'B forgets B''s own, signed in'));
  PERFORM pg_temp.rh_case('and it is gone', '0', (SELECT got FROM b1_seen WHERE what = 'B''s gone'));
  PERFORM pg_temp.rh_case('a client sending no session still registers a phone', 'done', (SELECT got FROM b1_seen WHERE what = 'B registers with no session in the claims'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
