-- ════════════════════════════════════════════════════════════════════════════
-- the_names_are_found_by_their_pieces_rehearsal.sql — 20261118_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/the_names_are_found_by_their_pieces_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction,
-- so the train builds it alone, and this checks it holds: the index is there and
-- whole, and a name searched by a piece of it (as search_members, 20261118_01,
-- searches the names) is read through it. Sequential scans are switched off for
-- the plan alone, so a plan that cannot use the index shows the scan it would
-- fall back to. Read each NOTICE as case|expected|got ; any miss makes psql exit
-- non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT pg_temp.rh_case('the index is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.profiles_display_name_trigram')), 'missing')) AS done \gset rh_

SET LOCAL enable_seqscan = off;
CREATE TEMP TABLE rh_plan (line text) ON COMMIT DROP;
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXPLAIN SELECT p.id FROM public.profiles p WHERE p.display_name ILIKE '%kane%' LOOP
    INSERT INTO rh_plan VALUES (l);
  END LOOP;
END $$;
SELECT pg_temp.rh_case('a name is found by a piece of it through the index', 'true',
  (SELECT bool_or(line LIKE '%profiles_display_name_trigram%') FROM rh_plan)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
