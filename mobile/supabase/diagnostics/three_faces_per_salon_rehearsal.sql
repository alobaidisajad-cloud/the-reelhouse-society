-- ════════════════════════════════════════════════════════════════════════════
-- three_faces_per_salon_rehearsal.sql — 20261111_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs three_faces_per_salon_rehearsal.sql --with-train
--
-- Every salon's faces, as its host sees them, are read by get_salon_member_faces as it stands;
-- then the train applies 20261111_04 here (with_train), and every salon's faces are read again:
-- the same three, in the same order, for every salon (on the load lab's full house too, where
-- the train runs this before it applies anything). A member who neither sits in a salon nor
-- hosts it is shown none of its faces. Read each NOTICE as case|expected|got ; the last line is
-- the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_salon (id uuid, host uuid) ON COMMIT DROP;
INSERT INTO rh_salon SELECT id, creator_id FROM public.lounges WHERE creator_id IS NOT NULL ORDER BY id LIMIT 300;
SELECT pg_temp.rh_found('a salon with a host', (SELECT id FROM rh_salon ORDER BY id LIMIT 1)) AS done \gset rh_

-- Each salon's faces as its host is shown them, into the table named.
CREATE TEMP TABLE rh_faces (pass text, salon uuid, username text, avatar_url text, rn integer) ON COMMIT DROP;
CREATE FUNCTION pg_temp.rh_read_faces(p_pass text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
  FOR s IN SELECT id, host FROM rh_salon LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', s.host, 'role', 'authenticated')::text, true);
    INSERT INTO rh_faces SELECT p_pass, f.lounge_id, f.username, f.avatar_url, f.rn FROM public.get_salon_member_faces(ARRAY[s.id]) f;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SELECT pg_temp.rh_read_faces('before') AS done \gset rh_

-- The train applies it here first (with_train); a sealed copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261111_04_three_faces_per_salon.sql
\endif

SELECT pg_temp.rh_read_faces('after') AS done \gset rh_

SELECT pg_temp.rh_case('every salon''s faces: the same three, in the same order', '0',
  (SELECT count(*) FROM (
     (SELECT salon, username, avatar_url, rn FROM rh_faces WHERE pass = 'before'
      EXCEPT ALL SELECT salon, username, avatar_url, rn FROM rh_faces WHERE pass = 'after')
     UNION ALL
     (SELECT salon, username, avatar_url, rn FROM rh_faces WHERE pass = 'after'
      EXCEPT ALL SELECT salon, username, avatar_url, rn FROM rh_faces WHERE pass = 'before')) d)::text) AS done \gset rh_
SELECT pg_temp.rh_case('never more than three a salon', '0',
  (SELECT count(*) FROM rh_faces WHERE pass = 'after' AND (rn < 1 OR rn > 3))::text) AS done \gset rh_

-- A member who neither sits in any of these salons nor hosts it: shown none of their faces.
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.rh_case('a stranger to the salons is shown no face', '0',
  (SELECT count(*) FROM public.get_salon_member_faces(ARRAY(SELECT id FROM rh_salon)))::text) AS done \gset rh_
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
