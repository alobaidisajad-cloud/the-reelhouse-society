-- ════════════════════════════════════════════════════════════════════════════
-- critiques_are_paced_as_a_person_writes_rehearsal.sql — 20261120_08. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs critiques_are_paced_as_a_person_writes_rehearsal.sql --with-train
--
-- The train applies 20261120_08 here (with_train), 20261120_00 to 20261120_07 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 14).
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 4) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE ha3_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
CREATE TEMP TABLE ha3_hint (k text PRIMARY KEY, hint text) ON COMMIT DROP;
CREATE TEMP TABLE ha3_queued (n serial, what text, queued bigint) ON COMMIT DROP;
GRANT SELECT ON ha3_ids TO authenticated;
GRANT ALL ON ha3_hint TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_08_critiques_are_paced_as_a_person_writes.sql
\endif

-- ── H-A3.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A3's triggers rehearsal · a member's critiques are paced as a person writes; a critique buzzes a phone once (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-A3.table, H-A3.up
-- and H-A3.locks applied; pg_temp.rh_case, rolled back with the rest), with its rehearsal_members
-- (n = 1..4). Everything happens at one moment (now() stands still in a transaction), so each case is
-- the rule itself, not a second waited.
-- 2 keeps a record, a stack and a take. Member 1, as themselves: files 20 critiques on 2's record at
-- once: each lands, 2 is told of each, and 2's phone is pushed once; the 21st is refused RH429 'target'
-- with the hour to wait, and so is one filed after deleting another (counted as they are filed); one
-- sent again by its own id, already filed, lands and is not counted. 1 critiques 2's stack: it lands
-- and is not pushed again (one push an hour to one member); nine more land and the next is refused RH429 'member' with 20 seconds
-- to wait, costing nothing. A minute on, three more land. 3 critiques 2's take twice: told twice, pushed
-- once; an hour on, pushed again. 4 at the day's 500 is refused ('day') until the house's midnight. The
-- house's own critique is not paced.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'privacy_annotations' - 'notif_comments'
 WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.house_settings SET pushes_sent = true;
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members) AND target LIKE 'critique:%';
DELETE FROM public.certifications_pushed
 WHERE from_user_id = ANY (ARRAY(SELECT id FROM rehearsal_members)) AND thing LIKE 'critique_to:%';

WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, status)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990000431, 'rh H-A3 film', current_date, 'watched') RETURNING id)
INSERT INTO ha3_ids SELECT 'record', id FROM made;
WITH made AS (INSERT INTO public.lists (user_id, title, is_private)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'rh H-A3 stack', false) RETURNING id)
INSERT INTO ha3_ids SELECT 'stack', id FROM made;
WITH made AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
              VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 2),
                      (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2)),
                      'rh H-A3 take', true) RETURNING id)
INSERT INTO ha3_ids SELECT 'take', id FROM made;

-- A member acts as themselves: 'ok', or the refusal as code|message|detail, its hint kept under p_k.
CREATE FUNCTION pg_temp.ha3_as(p_member bigint, p_sql text, p_k text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_code text; v_msg text; v_detail text; v_hint text; v_out text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    v_out := v_code || '|' || v_msg || '|' || coalesce(v_detail, '');
    IF p_k IS NOT NULL THEN INSERT INTO ha3_hint VALUES (p_k, v_hint); END IF;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;
-- A critique, as each phone files it: on 2's record, stack or take, under a fresh id (or the one given).
CREATE FUNCTION pg_temp.ha3_on(p_member bigint, p_what text, p_id uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT CASE p_what
    WHEN 'record' THEN format('INSERT INTO public.log_comments (id, log_id, user_id, username, body) VALUES (%L, %L, %L, %L, %L) ON CONFLICT (id) DO NOTHING',
      coalesce(p_id, gen_random_uuid()), (SELECT id FROM ha3_ids WHERE what = 'record'), m.id, p.username, 'rh H-A3 critique')
    WHEN 'stack' THEN format('INSERT INTO public.list_comments (id, list_id, user_id, content) VALUES (%L, %L, %L, %L)',
      coalesce(p_id, gen_random_uuid()), (SELECT id FROM ha3_ids WHERE what = 'stack'), m.id, 'rh H-A3 critique')
    WHEN 'take' THEN format('INSERT INTO public.dispatch_comments (id, post_id, user_id, author_username, body) VALUES (%L, %L, %L, %L, %L)',
      coalesce(p_id, gen_random_uuid()), (SELECT id FROM ha3_ids WHERE what = 'take'), m.id, p.username, 'rh H-A3 critique')
  END
  FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = p_member;
$$;
-- n critiques at one moment: the distinct answers, joined.
CREATE FUNCTION pg_temp.ha3_many(p_member bigint, p_what text, p_n integer) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(DISTINCT r, ',') FROM (SELECT pg_temp.ha3_as(p_member, pg_temp.ha3_on(p_member, p_what)) AS r FROM generate_series(1, p_n)) a;
$$;
-- The pushes queued so far, marked after each step; and how many a step queued.
CREATE FUNCTION pg_temp.ha3_mark(p_what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO ha3_queued (what, queued) SELECT p_what, count(*) FROM net.http_request_queue;
$$;
CREATE FUNCTION pg_temp.ha3_pushed(p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT (q.queued - (SELECT b.queued FROM ha3_queued b WHERE b.n < q.n ORDER BY b.n DESC LIMIT 1))::text
    FROM ha3_queued q WHERE q.what = p_what;
$$;
-- The critique notices one member holds from another.
CREATE FUNCTION pg_temp.ha3_told(p_from bigint, p_to bigint) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.notifications
   WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_to)
     AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = p_from) AND type = 'comment';
$$;
CREATE FUNCTION pg_temp.ha3_room(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT tokens::text || '|' || n::text FROM public.critique_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;
DELETE FROM public.notifications
 WHERE user_id = ANY (ARRAY(SELECT id FROM rehearsal_members)) AND from_user_id = ANY (ARRAY(SELECT id FROM rehearsal_members)) AND type = 'comment';

-- ── one record, critiqued again and again ──
SELECT pg_temp.ha3_mark('before') AS done \gset rh_
SELECT pg_temp.rh_case('a member files twenty critiques on one record at one moment: each lands', 'ok',
  pg_temp.ha3_many(1, 'record', 20)) AS done \gset rh_
SELECT pg_temp.ha3_mark('1 on the record') AS done \gset rh_
SELECT pg_temp.rh_case('the twenty are held', '20',
  (SELECT count(*)::text FROM public.log_comments WHERE log_id = (SELECT id FROM ha3_ids WHERE what = 'record'))) AS done \gset rh_
SELECT pg_temp.rh_case('its keeper is told of each', '20', pg_temp.ha3_told(1, 2)) AS done \gset rh_
SELECT pg_temp.rh_case('and their phone is pushed once', '1', pg_temp.ha3_pushed('1 on the record')) AS done \gset rh_
SELECT pg_temp.rh_case('the push remembered for the critic and the member', '1',
  (SELECT count(*)::text FROM public.certifications_pushed
    WHERE from_user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
      AND thing = 'critique_to:' || (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_
SELECT pg_temp.rh_case('the twenty-first on that record within the hour is refused, as that one piece', 'RH429|RATE_LIMITED|target',
  pg_temp.ha3_as(1, pg_temp.ha3_on(1, 'record'), 'record')) AS done \gset rh_
SELECT pg_temp.rh_case('with the hour to wait', '3600', (SELECT hint FROM ha3_hint WHERE k = 'record')) AS done \gset rh_
INSERT INTO ha3_ids SELECT 'a filed critique', id FROM public.log_comments
 WHERE log_id = (SELECT id FROM ha3_ids WHERE what = 'record') ORDER BY id LIMIT 1;
SELECT pg_temp.rh_case('deleting one and filing again is refused the same: they are counted as filed', 'ok|RH429|RATE_LIMITED|target',
  pg_temp.ha3_as(1, format('DELETE FROM public.log_comments WHERE id = %L', (SELECT id FROM ha3_ids WHERE what = 'a filed critique')))
  || '|' || pg_temp.ha3_as(1, pg_temp.ha3_on(1, 'record'))) AS done \gset rh_
INSERT INTO ha3_ids SELECT 'another filed critique', id FROM public.log_comments
 WHERE log_id = (SELECT id FROM ha3_ids WHERE what = 'record') ORDER BY id LIMIT 1;
SELECT pg_temp.rh_case('a critique sent again by its own id, already filed, lands and is not counted', 'ok|10|20',
  pg_temp.ha3_as(1, pg_temp.ha3_on(1, 'record', (SELECT id FROM ha3_ids WHERE what = 'another filed critique'))) || '|' || pg_temp.ha3_room(1)) AS done \gset rh_

-- ── the member's own room ──
SELECT pg_temp.rh_case('the same member critiques the stack: it lands', 'ok', pg_temp.ha3_many(1, 'stack', 1)) AS done \gset rh_
SELECT pg_temp.ha3_mark('1 on the stack') AS done \gset rh_
SELECT pg_temp.rh_case('and does not push again: one push an hour from one member to another', '0', pg_temp.ha3_pushed('1 on the stack')) AS done \gset rh_
SELECT pg_temp.rh_case('nine more land, the member''s room spent', 'ok|0|30',
  pg_temp.ha3_many(1, 'stack', 9) || '|' || pg_temp.ha3_room(1)) AS done \gset rh_
SELECT pg_temp.rh_case('the next is refused, as the member''s own pace', 'RH429|RATE_LIMITED|member',
  pg_temp.ha3_as(1, pg_temp.ha3_on(1, 'take'), 'room')) AS done \gset rh_
SELECT pg_temp.rh_case('with twenty seconds to wait', '20', (SELECT hint FROM ha3_hint WHERE k = 'room')) AS done \gset rh_
SELECT pg_temp.rh_case('and the refusal cost nothing', '0|30', pg_temp.ha3_room(1)) AS done \gset rh_
SELECT pg_temp.rh_case('nor was the critique filed', '0',
  (SELECT count(*)::text FROM public.dispatch_comments WHERE post_id = (SELECT id FROM ha3_ids WHERE what = 'take')
     AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1))) AS done \gset rh_
UPDATE public.critique_budget SET refilled_at = now() - interval '1 minute'
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
SELECT pg_temp.rh_case('a minute on, three more land and a fourth waits', 'ok|RH429|RATE_LIMITED|member',
  pg_temp.ha3_many(1, 'stack', 3) || '|' || pg_temp.ha3_as(1, pg_temp.ha3_on(1, 'stack'))) AS done \gset rh_

-- ── a filing, critiqued twice, and again an hour on ──
SELECT pg_temp.ha3_mark('before the take') AS done \gset rh_
SELECT pg_temp.rh_case('another member critiques the take: it lands', 'ok', pg_temp.ha3_many(3, 'take', 1)) AS done \gset rh_
SELECT pg_temp.ha3_mark('3 on the take') AS done \gset rh_
SELECT pg_temp.rh_case('and is pushed', '1', pg_temp.ha3_pushed('3 on the take')) AS done \gset rh_
SELECT pg_temp.rh_case('a second critique of it lands', 'ok', pg_temp.ha3_many(3, 'take', 1)) AS done \gset rh_
SELECT pg_temp.ha3_mark('3 again on the take') AS done \gset rh_
SELECT pg_temp.rh_case('it is told', '2', pg_temp.ha3_told(3, 2)) AS done \gset rh_
SELECT pg_temp.rh_case('and not pushed again within the hour', '0', pg_temp.ha3_pushed('3 again on the take')) AS done \gset rh_
UPDATE public.certifications_pushed SET pushed_at = now() - interval '61 minutes'
 WHERE from_user_id = (SELECT id FROM rehearsal_members WHERE n = 3) AND thing LIKE 'critique_to:%';
SELECT pg_temp.rh_case('an hour on, another critique of it lands', 'ok', pg_temp.ha3_many(3, 'take', 1)) AS done \gset rh_
SELECT pg_temp.ha3_mark('3 an hour on') AS done \gset rh_
SELECT pg_temp.rh_case('and is pushed again', '1', pg_temp.ha3_pushed('3 an hour on')) AS done \gset rh_

-- ── a day's ceiling, and the house's own write ──
INSERT INTO public.critique_budget (user_id, tokens, refilled_at, day, n, swept_at)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 4), 30, now(), (now() AT TIME ZONE 'UTC')::date, 500, now());
SELECT pg_temp.rh_case('a member at the day''s 500 critiques is refused, as the day''s ceiling', 'RH429|RATE_LIMITED|day',
  pg_temp.ha3_as(4, pg_temp.ha3_on(4, 'record'), 'day')) AS done \gset rh_
SELECT pg_temp.rh_case('until the house''s midnight', ceil(extract(epoch FROM (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC') - now()))::integer::text,
  (SELECT hint FROM ha3_hint WHERE k = 'day')) AS done \gset rh_
UPDATE public.critique_budget SET day = day - 1 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
SELECT pg_temp.rh_case('the next day, the count starts again and the critique lands', 'ok|29|1',
  pg_temp.ha3_as(4, pg_temp.ha3_on(4, 'record')) || '|' || pg_temp.ha3_room(4)) AS done \gset rh_
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO public.log_comments (log_id, user_id, username, body)
SELECT (SELECT id FROM ha3_ids WHERE what = 'record'), m.id, p.username, 'rh H-A3 the house''s own'
  FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1;
SELECT pg_temp.rh_case('the house''s own critique is not paced: it lands past the record''s twenty', 'rh H-A3 the house''s own',
  (SELECT body FROM public.log_comments WHERE log_id = (SELECT id FROM ha3_ids WHERE what = 'record') AND body LIKE '%house''s own')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
