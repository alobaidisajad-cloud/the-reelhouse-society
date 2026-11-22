-- ════════════════════════════════════════════════════════════════════════════
-- a_names_beginning_is_read_as_a_range_rehearsal.sql — 20261122_18. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_names_beginning_is_read_as_a_range_rehearsal.sql --with-train
--
-- The train applies 20261122_18 here (with_train), every car before it already applied (20261122_17's index
-- among them); a sealed copy already holds it. On names it plants (accents in both cases, a digraph, a
-- sharp s, digits, a quote, an underscore), as a member searching: search_members answers every search after
-- the car exactly as before it (before is read first, with_train), the whole page with each closeness (the
-- digraph's lower case is the collation's to say, so it is held to that alone); a
-- planted name that begins with the words is found at that closeness, one whose later word holds them is
-- not; and the test the car adds to a name's beginning is read as one range of 20261122_17's index.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 9;
SELECT pg_temp.rh_need('nine members in good standing', (SELECT count(*) FROM rehearsal_members), 9) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false WHERE id IN (SELECT id FROM rehearsal_members);
-- Member 9 searches; the eight others carry the names, each word of which no other member's name holds.
-- Their handles hold none of the searched words.
UPDATE public.profiles p SET username = 'rhnb_' || m.n, display_name = CASE m.n
    WHEN 1 THEN 'Élise Rhnb'
    WHEN 2 THEN 'élan Rhnb'
    WHEN 3 THEN 'Rhnb Élise Rhnb'
    WHEN 4 THEN 'ǅolly Rhnb'
    WHEN 5 THEN 'Straße Rhnb'
    WHEN 6 THEN '1924 Rhnb'
    WHEN 7 THEN 'Rhnb 1924 Rhnb'
    WHEN 8 THEN 'O''Brien_Rhnb' END
  FROM rehearsal_members m WHERE m.id = p.id AND m.n <= 8;

-- What member 9 finds for each search: every member on the page, in its order, with its closeness.
CREATE FUNCTION pg_temp.nb_finds() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb := '{}'::jsonb; w text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 9), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOREACH w IN ARRAY ARRAY['é', 'É', 'ǆ', '1', '19', 'élise rh', 'ÉLISE RH', 'élan rh', 'ǆolly', 'ǅolly', 'straße rh', 'STRASSE RH',
                           '1924 rh', 'o''brien\_', 'o''brien_r', 'rhnb', 'Rh%b', '\%'] LOOP
    v := v || jsonb_build_object(w, (SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) FROM public.search_members(w, false, NULL, NULL, 51) f));
  END LOOP;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;
CREATE TEMP TABLE nb_before ON COMMIT DROP AS SELECT pg_temp.nb_finds() AS r;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_18_a_names_beginning_is_read_as_a_range.sql
\endif
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE nb_after ON COMMIT DROP AS SELECT pg_temp.nb_finds() AS r;

-- The planted members a search found at the third closeness (a name that begins with the words).
CREATE FUNCTION pg_temp.nb_named(w text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(m.n::text, ',' ORDER BY m.n), 'none')
    FROM nb_after, jsonb_array_elements(r -> w) e
    JOIN rehearsal_members m ON m.id = (e ->> 0)::uuid
   WHERE (e ->> 1)::int = 2
$$;
SELECT pg_temp.rh_case('every search answers after the car as it did before it, the whole page', 'true',
  ((SELECT r FROM nb_after) = (SELECT r FROM nb_before))::text) AS done \gset rh_
SELECT pg_temp.rh_case('a name that begins with an accented word is found by it in either case; a later word''s is not', '1|1|2',
  pg_temp.nb_named('élise rh') || '|' || pg_temp.nb_named('ÉLISE RH') || '|' || pg_temp.nb_named('élan rh')) AS done \gset rh_
SELECT pg_temp.rh_case('a sharp s begins a name as itself', '5',
  pg_temp.nb_named('straße rh')) AS done \gset rh_
SELECT pg_temp.rh_case('a number begins a name, never a later word''s', '6',
  pg_temp.nb_named('1924 rh')) AS done \gset rh_
SELECT pg_temp.rh_case('an escaped underscore is read as itself, a bare one as any one letter', '8|8',
  pg_temp.nb_named('o''brien\_') || '|' || pg_temp.nb_named('o''brien_r')) AS done \gset rh_

-- The test the car adds, as search_members asks it of a name's beginning, read by the index.
SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
CREATE FUNCTION pg_temp.nb_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXECUTE format('EXPLAIN SELECT p.id FROM public.profiles p WHERE p.display_name ILIKE %L ESCAPE %L AND lower(p.display_name) LIKE %L ESCAPE %L LIMIT 1001',
                          '1924%', '\', lower('1924') || '%', '\') LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('search_members asks a name''s beginning of its lower case too', 'true',
  (position('lower(p.display_name) LIKE %L' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('a name''s beginning, as the search asks it, is one range of the names'' index', 'true',
  (position('profiles_display_name_beginning' in pg_temp.nb_plan()) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the members are analysed with the index of their names'' beginnings', 'true',
  (EXISTS (SELECT 1 FROM pg_stats WHERE schemaname = 'public' AND tablename = 'profiles_display_name_beginning'))::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
