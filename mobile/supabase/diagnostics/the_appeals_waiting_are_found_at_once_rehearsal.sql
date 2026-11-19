-- ════════════════════════════════════════════════════════════════════════════
-- the_appeals_waiting_are_found_at_once_rehearsal.sql — 20261120_28. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_appeals_waiting_are_found_at_once_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261120_28
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── H-B6's index rehearsal · the appeals waiting are found by their own index (review round 14) ──
-- Run inside its own rehearsal transaction, after rehearsal_kit.sql (an index built CONCURRENTLY is
-- built alone, by the train, before this). The index is there and whole, over the waiting appeals alone,
-- in the APPEALS list's order; with the plan's other ways shut, the list's own read is answered from it.
SELECT pg_temp.rh_case('the index of the appeals waiting is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.mod_actions_appeals_waiting')), 'missing')) AS done \gset rh_
SELECT pg_temp.rh_case('it holds the waiting appeals alone', 'true',
  (SELECT (pg_get_expr(i.indpred, i.indrelid) = '(appeal_status = ''pending''::text)')::text FROM pg_index i WHERE i.indexrelid = 'public.mod_actions_appeals_waiting'::regclass)) AS done \gset rh_
SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
CREATE FUNCTION pg_temp.hb6i_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; r record;
BEGIN
  v := '';
  FOR r IN EXPLAIN SELECT id FROM public.mod_actions q WHERE q.appeal_status = 'pending' ORDER BY q.appeal_filed_at, q.id LIMIT 20 LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('the list''s read is answered from it', 'true',
  (position('mod_actions_appeals_waiting' in pg_temp.hb6i_plan()) > 0)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
