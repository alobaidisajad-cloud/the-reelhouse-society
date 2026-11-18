-- ════════════════════════════════════════════════════════════════════════════
-- the_films_due_are_found_at_once_rehearsal.sql — 20261119_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_films_due_are_found_at_once_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261119_04
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── H-C5 (index) rehearsal · the films to read again are found through their index ──
-- The index is built whole, and the claim's second read (H-C5) is planned through it: sequential
-- scans are switched off for the plan alone, so a plan that cannot use it shows the scan instead.
SELECT pg_temp.rh_case('the index is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.idx_films_reread')), 'missing')) AS done \gset rh_

SET LOCAL enable_seqscan = off;
CREATE TEMP TABLE rh_c5i_plan (line text) ON COMMIT DROP;
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXPLAIN
    SELECT c.id
      FROM public.films c
     WHERE (c.reread_after IS NOT NULL
            OR (c.synced_at IS NOT NULL AND c.sync_reads IS NULL
                AND (cardinality(c.genres) = 0 OR c.director_id IS NULL OR cardinality(c.cast_ids) = 0
                     OR c.year IS NULL OR c.year >= 2026)))
       AND c.sync_failed < 3
       AND COALESCE(c.reread_after, c.synced_at) <= now()
       AND (c.sync_claimed_at IS NULL OR c.sync_claimed_at < now() - interval '10 minutes')
     ORDER BY COALESCE(c.reread_after, c.synced_at), c.id
     LIMIT 20
  LOOP
    INSERT INTO rh_c5i_plan VALUES (l);
  END LOOP;
END $$;
RESET enable_seqscan;
SELECT pg_temp.rh_case('the claim reads the films to read again through their index', 'true',
  (SELECT bool_or(line LIKE '%idx_films_reread%') FROM rh_c5i_plan)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
