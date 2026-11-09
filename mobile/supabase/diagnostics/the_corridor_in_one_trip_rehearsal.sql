-- ════════════════════════════════════════════════════════════════════════════
-- the_corridor_in_one_trip_rehearsal.sql — 20261109_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_corridor_in_one_trip_rehearsal.sql
--
-- The Lounge's corridor in one call answers each reader what the separate reads
-- answer them, under the same rules. A private salon is kept by its host, with
-- a seated member, a member at its door, a banned one and a muted one; the host
-- has spoken there. Each reads the corridor: the host sees the request at the
-- door and the room's faces; the seated member sees its faces and the word they
-- have not read; the one at the door, the banned and the muted see no face and
-- no unread word, and the room stays listed for all. A visitor may not ask.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
-- The train applies it here first (with_train); a sealed copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261109_02_the_corridor_in_one_trip.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO rh_who
SELECT what, pg_temp.rh_found('a member to be ' || what, id)
  FROM (SELECT (ARRAY['the host', 'the seated', 'the one at the door', 'the banned', 'the muted'])[row_number() OVER (ORDER BY id)] AS what, id
          FROM (SELECT id FROM public.profiles WHERE role IS DISTINCT FROM 'admin' AND NOT coalesce(is_banned, false)
                 AND username IS NOT NULL ORDER BY id LIMIT 5) p) w;
SELECT pg_temp.rh_need('members to keep, sit in and be refused a salon', (SELECT count(*) FROM rh_who), 5);
CREATE FUNCTION pg_temp.rh_id(p_what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_who WHERE what = p_what $$;
-- Nothing hidden between them: a face kept back by a block would not be the rule under test.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rh_who) OR blocked_id IN (SELECT id FROM rh_who);
-- The host sits in no salon (production's first member did not, and the corridor answered them a
-- JSON null for their unread counts): given here, so every database rehearses that reader.
DELETE FROM public.lounge_members WHERE user_id = pg_temp.rh_id('the host');

-- The salon, its seats, and the host's word in it an hour ago.
CREATE TEMP TABLE rh_room (id uuid) ON COMMIT DROP;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private) VALUES ('rh corridor salon', pg_temp.rh_id('the host'), true) RETURNING id)
INSERT INTO rh_room SELECT id FROM made;
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT (SELECT id FROM rh_room), pg_temp.rh_id(w), s, NULL
  FROM (VALUES ('the seated', 'approved'), ('the one at the door', 'pending'), ('the banned', 'banned'), ('the muted', 'muted')) v(w, s);
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
VALUES ((SELECT id FROM rh_room), pg_temp.rh_id('the host'), 'rh: the host speaks', now() - interval '1 hour');
-- Read as each asker, so a refusal is the function's own, never this table's.
GRANT SELECT ON rh_room TO authenticated, anon;

-- What the corridor says of the salon to one reader (NULL, a visitor): the requests at its door,
-- its faces, its unread words, whether its last word is given as the directory's, and whether it is
-- listed among the newest.
CREATE FUNCTION pg_temp.rh_corridor_as(p_who uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
  r text := (SELECT id::text FROM rh_room);
  got text;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_who IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_who, 'role', 'authenticated')::text END, true);
  PERFORM set_config('role', CASE WHEN p_who IS NULL THEN 'anon' ELSE 'authenticated' END, true);
  BEGIN
    v := public.get_lounge_list();
    -- Every piece a list, for every reader: a JSON null where a list belongs fails the client's merge.
    IF NOT (SELECT bool_and(jsonb_typeof(v -> k) = 'array')
              FROM unnest(ARRAY['memberships', 'newest', 'hosted', 'joined', 'unread', 'pending', 'faces', 'last_words']) k) THEN
      got := 'a piece is not a list: ' || (SELECT string_agg(k || '=' || coalesce(jsonb_typeof(v -> k), 'missing'), ',')
              FROM unnest(ARRAY['memberships', 'newest', 'hosted', 'joined', 'unread', 'pending', 'faces', 'last_words']) k);
    ELSE
    got := 'door:' || (SELECT count(*) FROM jsonb_array_elements(v -> 'pending') e WHERE e ->> 'lounge_id' = r)
      || ',faces:' || (SELECT count(*) FROM jsonb_array_elements(v -> 'faces') e WHERE e ->> 'lounge_id' = r)
      || ',unread:' || coalesce((SELECT e ->> 'unread_count' FROM jsonb_array_elements(v -> 'unread') e
                                  WHERE e ->> 'lounge_id' = r), 'none')
      || ',last word:' || (SELECT count(*) FROM jsonb_array_elements(v -> 'last_words') e WHERE e ->> 'lounge_id' = r)
      || ',listed:' || (SELECT count(*) FROM jsonb_array_elements(v -> 'newest') e WHERE e ->> 'id' = r);
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    got := 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN got;
END $$;

CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, got text) ON COMMIT DROP;
INSERT INTO rh_rows SELECT what, pg_temp.rh_corridor_as(id) FROM rh_who;
INSERT INTO rh_rows VALUES ('a visitor', pg_temp.rh_corridor_as(NULL));

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('the host sees the request at the door and the room''s face; it holds no seat to read from',
    'door:1,faces:1,unread:none,last word:0,listed:1', (SELECT got FROM rh_rows WHERE what = 'the host'));
  PERFORM pg_temp.rh_case('the seated member sees the room''s face and the word they have not read',
    'door:0,faces:1,unread:1,last word:0,listed:1', (SELECT got FROM rh_rows WHERE what = 'the seated'));
  PERFORM pg_temp.rh_case('a member at the door sees no face and no word; the room is theirs to wait for',
    'door:0,faces:0,unread:0,last word:0,listed:1', (SELECT got FROM rh_rows WHERE what = 'the one at the door'));
  PERFORM pg_temp.rh_case('a banned member sees no face and no word; the room is in the directory, with when it last spoke',
    'door:0,faces:0,unread:0,last word:1,listed:1', (SELECT got FROM rh_rows WHERE what = 'the banned'));
  PERFORM pg_temp.rh_case('a muted member sees no face and no word; the room is in the directory, with when it last spoke',
    'door:0,faces:0,unread:0,last word:1,listed:1', (SELECT got FROM rh_rows WHERE what = 'the muted'));
  PERFORM pg_temp.rh_case('a visitor may not ask', 'refused', (SELECT got FROM rh_rows WHERE what = 'a visitor'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
