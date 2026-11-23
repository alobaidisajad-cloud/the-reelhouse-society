-- ════════════════════════════════════════════════════════════════════════════
-- the_newest_salons_are_read_first_rehearsal.sql — 20261122_16. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_newest_salons_are_read_first_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_16
-- alone, in its turn, and this checks it holds: the index is there and whole, and the corridor's newest
-- salons are read from its front, a salon planted newest first among them.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the newest salons is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.lounges_newest')), 'missing')) AS done \gset rh_

-- A salon of a member's, made now: the newest of the house.
CREATE TEMP TABLE nsr_salon ON COMMIT DROP AS SELECT gen_random_uuid() AS id;
INSERT INTO public.lounges (id, name, creator_id, is_private)
SELECT (SELECT id FROM nsr_salon), 'rh the newest', u.id, false FROM auth.users u JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a salon planted', (SELECT count(*) FROM public.lounges WHERE id = (SELECT id FROM nsr_salon)), 1) AS done \gset rh_

-- On a sealed copy alone (plan_checks, which e2e/db/rehearsals.mjs sets): a plan is chosen by statistics,
-- and a copy of production carries its rows without them; the Load's plan guards hold the bound at size.
\if :{?plan_checks}
SET LOCAL enable_seqscan = off;
CREATE FUNCTION pg_temp.nsr_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT l.id FROM public.lounges l ORDER BY l.created_at DESC LIMIT 50 LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('the newest fifty are read from its front, unsorted', 'true|false',
  (position('lounges_newest' in pg_temp.nsr_plan()) > 0)::text || '|' || (position('Sort' in pg_temp.nsr_plan()) > 0)::text) AS done \gset rh_
\endif
SELECT pg_temp.rh_case('the salon made now is the first of them', 'true',
  ((SELECT l.id FROM public.lounges l ORDER BY l.created_at DESC, l.id DESC LIMIT 1) = (SELECT id FROM nsr_salon))::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
