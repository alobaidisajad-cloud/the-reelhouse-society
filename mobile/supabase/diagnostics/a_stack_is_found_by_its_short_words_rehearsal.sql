-- ════════════════════════════════════════════════════════════════════════════
-- a_stack_is_found_by_its_short_words_rehearsal.sql — 20261122_13. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_stack_is_found_by_its_short_words_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_13
-- alone, in its turn, and this checks it holds: the index is there and whole, over the open stacks, and a
-- stack planted with a rare pair of letters is found through it, a private one never.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the stacks'' short words is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.lists_short_grams')), 'missing')) AS done \gset rh_
SELECT pg_temp.rh_case('it holds the open stacks alone', 'true',
  (SELECT (pg_get_expr(i.indpred, i.indrelid) = '(is_private = false)')::text FROM pg_index i WHERE i.indexrelid = 'public.lists_short_grams'::regclass)) AS done \gset rh_

-- Two stacks of a member, one open and one private, each holding a pair of letters no other stack holds.
CREATE TEMP TABLE ssw_member ON COMMIT DROP AS
  SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a member', (SELECT count(*) FROM ssw_member), 1) AS done \gset rh_
CREATE TEMP TABLE ssw_stacks ON COMMIT DROP AS SELECT gen_random_uuid() AS id, w AS what FROM unnest(ARRAY['open', 'private']) w;
INSERT INTO public.lists (id, user_id, title, description, is_private)
SELECT s.id, (SELECT id FROM ssw_member), 'rh ' || s.what, 'Holds ǂǁ, a pair no other stack holds.', s.what = 'private' FROM ssw_stacks s;

-- That the searches read by it at every size is the load lab's to show (probe.mjs, each search held to
-- its index): a house this small is read whole by any plan.
SELECT pg_temp.rh_case('it holds each stack under the pieces of its title and description', 'true',
  (position('private.search_grams(title, description)' in pg_get_indexdef('public.lists_short_grams'::regclass)) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the open stack holding it is found, the private one never', 'open',
  (SELECT string_agg(s.what, ',') FROM public.lists l JOIN ssw_stacks s ON s.id = l.id
    WHERE l.is_private = false AND private.search_grams(l.title, l.description) @> ARRAY['ǂǁ'])) AS done \gset rh_
-- A stack's words changed are found by their new pieces, never by their old.
UPDATE public.lists SET description = 'Holds ǁǂ now.' WHERE id = (SELECT id FROM ssw_stacks WHERE what = 'open');
SELECT pg_temp.rh_case('a stack retitled is found by its new pair, not its old', '0|1',
  (SELECT count(*) FILTER (WHERE private.search_grams(l.title, l.description) @> ARRAY['ǂǁ'])::text || '|'
          || count(*) FILTER (WHERE private.search_grams(l.title, l.description) @> ARRAY['ǁǂ'])::text
     FROM public.lists l JOIN ssw_stacks s ON s.id = l.id WHERE l.is_private = false)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
