-- ════════════════════════════════════════════════════════════════════════════
-- the_members_under_sanction_are_found_at_once_rehearsal.sql — 20261120_25. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_members_under_sanction_are_found_at_once_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261120_25
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── H-B2's index rehearsal · the members under sanction are found by their own index (review round 14) ──
-- Run inside its own rehearsal transaction, after rehearsal_kit.sql (an index built CONCURRENTLY is
-- built alone, by the train, before this). The index is there and whole, over the members ever banned or
-- suspended alone, in the SANCTIONS list's order; with the plan's other ways shut, the list's own read is
-- answered from it (which way a plan takes on a small house is the house's size's to decide).
SELECT pg_temp.rh_case('the index of the members under sanction is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.profiles_under_sanction')), 'missing')) AS done \gset rh_
SELECT pg_temp.rh_case('it holds the banned and the suspended alone', 'true',
  (SELECT (pg_get_expr(i.indpred, i.indrelid) = '(is_banned OR (suspended_until IS NOT NULL))')::text FROM pg_index i WHERE i.indexrelid = 'public.profiles_under_sanction'::regclass)) AS done \gset rh_
-- On a sealed copy alone (plan_checks, which e2e/db/rehearsals.mjs sets): a plan is chosen by statistics,
-- and a copy of production carries its rows without them; the Load's plan guards hold the bound at size.
\if :{?plan_checks}
SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
CREATE FUNCTION pg_temp.hb2i_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; r record;
BEGIN
  v := '';
  FOR r IN EXPLAIN SELECT id FROM public.profiles q
            WHERE (q.is_banned OR q.suspended_until IS NOT NULL) AND (coalesce(q.is_banned, false) OR q.suspended_until > now())
            ORDER BY lower(coalesce(q.username, '')), q.id LIMIT 30 LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('the list''s read is answered from it', 'true',
  (position('profiles_under_sanction' in pg_temp.hb2i_plan()) > 0)::text) AS done \gset rh_
\endif

SELECT pg_temp.rh_verdict();
ROLLBACK;
