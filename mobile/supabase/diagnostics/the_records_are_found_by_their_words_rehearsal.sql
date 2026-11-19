-- ════════════════════════════════════════════════════════════════════════════
-- the_records_are_found_by_their_words_rehearsal.sql — 20261118_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/the_records_are_found_by_their_words_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction,
-- so the train builds it alone, and this checks it holds: the index is there and
-- whole, of the trigram pieces of the film title and the review, over the
-- reviewed records alone, as search_logs (20261118_01) asks them past its walk.
-- Which index the planner picks is the house's size to decide (a few hundred
-- records are read faster by logs_reviewed_newest, the same rows), so the plan
-- is measured at 100,000 members (the load house), not here. Read each NOTICE as
-- case|expected|got ; any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT pg_temp.rh_case('the index is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.logs_reviewed_words')), 'missing')) AS done \gset rh_
-- The definition is read on the catalogue's path alone, so it names each operator class with its
-- schema wherever it is read: production's postgres has extensions on its own path, and there the
-- class printed bare.
SELECT current_setting('search_path') AS path \gset rh_was_
SELECT set_config('search_path', 'pg_catalog', true) AS done \gset rh_
SELECT pg_temp.rh_case('it holds the trigram pieces of each reviewed record''s title and review', 'true',
  coalesce((SELECT (pg_get_indexdef(i.indexrelid) LIKE '%USING gin (film_title extensions.gin_trgm_ops, review extensions.gin_trgm_ops) WHERE ((review IS NOT NULL) AND (review <> ''''::text))')::text
              FROM pg_index i WHERE i.indexrelid = to_regclass('public.logs_reviewed_words')), 'missing')) AS done \gset rh_
SELECT set_config('search_path', :'rh_was_path', true) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
