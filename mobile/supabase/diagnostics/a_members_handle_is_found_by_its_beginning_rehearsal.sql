-- ════════════════════════════════════════════════════════════════════════════
-- a_members_handle_is_found_by_its_beginning_rehearsal.sql — 20261122_22. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_handle_is_found_by_its_beginning_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_22
-- alone, in its turn, and this checks it holds: the index is there and whole, a handle's beginning is read
-- as one range of an index of the handles' lower case (it, or another that leads alike, as the statistics
-- choose), and a member planted with a handle that begins with a rare run of letters is found, in any case, while one whose handle holds them only after an underscore is not.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the handles'' beginnings is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.profiles_username_beginning')), 'missing')) AS done \gset rh_

-- Two members: one whose handle begins with a run no other handle holds, one whose handle holds it only
-- after an underscore.
CREATE TEMP TABLE mhb_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n FROM auth.users u JOIN public.profiles p ON p.id = u.id
   ORDER BY u.created_at LIMIT 2;
SELECT pg_temp.rh_need('two members', (SELECT count(*) FROM mhb_members), 2) AS done \gset rh_
UPDATE public.profiles SET username = 'qxj1924_rh' WHERE id = (SELECT id FROM mhb_members WHERE n = 1);
UPDATE public.profiles SET username = 'rh_qxj1924' WHERE id = (SELECT id FROM mhb_members WHERE n = 2);

SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
CREATE FUNCTION pg_temp.mhb_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT p.id FROM public.profiles p WHERE lower(p.username) LIKE lower('QXJ1924') || '%' LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('a handle''s beginning is read as one range of an index of the handles'' lower case', 'true',
  pg_temp.rh_reads_by((SELECT pg_temp.mhb_plan()), 'profiles', 'lower(username)')::text) AS done \gset rh_
SELECT pg_temp.rh_case('the member whose handle begins with it is found, in either case, and not the one whose later word holds it', '1|1',
  (SELECT coalesce((SELECT string_agg(m.n::text, ',') FROM public.profiles p JOIN mhb_members m ON m.id = p.id
                     WHERE lower(p.username) LIKE lower('QXJ1924') || '%'), 'none') || '|'
       || coalesce((SELECT string_agg(m.n::text, ',') FROM public.profiles p JOIN mhb_members m ON m.id = p.id
                     WHERE lower(p.username) LIKE lower('qxj1924') || '%'), 'none'))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
