-- ════════════════════════════════════════════════════════════════════════════
-- a_stacks_films_are_read_in_their_order_rehearsal.sql — 20261126_00. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_stacks_films_are_read_in_their_order_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261126_00
-- alone, in its turn, and this checks it holds: the index is there and whole, on a stack's films in the order
-- its page draws them; a planted stack's films are read in that order, those with no rank last, and past a
-- film read, the films after it, as the app asks for them; in a house where one stack holds 20,000 films, each
-- of the stack's reads takes its rows from the index's place for the stack and stops at its limit, never sorted.
-- The plan is asked of a house this file lays down (a table made like list_items, with every one of its
-- indexes, and its own statistics): a plan is chosen by statistics, and the bound is what the index keeps as
-- a stack grows.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of a stack''s films in their order is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.list_items_in_order')), 'missing')) AS done \gset rh_
SELECT pg_temp.rh_case('it holds a stack''s films by rank, then when added, then the film', 'list_id, rank_position, created_at, film_id',
  coalesce((SELECT substring(pg_get_indexdef(to_regclass('public.list_items_in_order')) FROM '\((.*)\)$')), 'missing')) AS done \gset rh_

CREATE TEMP TABLE so_member ON COMMIT DROP AS
  SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a member', (SELECT count(*) FROM so_member), 1) AS done \gset rh_
-- A stack of six films: ranks 2, 0, 1, a tie at rank 1 added later, and two with no rank.
INSERT INTO public.lists (id, user_id, title, description, is_private)
SELECT '5eed0000-0000-4000-8000-0000000b0d01'::uuid, m.id, 'Rehearsal stack', 'A rehearsal stack.', false FROM so_member m;
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position, created_at)
VALUES ('5eed0000-0000-4000-8000-0000000b0d01', 901, 'Film 901', 2, '2026-01-01T00:00:01Z'),
       ('5eed0000-0000-4000-8000-0000000b0d01', 902, 'Film 902', 0, '2026-01-01T00:00:02Z'),
       ('5eed0000-0000-4000-8000-0000000b0d01', 903, 'Film 903', 1, '2026-01-01T00:00:03Z'),
       ('5eed0000-0000-4000-8000-0000000b0d01', 904, 'Film 904', 1, '2026-01-01T00:00:04Z'),
       ('5eed0000-0000-4000-8000-0000000b0d01', 905, 'Film 905', NULL, '2026-01-01T00:00:05Z'),
       ('5eed0000-0000-4000-8000-0000000b0d01', 906, 'Film 906', NULL, '2026-01-01T00:00:06Z');
SELECT pg_temp.rh_case('a stack''s films are read in its order, those with no rank last', '902,903,904,901,905,906',
  (SELECT string_agg(i.film_id::text, ',' ORDER BY i.rank_position, i.created_at, i.film_id) FROM public.list_items i
    WHERE i.list_id = '5eed0000-0000-4000-8000-0000000b0d01')) AS done \gset rh_
-- Past film 903 as it was read (rank 1, its moment, its film): the rest of its rank, the later ranks, then no rank.
SELECT pg_temp.rh_case('past a film read, the films after it, as the app asks for them', '904|901|905,906',
  (SELECT string_agg(i.film_id::text, ',' ORDER BY i.created_at, i.film_id) FROM public.list_items i
    WHERE i.list_id = '5eed0000-0000-4000-8000-0000000b0d01' AND i.rank_position = 1 AND i.created_at >= '2026-01-01T00:00:03Z'
      AND (i.created_at > '2026-01-01T00:00:03Z' OR (i.created_at = '2026-01-01T00:00:03Z' AND i.film_id > 903)))
  || '|' || (SELECT string_agg(i.film_id::text, ',' ORDER BY i.rank_position, i.created_at, i.film_id) FROM public.list_items i
    WHERE i.list_id = '5eed0000-0000-4000-8000-0000000b0d01' AND i.rank_position > 1)
  || '|' || (SELECT string_agg(i.film_id::text, ',' ORDER BY i.created_at, i.film_id) FROM public.list_items i
    WHERE i.list_id = '5eed0000-0000-4000-8000-0000000b0d01' AND i.rank_position IS NULL)) AS done \gset rh_

-- On a sealed copy alone (plan_checks, which e2e/db/rehearsals.mjs sets): a plan is chosen by statistics,
-- and a copy of production carries its rows without them; the Load's plan guards hold the bound at size.
\if :{?plan_checks}
-- A house of 2,000 stacks of 20 films, and one stack of 20,000: made like list_items with every index it
-- holds, this car's among them, and its statistics taken.
CREATE TEMP TABLE so_house (LIKE public.list_items INCLUDING DEFAULTS INCLUDING INDEXES) ON COMMIT DROP;
INSERT INTO so_house (list_id, film_id, film_title, rank_position, created_at)
SELECT ('00000000-0000-4000-8000-' || lpad(s::text, 12, '0'))::uuid, f, 'Film ' || f, f, now() - f * interval '1 second'
  FROM generate_series(1, 2000) s, generate_series(1, 20) f;
INSERT INTO so_house (list_id, film_id, film_title, rank_position, created_at)
SELECT '5eed0000-0000-4000-8000-0000000b0d02'::uuid, f, 'Film ' || f, f, now() - f * interval '1 second'
  FROM generate_series(1, 20000) f;
ANALYZE so_house;
CREATE FUNCTION pg_temp.so_plan(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXECUTE 'EXPLAIN ' || q LOOP v := v || r."QUERY PLAN" || ' '; END LOOP;
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.so_ranged(q text) RETURNS text LANGUAGE sql AS $$
  SELECT (position('Index Cond: ((list_id = ' in pg_temp.so_plan(q)) > 0 AND position('Seq Scan' in pg_temp.so_plan(q)) = 0
          AND position('Bitmap' in pg_temp.so_plan(q)) = 0)::text || '|'
      || (position('Sort' in replace(pg_temp.so_plan(q), 'Incremental Sort', '')) > 0)::text
$$;
SELECT pg_temp.rh_case('the order of a long stack''s first 1,000 films is read from the index''s place for it, never sorted', 'true|false',
  pg_temp.so_ranged($q$SELECT film_id, rank_position, created_at FROM so_house WHERE list_id = '5eed0000-0000-4000-8000-0000000b0d02'
    ORDER BY rank_position, created_at, film_id LIMIT 1000$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('its later ranks, past a film read, are a range of the index, never sorted', 'true|false',
  pg_temp.so_ranged($q$SELECT film_id FROM so_house WHERE list_id = '5eed0000-0000-4000-8000-0000000b0d02' AND rank_position > 10000
    ORDER BY rank_position, created_at, film_id LIMIT 500$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('the rest of a film''s rank, past it, is a range of the index, never sorted', 'true|false',
  pg_temp.so_ranged($q$SELECT film_id FROM so_house WHERE list_id = '5eed0000-0000-4000-8000-0000000b0d02' AND rank_position = 10000
    AND created_at >= now() - interval '1 day' ORDER BY created_at, film_id LIMIT 500$q$)) AS done \gset rh_
\endif

SELECT pg_temp.rh_verdict();
ROLLBACK;
