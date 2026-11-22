-- ════════════════════════════════════════════════════════════════════════════
-- a_members_name_is_found_by_its_beginning_rehearsal.sql — 20261122_17. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_name_is_found_by_its_beginning_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_17
-- alone, in its turn, and this checks it holds: the index is there and whole, a name's beginning is read
-- as one range of it, and a member planted with a name that begins with a rare pair of letters is found
-- through it, in any case, while one whose name only holds those letters at a later word is not.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the names'' beginnings is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.profiles_display_name_beginning')), 'missing')) AS done \gset rh_

-- Two members: one whose name begins with a pair of letters no other member's does, one whose name holds
-- it only at its second word.
CREATE TEMP TABLE mnb_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n FROM auth.users u JOIN public.profiles p ON p.id = u.id
   ORDER BY u.created_at LIMIT 2;
SELECT pg_temp.rh_need('two members', (SELECT count(*) FROM mnb_members), 2) AS done \gset rh_
UPDATE public.profiles SET display_name = 'Øq Rehearsal' WHERE id = (SELECT id FROM mnb_members WHERE n = 1);
UPDATE public.profiles SET display_name = 'Rehearsal Øq' WHERE id = (SELECT id FROM mnb_members WHERE n = 2);

SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
CREATE FUNCTION pg_temp.mnb_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT p.id FROM public.profiles p WHERE lower(p.display_name) LIKE lower('Øq') || '%' LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('a name''s beginning is read as one range of it', 'true',
  (position('profiles_display_name_beginning' in pg_temp.mnb_plan()) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the member whose name begins with it is found, in either case, and not the one whose later word holds it', '1|1',
  (SELECT coalesce((SELECT string_agg(m.n::text, ',') FROM public.profiles p JOIN mnb_members m ON m.id = p.id
                     WHERE lower(p.display_name) LIKE lower('ØQ') || '%'), 'none') || '|'
       || coalesce((SELECT string_agg(m.n::text, ',') FROM public.profiles p JOIN mnb_members m ON m.id = p.id
                     WHERE lower(p.display_name) LIKE lower('øq') || '%'), 'none'))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
