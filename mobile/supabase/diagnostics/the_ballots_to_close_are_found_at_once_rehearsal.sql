-- ════════════════════════════════════════════════════════════════════════════
-- the_ballots_to_close_are_found_at_once_rehearsal.sql — 20261122_28. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_ballots_to_close_are_found_at_once_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_28
-- alone, in its turn, and this checks it holds: the index is there and whole, the closing ballots are read
-- as one range of it, and of two planted ballots past their close, the one not yet frozen is found through
-- it and the one already frozen is not.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the ballots to close is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.dispatch_posts_ballots_to_close')), 'missing')) AS done \gset rh_

CREATE TEMP TABLE btc_member ON COMMIT DROP AS
  SELECT u.id, p.username FROM auth.users u JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a member', (SELECT count(*) FROM btc_member), 1) AS done \gset rh_
-- Two ballots past their close: the first not yet frozen, the second frozen.
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, options, closes_at, created_at)
SELECT ('5eed0000-0000-4000-8000-0000000b0c2' || g)::uuid, 'ballot', m.id, m.username, 'A rehearsal ballot ' || g, 'Which?',
       '["The first", "The second"]'::jsonb, now() + interval '1 day', now()
  FROM btc_member m, generate_series(8, 9) g;
UPDATE public.dispatch_posts SET closes_at = now() - interval '1 minute' WHERE id IN ('5eed0000-0000-4000-8000-0000000b0c28', '5eed0000-0000-4000-8000-0000000b0c29');
UPDATE public.dispatch_posts SET frozen_totals = '{"total": 0, "counts": {}}'::jsonb WHERE id = '5eed0000-0000-4000-8000-0000000b0c29';

SET LOCAL enable_seqscan = off;
CREATE FUNCTION pg_temp.btc_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT p.id FROM public.dispatch_posts p
                    WHERE p.kind = 'ballot' AND p.closes_at <= now() AND p.frozen_totals IS NULL AND p.ended_at IS NULL LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('the closing ballots are read as one range of it', 'true',
  (position('dispatch_posts_ballots_to_close' in (SELECT pg_temp.btc_plan())) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the ballot past its close and not yet frozen is found, and not the frozen one', 'true|false',
  (EXISTS (SELECT 1 FROM public.dispatch_posts p WHERE p.id = '5eed0000-0000-4000-8000-0000000b0c28'
             AND p.kind = 'ballot' AND p.closes_at <= now() AND p.frozen_totals IS NULL AND p.ended_at IS NULL))::text || '|'
    || (EXISTS (SELECT 1 FROM public.dispatch_posts p WHERE p.id = '5eed0000-0000-4000-8000-0000000b0c29'
             AND p.kind = 'ballot' AND p.closes_at <= now() AND p.frozen_totals IS NULL AND p.ended_at IS NULL))::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
