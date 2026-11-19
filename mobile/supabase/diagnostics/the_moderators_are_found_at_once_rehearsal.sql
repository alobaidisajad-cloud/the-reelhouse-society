-- ════════════════════════════════════════════════════════════════════════════
-- the_moderators_are_found_at_once_rehearsal.sql — 20261120_26. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_moderators_are_found_at_once_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261120_26
-- alone, in its turn, and this checks it holds: the index is there and whole, and read through.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── H-B2's second index rehearsal · the house's moderators are found by their own index (review round 14) ──
-- Run inside its own rehearsal transaction, after rehearsal_kit.sql (an index built CONCURRENTLY is built
-- alone, by the train, before this). The index is there and whole, over the moderators alone; with the
-- plan's other ways shut, the question whether any moderator may hear an appeal is answered from it.
SELECT pg_temp.rh_case('the index of the house''s moderators is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.profiles_admins')), 'missing')) AS done \gset rh_
SELECT pg_temp.rh_case('it holds the moderators alone', 'true',
  (SELECT (pg_get_expr(i.indpred, i.indrelid) = '(role = ''admin''::text)')::text FROM pg_index i WHERE i.indexrelid = 'public.profiles_admins'::regclass)) AS done \gset rh_
SET LOCAL enable_seqscan = off;
CREATE FUNCTION pg_temp.hb2a_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; r record;
BEGIN
  v := '';
  FOR r IN EXPLAIN SELECT 1 FROM public.profiles p WHERE p.role = 'admin' AND p.id <> gen_random_uuid() LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('the moderators are read from it', 'true',
  (position('profiles_admins' in pg_temp.hb2a_plan()) > 0)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
