-- ════════════════════════════════════════════════════════════════════════════
-- a_films_critiques_are_one_range_rehearsal.sql — 20261119_05. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_films_critiques_are_one_range_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261119_05
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
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
-- ── H-DX's index rehearsal · a film's critiques are read through their film's index (review round 13) ──
-- Run inside its own rehearsal transaction, after rehearsal_kit.sql (an index built CONCURRENTLY is
-- built alone, by the train, before this). The index is there and whole, and the read a film's page
-- makes (a film's reviewed records, newest first, ten of them), asked as a member through the rules,
-- is answered in its own order by the film's own range of it, for the house's most reviewed film; a
-- film with one critique is never read by walking every film's critiques. Sorting, bitmaps and
-- sequential scans are switched off for the plans alone: on a house as small as production today any
-- read is cheap, and the planner may sort a few rows instead; the plan shows the ordered read the
-- index gives wherever the house is large enough to need it.
SELECT pg_temp.rh_case('the index of each film''s critiques is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.logs_film_reviewed_newest')), 'missing')) AS done \gset rh_

CREATE TEMP TABLE hdx_plan (film text, line text) ON COMMIT DROP;
GRANT ALL ON hdx_plan TO authenticated;
-- The house's most reviewed film, and one film with a single critique: read as a member.
CREATE TEMP TABLE hdx_films ON COMMIT DROP AS
  SELECT 'popular' AS film, (SELECT l.film_id FROM public.logs l WHERE l.review IS NOT NULL AND l.review <> ''
                               GROUP BY l.film_id ORDER BY count(*) DESC LIMIT 1) AS film_id
  UNION ALL
  SELECT 'rare', (SELECT l.film_id FROM public.logs l WHERE l.review IS NOT NULL AND l.review <> ''
                   GROUP BY l.film_id HAVING count(*) = 1 ORDER BY l.film_id LIMIT 1);
GRANT SELECT ON hdx_films TO authenticated;
SELECT pg_temp.rh_found('a film with critiques', (SELECT film_id FROM hdx_films WHERE film = 'popular')) AS done \gset rh_
SET LOCAL enable_sort = off;
SET LOCAL enable_bitmapscan = off;
SET LOCAL enable_seqscan = off;
DO $$
DECLARE f record; l text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOR f IN SELECT * FROM hdx_films WHERE film_id IS NOT NULL LOOP
    FOR l IN EXECUTE format('EXPLAIN SELECT id, rating, review, created_at FROM public.logs
                              WHERE film_id = %s AND review IS NOT NULL AND review <> %L
                              ORDER BY created_at DESC, id DESC LIMIT 10', f.film_id, '') LOOP
      INSERT INTO hdx_plan VALUES (f.film, l);
    END LOOP;
  END LOOP;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SET LOCAL enable_sort = on;
SET LOCAL enable_bitmapscan = on;
SET LOCAL enable_seqscan = on;
SELECT pg_temp.rh_case('the most reviewed film''s critiques are read through it', 'true',
  (SELECT bool_or(line LIKE '%logs_film_reviewed_newest%') FROM hdx_plan WHERE film = 'popular')::text) AS done \gset rh_
SELECT pg_temp.rh_case('and a film with one critique''s by its film, never by walking every film''s critiques', 'false',
  coalesce((SELECT bool_or(line LIKE '%using logs_reviewed_newest %') FROM hdx_plan WHERE film = 'rare'), false)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
