-- ════════════════════════════════════════════════════════════════════════════
-- the_tokens_are_found_by_their_member_rehearsal.sql — 20261119_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_tokens_are_found_by_their_member_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261119_02
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── B1's index rehearsal · a member's tokens are read through their member's index (review round 13) ──
-- Run inside its own rehearsal transaction, after rehearsal_kit.sql (an index built CONCURRENTLY is
-- built alone, by the train, before this). The index is there and whole, and the read push_tokens_of
-- makes on every notice (a member's tokens) goes through it. Sequential scans are switched off for the
-- plan alone, so a plan that cannot use the index shows the scan it would fall back to.
SELECT pg_temp.rh_case('the index of the tokens by member is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.push_tokens_user_id')), 'missing')) AS done \gset rh_

SET LOCAL enable_seqscan = off;
CREATE TEMP TABLE b1i_plan (line text) ON COMMIT DROP;
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXPLAIN SELECT t.token FROM public.push_tokens t WHERE t.user_id = '00000000-0000-4000-8000-000000000001'::uuid LOOP
    INSERT INTO b1i_plan VALUES (l);
  END LOOP;
END $$;
SELECT pg_temp.rh_case('a member''s tokens are read through it', 'true',
  (SELECT bool_or(line LIKE '%push_tokens_user_id%') FROM b1i_plan)::text) AS done \gset rh_
SET LOCAL enable_seqscan = on;

SELECT pg_temp.rh_verdict();
ROLLBACK;
