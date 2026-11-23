-- ════════════════════════════════════════════════════════════════════════════
-- the_stacks_open_to_all_are_read_newest_first_rehearsal.sql — 20261122_65. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_stacks_open_to_all_are_read_newest_first_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_65
-- alone, in its turn, and this checks it holds: the index is there and whole; in a house of thousands of
-- stacks the ones open to all are read newest first from an index's top, never sorted; and of three
-- planted stacks, the one marked open and the one marked neither way are read, and the private one is not.
-- The plan is asked of a house this file lays down (a table made like lists, with every one of its indexes,
-- and its own statistics): production's few stacks let its planner gather and sort them as cheaply, and
-- the bound is what the index keeps as stacks pile up.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the stacks open to all is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.lists_open_newest')), 'missing')) AS done \gset rh_

CREATE TEMP TABLE so_member ON COMMIT DROP AS
  SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a member', (SELECT count(*) FROM so_member), 1) AS done \gset rh_
-- Three stacks: marked open, marked neither way, and private.
INSERT INTO public.lists (id, user_id, title, description, is_private)
SELECT ('5eed0000-0000-4000-8000-0000000b0c6' || g)::uuid, m.id, 'Rehearsal stack ' || g, 'A rehearsal stack.',
       CASE g WHEN 5 THEN false WHEN 6 THEN NULL ELSE true END
  FROM so_member m, generate_series(5, 7) g;

-- A house of 5,000 stacks, one in ten private and one in ten marked neither way: made like lists with every
-- index it holds, this car's among them, and its statistics taken.
CREATE TEMP TABLE so_house (LIKE public.lists INCLUDING DEFAULTS INCLUDING INDEXES) ON COMMIT DROP;
INSERT INTO so_house (id, user_id, title, description, is_private, created_at)
SELECT gen_random_uuid(), gen_random_uuid(), 'Stack ' || g, 'A stack.', CASE g % 10 WHEN 0 THEN true WHEN 1 THEN NULL ELSE false END,
       now() - g * interval '1 minute'
  FROM generate_series(1, 5000) g;
ANALYZE so_house;
CREATE FUNCTION pg_temp.so_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT n.id FROM so_house n
                    WHERE n.is_private IS NOT TRUE AND n.created_at < now() + interval '1 day'
                    ORDER BY n.created_at DESC, n.id DESC LIMIT 24 LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('the stacks open to all are read newest first from an index''s top, never sorted', 'true|false',
  (position('Index Cond: (created_at < ' in (SELECT pg_temp.so_plan())) > 0
   AND position('Seq Scan' in (SELECT pg_temp.so_plan())) = 0 AND position('Bitmap' in (SELECT pg_temp.so_plan())) = 0)::text || '|'
    || (position('Sort' in replace((SELECT pg_temp.so_plan()), 'Incremental Sort', '')) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the stacks marked open and marked neither way are read, and not the private one', '5eed0000-0000-4000-8000-0000000b0c65,5eed0000-0000-4000-8000-0000000b0c66',
  (SELECT string_agg(n.id::text, ',' ORDER BY n.id) FROM public.lists n
    WHERE n.is_private IS NOT TRUE AND n.id::text LIKE '5eed0000-0000-4000-8000-0000000b0c6_')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
