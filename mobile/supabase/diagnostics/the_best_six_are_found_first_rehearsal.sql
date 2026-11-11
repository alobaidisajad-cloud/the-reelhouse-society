-- ════════════════════════════════════════════════════════════════════════════
-- the_best_six_are_found_first_rehearsal.sql — 20261111_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/the_best_six_are_found_first_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction,
-- so the train built it alone on production (2026-11-11), and this checks it still holds: the index is there and
-- whole, and a member's six highest rated, as the app asks for them
-- (ProfileDataService.fetchHighestRated), are read through it. Sequential scans
-- are switched off for the plan alone, so a plan that cannot use the index shows
-- the scan it would fall back to. Read each NOTICE as case|expected|got ; any
-- miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT pg_temp.rh_case('the index is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.idx_logs_user_highest_rated')), 'missing')) AS done \gset rh_

SET LOCAL enable_seqscan = off;
CREATE TEMP TABLE rh_plan (line text) ON COMMIT DROP;
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXPLAIN SELECT id, film_id, rating FROM public.logs
             WHERE user_id = '00000000-0000-4000-8000-000000000000'::uuid AND rating >= 4
             ORDER BY rating DESC, watched_date DESC NULLS LAST, id DESC LIMIT 6 LOOP
    INSERT INTO rh_plan VALUES (l);
  END LOOP;
END $$;
SELECT pg_temp.rh_case('a member''s six highest rated are read through the index', 'true',
  (SELECT bool_or(line LIKE '%idx_logs_user_highest_rated%') FROM rh_plan)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
