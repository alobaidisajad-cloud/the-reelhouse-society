-- ════════════════════════════════════════════════════════════════════════════
-- a_closed_ballots_voters_are_told_at_a_pace_rehearsal.sql — 20261122_63. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_closed_ballots_voters_are_told_at_a_pace_rehearsal.sql
--
-- 20261122_63 is applied on production (the train of 2026-11-24); this shows it still holds there, and on every sealed copy.
-- Member 1 files a ballot that members 2 to 6 vote in; 2 mutes 1 and 1 blocks 3, each
-- as themselves. The house closes it as freeze_closed_ballots does: no voter is told in that write, the
-- ballot waits on the list with its question, and the job is put on the schedule where the house keeps
-- its jobs. The job, run two voters at a time, tells 4, 5 and 6 once each, over three runs, with the words,
-- kind, author, metadata and group key the close always told; 2 and 3 are told nothing; a run after the
-- last tells no one again, and the job leaves the schedule once nothing waits. A second ballot, withheld
-- by the house after its first voter was told, is told to no one more; a ballot no one voted in is never
-- put on the list; the job tells 500 voters a run, and reads a ballot's voters by its key.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE bt_members ON COMMIT DROP AS
  SELECT u.id, p.username, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 6;
SELECT pg_temp.rh_need('six members in good standing', (SELECT count(*) FROM bt_members), 6) AS done \gset rh_
GRANT SELECT ON bt_members TO authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM bt_members) AND blocked_id IN (SELECT id FROM bt_members);

-- Member 1's ballots: the first voted in by 2 to 6, the second by 4 to 6, the third by no one; all open.
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, options, closes_at, is_published, created_at)
SELECT ('5eed0000-0000-4000-8000-0000000b0c6' || g)::uuid, 'ballot', m.id, m.username, 'Rehearsal ballot ' || g, 'Which of the two?',
       '["The first", "The second"]'::jsonb, now() + interval '1 day', true, now() - interval '2 days'
  FROM bt_members m, generate_series(1, 3) g WHERE m.n = 1;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
SELECT '5eed0000-0000-4000-8000-0000000b0c61'::uuid, m.id, m.n % 2 FROM bt_members m WHERE m.n BETWEEN 2 AND 6;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
SELECT '5eed0000-0000-4000-8000-0000000b0c62'::uuid, m.id, 0 FROM bt_members m WHERE m.n BETWEEN 4 AND 6;

-- 2 mutes the author; the author blocks 3. Each as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM bt_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM bt_members WHERE n = 2), (SELECT id FROM bt_members WHERE n = 1), 'mute');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM bt_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM bt_members WHERE n = 1), (SELECT id FROM bt_members WHERE n = 3), 'block');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- Any ballot of the house already waiting is told first, so the job's runs here are these ballots' alone.
DO $$
DECLARE k integer := 0;
BEGIN
  WHILE EXISTS (SELECT 1 FROM private.ballot_notices_waiting) AND k < 100000 LOOP
    k := k + 1;
    PERFORM private.closed_ballots_told();
  END LOOP;
END $$;

-- The ballots close, and the house freezes their counts, as freeze_closed_ballots does for each.
UPDATE public.dispatch_posts SET closes_at = now() - interval '1 minute' WHERE id::text LIKE '5eed0000-0000-4000-8000-0000000b0c6_';
UPDATE public.dispatch_posts SET frozen_totals = jsonb_build_object('total', 0, 'counts', '{}'::jsonb, 'frozen_at', now())
 WHERE id::text LIKE '5eed0000-0000-4000-8000-0000000b0c6_';

-- A job on the schedule, as its pace and command; 'no jobs' where the house keeps none, 'none' when it is not there.
CREATE FUNCTION pg_temp.bt_job(p_name text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN 'no jobs'; END IF;
  EXECUTE 'SELECT string_agg(j.schedule || '' '' || j.command, '', '') FROM cron.job j WHERE j.jobname = $1' INTO v USING p_name;
  RETURN coalesce(v, 'none');
END $f$;

-- The notices told of a planted ballot: each one, as  member n:message:kind:from 1:title:group key.
CREATE FUNCTION pg_temp.bt_told(p_post uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(m.n || ':' || x.message || ':' || x.type || ':' || (x.from_user_id = a.id)::text || ':'
                             || (x.metadata = jsonb_build_object('dispatch_post_id', p_post, 'kind', 'ballot', 'title', d.title))::text
                             || ':' || (x.group_key = 'endorse:post:' || p_post)::text, ', ' ORDER BY m.n), 'none')
    FROM public.notifications x
    JOIN bt_members m ON m.id = x.user_id
    JOIN public.dispatch_posts d ON d.id = p_post
    JOIN bt_members a ON a.n = 1
   WHERE x.metadata ->> 'dispatch_post_id' = p_post::text
$f$;

SELECT pg_temp.rh_case('closing a ballot tells no voter in that write', 'none',
  (SELECT pg_temp.bt_told('5eed0000-0000-4000-8000-0000000b0c61'))) AS done \gset rh_
SELECT pg_temp.rh_case('the ballot waits on the list with its question, its voters to be told from the first', 'Rehearsal ballot 1|true|true',
  coalesce((SELECT w.title || '|' || (w.author = (SELECT id FROM bt_members WHERE n = 1))::text || '|' || (w.after IS NULL)::text
              FROM private.ballot_notices_waiting w WHERE w.post_id = '5eed0000-0000-4000-8000-0000000b0c61'), 'not waiting')) AS done \gset rh_
SELECT pg_temp.rh_case('a ballot no one voted in is never put on the list', 'false',
  (EXISTS (SELECT 1 FROM private.ballot_notices_waiting w WHERE w.post_id = '5eed0000-0000-4000-8000-0000000b0c63'))::text) AS done \gset rh_
SELECT pg_temp.rh_case('the job is on the schedule, where the house keeps its jobs', 'true',
  (pg_temp.bt_job('the-closed-ballots-are-told') IN ('no jobs', '1 seconds SELECT private.closed_ballots_told();'))::text) AS done \gset rh_

-- The job, two voters a run, as many runs as the first ballot waits.
CREATE TEMP TABLE bt_runs (n integer, said text) ON COMMIT DROP;
DO $$
DECLARE k integer := 0;
BEGIN
  WHILE EXISTS (SELECT 1 FROM private.ballot_notices_waiting w WHERE w.post_id = '5eed0000-0000-4000-8000-0000000b0c61') AND k < 100000 LOOP
    k := k + 1;
    INSERT INTO bt_runs VALUES (k, private.closed_ballots_told(2));
    -- The second ballot is withheld by the house once its first voter is told.
    IF EXISTS (SELECT 1 FROM public.notifications x WHERE x.metadata ->> 'dispatch_post_id' = '5eed0000-0000-4000-8000-0000000b0c62')
       AND (SELECT withheld_at FROM public.dispatch_posts WHERE id = '5eed0000-0000-4000-8000-0000000b0c62') IS NULL THEN
      UPDATE public.dispatch_posts SET withheld_at = now() WHERE id = '5eed0000-0000-4000-8000-0000000b0c62';
    END IF;
  END LOOP;
END $$;

SELECT pg_temp.rh_case('the voters free of the author are told once each, as the close always told them',
  '4:The ballot “Rehearsal ballot 1” you voted in has closed.:ballot:true:true:true, '
  || '5:The ballot “Rehearsal ballot 1” you voted in has closed.:ballot:true:true:true, '
  || '6:The ballot “Rehearsal ballot 1” you voted in has closed.:ballot:true:true:true',
  (SELECT pg_temp.bt_told('5eed0000-0000-4000-8000-0000000b0c61'))) AS done \gset rh_
-- Five voters, two a run: the first two, the next two, the last; 2 and 3 among them, told nothing.
SELECT pg_temp.rh_case('told two voters a run, over three runs, each resumed after the last told', '3',
  (SELECT count(*)::text FROM bt_runs)) AS done \gset rh_
SELECT pg_temp.rh_case('a voter who muted the author, and one the author blocked, are told nothing', '0|0',
  (SELECT count(*)::text FROM public.notifications x WHERE x.user_id = (SELECT id FROM bt_members WHERE n = 2)
      AND x.metadata ->> 'dispatch_post_id' = '5eed0000-0000-4000-8000-0000000b0c61') || '|'
  || (SELECT count(*)::text FROM public.notifications x WHERE x.user_id = (SELECT id FROM bt_members WHERE n = 3)
      AND x.metadata ->> 'dispatch_post_id' = '5eed0000-0000-4000-8000-0000000b0c61')) AS done \gset rh_

-- Every ballot of the house waiting is told, then a run more: no voter is told twice.
DO $$
DECLARE k integer := 0;
BEGIN
  WHILE EXISTS (SELECT 1 FROM private.ballot_notices_waiting) AND k < 100000 LOOP
    k := k + 1;
    PERFORM private.closed_ballots_told();
  END LOOP;
END $$;
SELECT pg_temp.rh_case('a ballot the house withheld before its voters were all told is told to no one more', '1|false',
  (SELECT count(*)::text FROM public.notifications x WHERE x.metadata ->> 'dispatch_post_id' = '5eed0000-0000-4000-8000-0000000b0c62') || '|'
  || (EXISTS (SELECT 1 FROM private.ballot_notices_waiting w WHERE w.post_id = '5eed0000-0000-4000-8000-0000000b0c62'))::text) AS done \gset rh_
SELECT pg_temp.rh_case('a run after the last tells no one again', 'told 0, none waits|3',
  private.closed_ballots_told() || '|' || (SELECT count(*)::text FROM public.notifications x
                                             WHERE x.metadata ->> 'dispatch_post_id' = '5eed0000-0000-4000-8000-0000000b0c61')) AS done \gset rh_
SELECT pg_temp.rh_case('the job leaves the schedule once nothing waits', 'true',
  (pg_temp.bt_job('the-closed-ballots-are-told') IN ('no jobs', 'none'))::text) AS done \gset rh_
SELECT pg_temp.rh_case('the job tells 500 voters a run', 'p_voters integer DEFAULT 500',
  pg_get_function_arguments('private.closed_ballots_told(integer)'::regprocedure)) AS done \gset rh_

-- A ballot's next voters are one range of its key, whatever the house holds.
-- On a sealed copy alone (plan_checks, which e2e/db/rehearsals.mjs sets): a plan is chosen by statistics,
-- and a copy of production carries its rows without them; the Load's plan guards hold the bound at size.
\if :{?plan_checks}
SET LOCAL enable_seqscan = off;
CREATE FUNCTION pg_temp.bt_plan() RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT dv.user_id FROM public.dispatch_votes dv
                    WHERE dv.post_id = '5eed0000-0000-4000-8000-0000000b0c61'
                      AND dv.user_id > (SELECT m.id FROM bt_members m WHERE m.n = 1)
                    ORDER BY dv.user_id LIMIT 500 LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $f$;
SELECT pg_temp.rh_case('a ballot''s voters are read by its key, from the last told', 'true',
  (position('dispatch_votes_post_id_user_id_key' in (SELECT pg_temp.bt_plan())) > 0)::text) AS done \gset rh_
RESET enable_seqscan;
\endif

-- No member reads the list.
CREATE FUNCTION pg_temp.bt_member_reads() RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT m.id FROM bt_members m WHERE m.n = 2), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM count(*) FROM private.ballot_notices_waiting;
    v := 'read';
  EXCEPTION WHEN insufficient_privilege THEN v := 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;
SELECT pg_temp.rh_case('no member reads the list', 'refused', (SELECT pg_temp.bt_member_reads())) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
