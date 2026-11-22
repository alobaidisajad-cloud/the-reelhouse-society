-- ════════════════════════════════════════════════════════════════════════════
-- a_ballots_votes_are_counted_as_they_are_cast_rehearsal.sql — 20261122_27. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_ballots_votes_are_counted_as_they_are_cast_rehearsal.sql --with-train
--
-- The train applies 20261122_27 here (with_train), every car before it already applied; a sealed copy
-- already holds it. On a ballot it plants, voted in by five members, as a voter: the tally says each
-- option's votes as the votes counted again say them; every ballot of the house is counted as its votes
-- are; a vote taken back is taken off its option, and an option left with none is no longer named; the
-- totals frozen when the ballot closes are the votes counted again; no member reads the counts
-- themselves; and the tally and the freeze read the counts, never the votes.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

\if :{?with_train}
\ir ../../../supabase/migrations/20261122_27_a_ballots_votes_are_counted_as_they_are_cast.sql
\endif
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE bc_members ON COMMIT DROP AS
  SELECT u.id, p.username, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 6;
SELECT pg_temp.rh_need('six members in good standing', (SELECT count(*) FROM bc_members), 6) AS done \gset rh_
GRANT SELECT ON bc_members TO anon, authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM bc_members) AND blocked_id IN (SELECT id FROM bc_members);

-- Member 1's ballot of four, open; members 2 to 6 vote: three for the first, one each for the second and third.
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, options, closes_at, created_at)
SELECT '5eed0000-0000-4000-8000-0000000b0c27'::uuid, 'ballot', m.id, m.username, 'A rehearsal ballot', 'Which of the four?',
       '["The first", "The second", "The third", "The fourth"]'::jsonb, now() + interval '1 day', now()
  FROM bc_members m WHERE m.n = 1;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
SELECT '5eed0000-0000-4000-8000-0000000b0c27'::uuid, m.id, CASE m.n WHEN 5 THEN 1 WHEN 6 THEN 2 ELSE 0 END
  FROM bc_members m WHERE m.n BETWEEN 2 AND 6;

-- The ballot's votes counted again, as the tally said them before this car.
CREATE FUNCTION pg_temp.bc_recount(p_post uuid) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('total', COALESCE(sum(t.n), 0),
                            'counts', COALESCE(jsonb_object_agg(t.option_index, t.n) FILTER (WHERE t.option_index IS NOT NULL), '{}'::jsonb))
    FROM (SELECT option_index, count(*) AS n FROM public.dispatch_votes WHERE post_id = p_post GROUP BY option_index) t
$f$;
-- The tally, as member 2 (a voter) reads it.
CREATE FUNCTION pg_temp.bc_tally(p_post uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT m.id FROM bc_members m WHERE m.n = 2), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := public.ballot_tally(p_post);
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;

SELECT pg_temp.rh_case('the tally says each option''s votes as the votes counted again say them', '{"total": 5, "counts": {"0": 3, "1": 1, "2": 1}}',
  (SELECT pg_temp.bc_tally('5eed0000-0000-4000-8000-0000000b0c27'))::text) AS done \gset rh_
SELECT pg_temp.rh_case('every ballot of the house is counted as its votes are', 'none',
  coalesce((SELECT string_agg(x.post_id::text || ':' || x.option_index, ', ')
              FROM ((SELECT post_id, option_index, count(*)::integer AS n FROM public.dispatch_votes GROUP BY 1, 2
                     EXCEPT SELECT post_id, option_index, n FROM private.ballot_counts WHERE n > 0)
                    UNION ALL
                    (SELECT post_id, option_index, n FROM private.ballot_counts WHERE n > 0
                     EXCEPT SELECT post_id, option_index, count(*)::integer FROM public.dispatch_votes GROUP BY 1, 2)) x), 'none')) AS done \gset rh_

-- Member 6's vote taken back, as their leaving takes it: the third option is left with none.
DELETE FROM public.dispatch_votes WHERE post_id = '5eed0000-0000-4000-8000-0000000b0c27' AND user_id = (SELECT id FROM bc_members WHERE n = 6);
SELECT pg_temp.rh_case('a vote taken back is taken off its option, and an option left with none is not named', '{"total": 4, "counts": {"0": 3, "1": 1}}|true',
  (SELECT pg_temp.bc_tally('5eed0000-0000-4000-8000-0000000b0c27'))::text || '|'
    || ((SELECT pg_temp.bc_tally('5eed0000-0000-4000-8000-0000000b0c27')) = (SELECT pg_temp.bc_recount('5eed0000-0000-4000-8000-0000000b0c27')))::text) AS done \gset rh_

-- The ballot closes: the totals frozen are the votes counted again.
UPDATE public.dispatch_posts SET closes_at = now() - interval '1 minute' WHERE id = '5eed0000-0000-4000-8000-0000000b0c27';
SELECT public.freeze_closed_ballots() AS done \gset rh_
SELECT pg_temp.rh_case('the totals frozen when the ballot closes are its votes counted again', 'true',
  ((SELECT frozen_totals - 'frozen_at' FROM public.dispatch_posts WHERE id = '5eed0000-0000-4000-8000-0000000b0c27')
     = (SELECT pg_temp.bc_recount('5eed0000-0000-4000-8000-0000000b0c27')))::text) AS done \gset rh_

-- No member reads the counts themselves.
CREATE FUNCTION pg_temp.bc_member_reads() RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT m.id FROM bc_members m WHERE m.n = 2), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM count(*) FROM private.ballot_counts;
    v := 'read';
  EXCEPTION WHEN insufficient_privilege THEN v := 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;
SELECT pg_temp.rh_case('no member reads the counts themselves', 'refused', (SELECT pg_temp.bc_member_reads())) AS done \gset rh_
SELECT pg_temp.rh_case('the tally and the freeze read the counts, never the votes', 'true|true|false|false',
  (position('private.ballot_counts' in pg_get_functiondef('public.ballot_tally(uuid)'::regprocedure)) > 0)::text || '|'
    || (position('private.ballot_counts' in pg_get_functiondef('public.freeze_closed_ballots()'::regprocedure)) > 0)::text || '|'
    || (position('count(*) AS n FROM public.dispatch_votes' in pg_get_functiondef('public.ballot_tally(uuid)'::regprocedure)) > 0)::text || '|'
    || (position('FROM public.dispatch_votes GROUP BY' in pg_get_functiondef('public.freeze_closed_ballots()'::regprocedure)) > 0)::text) AS done \gset rh_
-- A table never analysed holds reltuples -1; once analysed, the rows it counted.
SELECT pg_temp.rh_case('the counts are analysed', 'true',
  coalesce((SELECT (reltuples >= 0)::text FROM pg_class WHERE oid = to_regclass('private.ballot_counts')), 'missing')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
