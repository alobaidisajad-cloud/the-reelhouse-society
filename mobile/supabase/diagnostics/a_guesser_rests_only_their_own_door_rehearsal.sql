-- ════════════════════════════════════════════════════════════════════════════
-- a_guesser_rests_only_their_own_door_rehearsal.sql — 20261120_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_guesser_rests_only_their_own_door_rehearsal.sql --with-train
--
-- The train applies 20261120_01 here (with_train), 20261120_00 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 14).
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
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE ha1_keys (k text, v text) ON COMMIT DROP;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_01_a_guesser_rests_only_their_own_door.sql
\endif

-- ── H-A1 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A1 rehearsal · a guesser rests only their own door; the member always has a way in (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Asked as the service role, as
-- sign-in-with-username asks with its own key. A door that misses five times rests itself alone; the
-- pail every unknown door shares slows many doors and refills; a phone holding the key the member's
-- right password gave it is never held by the pail, and a key is the member's alone; an attempt the
-- house could not answer is given back, rest and all; a handle no one holds leaves no row; doors and
-- keys are bounded. A member and a visitor may ask none of it.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE ha1_who ON COMMIT DROP AS
  SELECT m.n, m.id, p.username FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id;
SELECT pg_temp.rh_need('members 1 to 3 with handles', (SELECT count(*) FROM ha1_who WHERE n <= 3 AND coalesce(username, '') <> ''), 3) AS done \gset rh_
DELETE FROM public.sign_in_doors WHERE user_id IN (SELECT id FROM ha1_who);
DELETE FROM public.sign_in_handles WHERE user_id IN (SELECT id FROM ha1_who);
DELETE FROM public.sign_in_devices WHERE user_id IN (SELECT id FROM ha1_who);

-- The house's functions, as one role (asked afresh each time: a cached call keeps its first caller's right).
CREATE FUNCTION pg_temp.ha1(p_role text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v = RETURNED_SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.ha1_h(p_n integer) RETURNS text LANGUAGE sql AS $$ SELECT username FROM ha1_who WHERE n = p_n $$;
CREATE FUNCTION pg_temp.ha1_u(p_n integer) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ha1_who WHERE n = p_n $$;
-- One attempt by member n's handle from a door (or none), with a key (or none): {wait, from, door, pail}.
CREATE FUNCTION pg_temp.ha1_try(p_n integer, p_door text, p_key text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.ha1('service_role', format('SELECT public.sign_in_attempt(%L, %L, %L)::text', pg_temp.ha1_h(p_n), p_door, p_key))::jsonb
$$;
CREATE FUNCTION pg_temp.ha1_door(p_n integer, p_door text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT misses || '|' || coalesce(round(extract(epoch FROM paused_until - now()) / 60)::text, 'none')
                     FROM public.sign_in_doors WHERE user_id = (SELECT pg_temp.ha1_u(p_n)) AND door = p_door), 'gone')
$$;
CREATE FUNCTION pg_temp.ha1_pail(p_n integer) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT round(tokens)::text FROM public.sign_in_handles WHERE user_id = (SELECT pg_temp.ha1_u(p_n))), 'none')
$$;

-- A handle no one holds: let through, nothing counted, no row.
SELECT pg_temp.rh_case('a handle no one holds is let through, counted nowhere', '{"door": false, "pail": false, "wait": 0}',
  pg_temp.ha1('service_role', format('SELECT public.sign_in_attempt(%L, %L, NULL)::text', 'rh_ha1_nobody_' || md5(random()::text), '203.0.113.1'))) AS done \gset rh_
SELECT pg_temp.rh_case('and leaves no row in any of the three', '0', (SELECT (
  (SELECT count(*) FROM public.sign_in_doors WHERE door = '203.0.113.1')
  + (SELECT count(*) FROM public.sign_in_handles h WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = h.user_id)))::text)) AS done \gset rh_

-- A door: four let through, the fifth too and rests it a minute, the sixth told it rests, uncounted.
SELECT pg_temp.rh_case('four wrong from one door are let through, and a fifth, each counted at the door and in the pail', '0,0,0,0|{"door": true, "pail": true, "wait": 0}',
  (SELECT string_agg(pg_temp.ha1_try(1, '198.51.100.7') ->> 'wait', ',') FROM generate_series(1, 4))
  || '|' || pg_temp.ha1_try(1, '198.51.100.7')::text) AS done \gset rh_
SELECT pg_temp.rh_case('the fifth rests that door a minute', '5|1', pg_temp.ha1_door(1, '198.51.100.7')) AS done \gset rh_
SELECT pg_temp.rh_case('the sixth from it is told it rests, from here', 'true|here',
  ((pg_temp.ha1_try(1, '198.51.100.7') ->> 'wait')::integer BETWEEN 1 AND 60)::text || '|' || (pg_temp.ha1_try(1, '198.51.100.7') ->> 'from')) AS done \gset rh_
SELECT pg_temp.rh_case('and is not counted', '5|1', pg_temp.ha1_door(1, '198.51.100.7')) AS done \gset rh_
SELECT pg_temp.rh_case('the pail spent five of its twenty', '15', pg_temp.ha1_pail(1)) AS done \gset rh_
SELECT pg_temp.rh_case('the member, from another door, is not held by the guesser''s rest', '0', pg_temp.ha1_try(1, '203.0.113.20') ->> 'wait') AS done \gset rh_

-- The door's rests double, never past an hour; a day quiet starts it again.
UPDATE public.sign_in_doors SET paused_until = now() - interval '1 second' WHERE user_id = (SELECT pg_temp.ha1_u(1)) AND door = '198.51.100.7';
SELECT pg_temp.rh_case('its rest over, the next is let through and rests it two minutes', '0|6|2',
  (pg_temp.ha1_try(1, '198.51.100.7') ->> 'wait') || '|' || pg_temp.ha1_door(1, '198.51.100.7')) AS done \gset rh_
UPDATE public.sign_in_doors SET misses = 40, paused_until = now() - interval '1 second' WHERE user_id = (SELECT pg_temp.ha1_u(1)) AND door = '198.51.100.7';
SELECT pg_temp.rh_case('never rests a door past an hour', '0|41|60',
  (pg_temp.ha1_try(1, '198.51.100.7') ->> 'wait') || '|' || pg_temp.ha1_door(1, '198.51.100.7')) AS done \gset rh_
UPDATE public.sign_in_doors SET misses = 30, paused_until = now() - interval '23 hours', last_at = now() - interval '25 hours'
 WHERE user_id = (SELECT pg_temp.ha1_u(1)) AND door = '198.51.100.7';
SELECT pg_temp.rh_case('a door a day quiet starts again at one', '0|1|none',
  (pg_temp.ha1_try(1, '198.51.100.7') ->> 'wait') || '|' || pg_temp.ha1_door(1, '198.51.100.7')) AS done \gset rh_

-- The pail: many doors at once are slowed together; it refills one every five minutes.
UPDATE public.sign_in_handles SET tokens = 0.5, refilled_at = now() WHERE user_id = (SELECT pg_temp.ha1_u(1));
SELECT pg_temp.rh_case('the pail empty, a door not yet tried is told it is slowed from elsewhere, and not counted', 'true|elsewhere|0|none',
  ((pg_temp.ha1_try(1, '192.0.2.44') ->> 'wait')::integer BETWEEN 1 AND 300)::text || '|' || (pg_temp.ha1_try(1, '192.0.2.44') ->> 'from')
  || '|' || pg_temp.ha1_door(1, '192.0.2.44')) AS done \gset rh_
SELECT pg_temp.rh_case('with no vouched door the pail alone holds', 'elsewhere', pg_temp.ha1_try(1, NULL) ->> 'from') AS done \gset rh_
UPDATE public.sign_in_handles SET tokens = 0, refilled_at = now() - interval '600 seconds' WHERE user_id = (SELECT pg_temp.ha1_u(1));
SELECT pg_temp.rh_case('ten minutes on, two more are let through (the first with no door: the pail alone counts it), then slowed again', '{"door": false, "pail": true, "wait": 0}|0|elsewhere',
  pg_temp.ha1_try(1, NULL)::text || '|' || (pg_temp.ha1_try(1, '192.0.2.45') ->> 'wait') || '|' || (pg_temp.ha1_try(1, '192.0.2.46') ->> 'from')) AS done \gset rh_

-- The right password: the door's count goes, the attempt is given back, the phone is handed its key.
INSERT INTO ha1_keys SELECT 'one', pg_temp.ha1('service_role', format('SELECT public.sign_in_cleared(%L, %L, true, NULL)', upper(pg_temp.ha1_h(1)), '203.0.113.20'));
SELECT pg_temp.rh_case('the right password hands the phone a key of its own', 'true', ((SELECT v FROM ha1_keys WHERE k = 'one') ~ '^[0-9a-f]{64}$')::text) AS done \gset rh_
SELECT pg_temp.rh_case('only its hash is kept, the member''s', '1',
  (SELECT count(*)::text FROM public.sign_in_devices WHERE user_id = (SELECT pg_temp.ha1_u(1))
      AND token_hash = sha256(convert_to((SELECT v FROM ha1_keys WHERE k = 'one'), 'UTF8')))) AS done \gset rh_
SELECT pg_temp.rh_case('and that door''s count went', 'gone', pg_temp.ha1_door(1, '203.0.113.20')) AS done \gset rh_
UPDATE public.sign_in_handles SET tokens = 0, refilled_at = now() WHERE user_id = (SELECT pg_temp.ha1_u(1));
SELECT pg_temp.rh_case('the member''s phone with its key is let try with the pail empty', '0|false',
  (pg_temp.ha1_try(1, '192.0.2.47', (SELECT v FROM ha1_keys WHERE k = 'one')) ->> 'wait') || '|'
  || (pg_temp.ha1_try(1, '192.0.2.47', (SELECT v FROM ha1_keys WHERE k = 'one')) ->> 'pail')) AS done \gset rh_
SELECT pg_temp.rh_case('a key made up is no key', 'elsewhere', pg_temp.ha1_try(1, '192.0.2.48', md5('x') || md5('y')) ->> 'from') AS done \gset rh_
SELECT pg_temp.rh_case('member 1''s key is not member 2''s: their pail counts it', 'true',
  pg_temp.ha1_try(2, '192.0.2.49', (SELECT v FROM ha1_keys WHERE k = 'one')) ->> 'pail') AS done \gset rh_
SELECT pg_temp.rh_case('signing in again on that phone keeps its key', (SELECT v FROM ha1_keys WHERE k = 'one'),
  pg_temp.ha1('service_role', format('SELECT public.sign_in_cleared(%L, NULL, false, %L)', pg_temp.ha1_h(1), (SELECT v FROM ha1_keys WHERE k = 'one')))) AS done \gset rh_
SELECT pg_temp.rh_case('eleven new phones, eleven new keys', '11',
  (SELECT count(DISTINCT pg_temp.ha1('service_role', format('SELECT public.sign_in_cleared(%L, NULL, false, NULL) /* %s */', pg_temp.ha1_h(1), g))) FROM generate_series(1, 11) g)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the member holds ten at most', '10', (SELECT count(*)::text FROM public.sign_in_devices WHERE user_id = (SELECT pg_temp.ha1_u(1)))) AS done \gset rh_

-- An attempt the house could not answer is given back, and the rest it earned with it.
UPDATE public.sign_in_handles SET tokens = 20, refilled_at = now() WHERE user_id = (SELECT pg_temp.ha1_u(3));
SELECT pg_temp.ha1_try(3, '198.51.100.30') AS done \gset rh_
SELECT pg_temp.rh_case('counted', '1|none|19', pg_temp.ha1_door(3, '198.51.100.30') || '|' || pg_temp.ha1_pail(3)) AS done \gset rh_
SELECT pg_temp.ha1('service_role', format('SELECT public.sign_in_unasked(%L, %L, true)::text', pg_temp.ha1_h(3), '198.51.100.30')) AS done \gset rh_
SELECT pg_temp.rh_case('an attempt the house could not answer never counts', '0|none|20', pg_temp.ha1_door(3, '198.51.100.30') || '|' || pg_temp.ha1_pail(3)) AS done \gset rh_
UPDATE public.sign_in_doors SET misses = 4 WHERE user_id = (SELECT pg_temp.ha1_u(3)) AND door = '198.51.100.30';
SELECT pg_temp.ha1_try(3, '198.51.100.30') AS done \gset rh_
SELECT pg_temp.rh_case('a fifth that rests the door', '5|1', pg_temp.ha1_door(3, '198.51.100.30')) AS done \gset rh_
SELECT pg_temp.ha1('service_role', format('SELECT public.sign_in_unasked(%L, %L, true)::text', pg_temp.ha1_h(3), '198.51.100.30')) AS done \gset rh_
SELECT pg_temp.rh_case('given back, takes its rest with it', '4|none', pg_temp.ha1_door(3, '198.51.100.30')) AS done \gset rh_

-- Bounded: 64 doors a member at most; rows a day quiet let go.
INSERT INTO public.sign_in_doors (user_id, door, misses, last_at)
SELECT pg_temp.ha1_u(2), '10.0.' || g || '.1', 1, now() - interval '1 hour' + (g || ' seconds')::interval FROM generate_series(1, 64) g
ON CONFLICT DO NOTHING;
DELETE FROM public.sign_in_doors WHERE user_id = (SELECT pg_temp.ha1_u(2)) AND door NOT LIKE '10.0.%';
SELECT pg_temp.ha1_try(2, '10.9.9.9') AS done \gset rh_
SELECT pg_temp.rh_case('a 65th door lets the least recent go: still 64', '64|gone|1|none',
  (SELECT count(*)::text FROM public.sign_in_doors WHERE user_id = (SELECT pg_temp.ha1_u(2))) || '|' || pg_temp.ha1_door(2, '10.0.1.1') || '|' || pg_temp.ha1_door(2, '10.9.9.9')) AS done \gset rh_
INSERT INTO public.sign_in_doors (user_id, door, misses, last_at) VALUES (pg_temp.ha1_u(3), '172.16.0.1', 2, now() - interval '2 days');
SELECT pg_temp.ha1_try(1, '203.0.113.99') AS done \gset rh_
SELECT pg_temp.rh_case('a door a day quiet is let go', 'gone', pg_temp.ha1_door(3, '172.16.0.1')) AS done \gset rh_

-- Neither a member nor a visitor may ask any of it.
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.ha1_u(2), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.rh_case('a member may count, give back or clear nothing', '42501,42501,42501',
  pg_temp.ha1('authenticated', format('SELECT public.sign_in_attempt(%L, NULL, NULL)::text', pg_temp.ha1_h(1))) || ','
  || pg_temp.ha1('authenticated', format('SELECT public.sign_in_unasked(%L, NULL, true)::text', pg_temp.ha1_h(1))) || ','
  || pg_temp.ha1('authenticated', format('SELECT public.sign_in_cleared(%L, NULL, false, NULL)', pg_temp.ha1_h(1)))) AS done \gset rh_
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('nor a visitor', '42501,42501,42501',
  pg_temp.ha1('anon', format('SELECT public.sign_in_attempt(%L, NULL, NULL)::text', pg_temp.ha1_h(1))) || ','
  || pg_temp.ha1('anon', format('SELECT public.sign_in_unasked(%L, NULL, true)::text', pg_temp.ha1_h(1))) || ','
  || pg_temp.ha1('anon', format('SELECT public.sign_in_cleared(%L, NULL, false, NULL)', pg_temp.ha1_h(1)))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
