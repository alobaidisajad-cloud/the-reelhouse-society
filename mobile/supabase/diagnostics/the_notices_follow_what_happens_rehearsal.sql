-- ════════════════════════════════════════════════════════════════════════════
-- the_notices_follow_what_happens_rehearsal.sql — 20261118_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_notices_follow_what_happens_rehearsal.sql --with-train
--
-- The train applies 20261118_03 here (with_train), 20261118_00 and 20261118_01 already applied; a sealed copy
-- already holds every one. Then members in good standing, acting as themselves, find each trigger holding: a
-- door answered taking its notice, and a request pushed once; a follow taking its notice and pushing once in
-- thirty days; a notice taken back heard on its member's own topic, and no one else's; no notice across a
-- block or mute.
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
GRANT SELECT ON rehearsal_members TO authenticated;

-- The pieces' own tables, made before the train, empty: each piece fills its own as it runs.
CREATE TEMP TABLE gb1_queued (n serial, what text PRIMARY KEY, queued bigint) ON COMMIT DROP;
CREATE TEMP TABLE gb1_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
CREATE TEMP TABLE gb2_queued (n serial, what text PRIMARY KEY, queued bigint) ON COMMIT DROP;
CREATE TEMP TABLE gb2_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
CREATE TEMP TABLE gb5_notices (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON gb5_notices TO authenticated;
CREATE TEMP TABLE gb5_reads (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON gb5_reads TO authenticated;
CREATE TEMP TABLE gb7_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON gb7_rows TO authenticated;
CREATE TEMP TABLE gb7_board (from_n bigint, kinds text) ON COMMIT DROP;
GRANT ALL ON gb7_board TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261118_03 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── G-B1 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B1 rehearsal · a salon request answered or withdrawn takes its notice (review round 12) ─────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest, so no push queued here is ever sent), with its rehearsal_members
-- (n = 1..4). 1 hosts a private salon; 2, 3 and 4, ranked for the Lounge for the run, each ask to
-- enter, as themselves: 1 holds three request notices. 1 admits 2 and declines 3 at the door, as
-- themselves; 4 steps out of the pending row, as themselves. Each request's notice goes with its
-- answer, and 2's admission stands. 3 asks again: the notice is written again, under the bell, and
-- the host's phone is not pushed a second time. (That no request notice in the house outlives its
-- request after the one-time sweep is 20261118_01's rehearsal, G-sweeps.)

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Nothing stands between the four, the owner's switch is on, and every member's salon pushes are
-- on: each notice and push counted below is the run's own doing.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.house_settings SET pushes_sent = true;
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'notif_salons' - 'notif_system'
 WHERE id IN (SELECT id FROM rehearsal_members);
-- The askers' rank is the house's to give for this run, which is rolled back.
SELECT count(*) AS done FROM rehearsal_members m, public.grant_entitlement(m.id, 'archivist', 'manual') g
 WHERE m.n IN (2, 3, 4) \gset rh_

CREATE TEMP TABLE gb1_salon ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('The G-B1 Door', (SELECT id FROM rehearsal_members WHERE n = 1), true)
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON gb1_salon TO authenticated;
DELETE FROM public.lounge_members
 WHERE lounge_id = (SELECT id FROM gb1_salon) AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 3, 4));
DELETE FROM public.lounge_sanctions
 WHERE lounge_id = (SELECT id FROM gb1_salon) AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 3, 4));

-- The pushes queued so far, read after each step, and what the host's board holds of each asker.
CREATE FUNCTION pg_temp.gb1_mark(p_what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO gb1_queued (what, queued) SELECT p_what, count(*) FROM net.http_request_queue;
$$;
CREATE FUNCTION pg_temp.gb1_pushed(p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT (q.queued - (SELECT b.queued FROM gb1_queued b WHERE b.n < q.n ORDER BY b.n DESC LIMIT 1))::text
    FROM gb1_queued q WHERE q.what = p_what;
$$;
CREATE FUNCTION pg_temp.gb1_asking(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.notifications
   WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
     AND related_lounge_id = (SELECT id FROM gb1_salon)
     AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;
-- A member acts as themselves.
CREATE FUNCTION pg_temp.gb1_as(p_member bigint, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.gb1_as(bigint, text) TO authenticated;

SELECT pg_temp.gb1_mark('before') AS done \gset rh_
SELECT pg_temp.gb1_as(2, format('SELECT public.request_lounge_membership(%L)', (SELECT id FROM gb1_salon))) AS done \gset rh_
SELECT pg_temp.gb1_mark('2 asks') AS done \gset rh_
SELECT pg_temp.gb1_as(3, format('SELECT public.request_lounge_membership(%L)', (SELECT id FROM gb1_salon))) AS done \gset rh_
SELECT pg_temp.gb1_as(4, format('SELECT public.request_lounge_membership(%L)', (SELECT id FROM gb1_salon))) AS done \gset rh_
INSERT INTO gb1_seen VALUES ('asked', pg_temp.gb1_asking(2) || pg_temp.gb1_asking(3) || pg_temp.gb1_asking(4));

-- The host answers 2 and 3 at the door; 4 steps out of the pending row. Each as themselves.
SELECT pg_temp.gb1_as(1, format('SELECT public.approve_lounge_member(%L, %L)', (SELECT id FROM gb1_salon), (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_
SELECT pg_temp.gb1_as(1, format('SELECT public.decline_lounge_member(%L, %L)', (SELECT id FROM gb1_salon), (SELECT id FROM rehearsal_members WHERE n = 3))) AS done \gset rh_
SELECT pg_temp.gb1_as(4, format('DELETE FROM public.lounge_members WHERE lounge_id = %L AND user_id = %L',
  (SELECT id FROM gb1_salon), (SELECT id FROM rehearsal_members WHERE n = 4))) AS done \gset rh_
INSERT INTO gb1_seen VALUES ('answered', pg_temp.gb1_asking(2) || pg_temp.gb1_asking(3) || pg_temp.gb1_asking(4));

-- 3, declined, asks again.
SELECT pg_temp.gb1_mark('answered') AS done \gset rh_
SELECT pg_temp.gb1_as(3, format('SELECT public.request_lounge_membership(%L)', (SELECT id FROM gb1_salon))) AS done \gset rh_
SELECT pg_temp.gb1_mark('3 asks again') AS done \gset rh_
INSERT INTO gb1_seen VALUES ('asked again', pg_temp.gb1_asking(3));

DO $$
DECLARE
  m1 uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  m2 uuid := (SELECT id FROM rehearsal_members WHERE n = 2);
  salon uuid := (SELECT id FROM gb1_salon);
BEGIN
  PERFORM pg_temp.rh_case('three members asking: the host holds a request notice from each', '111',
    (SELECT got FROM gb1_seen WHERE what = 'asked'));
  PERFORM pg_temp.rh_case('the first request is pushed', '1', pg_temp.gb1_pushed('2 asks'));
  PERFORM pg_temp.rh_case('admitted, declined or stepped out: each request''s notice goes with it', '000',
    (SELECT got FROM gb1_seen WHERE what = 'answered'));
  PERFORM pg_temp.rh_case('and the one admitted is told, the admission kept', '1',
    (SELECT count(*)::text FROM public.notifications
      WHERE user_id = m2 AND from_user_id = m1 AND related_lounge_id = salon));
  PERFORM pg_temp.rh_case('the one admitted sits in the salon', 'approved',
    (SELECT status FROM public.lounge_members WHERE lounge_id = salon AND user_id = m2));
  PERFORM pg_temp.rh_case('declined, asking again writes the notice again, under the bell', '1',
    (SELECT got FROM gb1_seen WHERE what = 'asked again'));
  PERFORM pg_temp.rh_case('and the host''s phone is not pushed a second time', '0', pg_temp.gb1_pushed('3 asks again'));
END $$;

-- ── G-B2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B2 rehearsal · a follow taken back takes its notice, and a follow buzzes the phone once a month (review round 12) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest, so no push queued here is ever sent), with its rehearsal_members
-- (n = 1..4). 1 keeps a public profile, 4 a private one, for the run. The follows are laid by the house
-- as the follow the app sends (a day old, as a member may act once a second and these come at once);
-- each is taken back by its member, as themselves. Then:
--   2 follows 1: one notice, one push. 2 takes it back: the notice goes. 2 follows again: the notice
--   is written again, and no push. 3 follows 1: a push, another member's. A month on, 2 takes it
--   back and follows again: a push. 2 asks at 4's door: a push; withdraws: its notice goes; asks
--   again: the notice again, and no push. 1 blocks 3: the block takes 3's follow and its notice.
--   (That no follow notice in the house outlives its follow after the one-time sweep is 20261118_01's
--   rehearsal, G-sweeps.)

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Nothing stands between the four, the owner's switch is on, and every member's follow pushes are on.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions
 WHERE type IN ('follow', 'follow_request')
   AND user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
-- The four as one list, so each table is read by its member's index (a join to the members' table,
-- which has no statistics, read every notice: 0.85 s at 100,000 members, under this car's locks).
DELETE FROM public.notifications
 WHERE type IN ('follow', 'follow_request')
   AND user_id = ANY (ARRAY(SELECT id FROM rehearsal_members)) AND from_user_id = ANY (ARRAY(SELECT id FROM rehearsal_members));
DELETE FROM public.certifications_pushed
 WHERE from_user_id = ANY (ARRAY(SELECT id FROM rehearsal_members)) AND thing LIKE 'follow:%';
UPDATE public.house_settings SET pushes_sent = true;
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'notif_follows'
 WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);

-- The pushes queued so far, read after each step.
CREATE FUNCTION pg_temp.gb2_mark(p_what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO gb2_queued (what, queued) SELECT p_what, count(*) FROM net.http_request_queue;
$$;
CREATE FUNCTION pg_temp.gb2_pushed(p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT (q.queued - (SELECT b.queued FROM gb2_queued b WHERE b.n < q.n ORDER BY b.n DESC LIMIT 1))::text
    FROM gb2_queued q WHERE q.what = p_what;
$$;
-- A follow (or a request) laid by the house, as the app sends it; a day old, so no act waits on another.
CREATE FUNCTION pg_temp.gb2_follow(p_from bigint, p_to bigint, p_type text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = p_from), (SELECT id FROM rehearsal_members WHERE n = p_to),
          p_type, now() - interval '1 day');
$$;
-- A member acts as themselves.
CREATE FUNCTION pg_temp.gb2_as(p_member bigint, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.gb2_as(bigint, text) TO authenticated;
-- A member takes back their follow (or request) of another, as themselves: the app's UNFOLLOW.
CREATE FUNCTION pg_temp.gb2_unfollow(p_from bigint, p_to bigint) RETURNS void LANGUAGE sql AS $$
  SELECT pg_temp.gb2_as(p_from, format(
    'DELETE FROM public.interactions WHERE user_id = %L AND target_user_id = %L AND type IN (''follow'', ''follow_request'')',
    (SELECT id FROM rehearsal_members WHERE n = p_from), (SELECT id FROM rehearsal_members WHERE n = p_to)));
$$;
-- The notices of one kind one member holds from another.
CREATE FUNCTION pg_temp.gb2_told(p_from bigint, p_to bigint, p_type text) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.notifications
   WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_to)
     AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = p_from) AND type = p_type;
$$;

SELECT pg_temp.gb2_mark('before') AS done \gset rh_
SELECT pg_temp.gb2_follow(2, 1, 'follow') AS done \gset rh_
SELECT pg_temp.gb2_mark('2 follows 1') AS done \gset rh_
INSERT INTO gb2_seen VALUES ('2 follows 1', pg_temp.gb2_told(2, 1, 'follow'));
SELECT pg_temp.gb2_unfollow(2, 1) AS done \gset rh_
INSERT INTO gb2_seen VALUES ('2 takes it back', pg_temp.gb2_told(2, 1, 'follow'));
SELECT pg_temp.gb2_mark('2 takes it back') AS done \gset rh_
SELECT pg_temp.gb2_follow(2, 1, 'follow') AS done \gset rh_
SELECT pg_temp.gb2_mark('2 follows again') AS done \gset rh_
INSERT INTO gb2_seen VALUES ('2 follows again', pg_temp.gb2_told(2, 1, 'follow'));
SELECT pg_temp.gb2_follow(3, 1, 'follow') AS done \gset rh_
SELECT pg_temp.gb2_mark('3 follows 1') AS done \gset rh_

-- A month on: 2 takes it back and follows again.
UPDATE public.certifications_pushed SET pushed_at = now() - interval '31 days'
 WHERE from_user_id = (SELECT id FROM rehearsal_members WHERE n = 2)
   AND thing = 'follow:' || (SELECT id FROM rehearsal_members WHERE n = 1);
SELECT pg_temp.gb2_unfollow(2, 1) AS done \gset rh_
SELECT pg_temp.gb2_mark('a month on, taken back') AS done \gset rh_
SELECT pg_temp.gb2_follow(2, 1, 'follow') AS done \gset rh_
SELECT pg_temp.gb2_mark('a month on, 2 follows again') AS done \gset rh_

-- 2 at 4's door: asks, withdraws, asks again.
SELECT pg_temp.gb2_follow(2, 4, 'follow_request') AS done \gset rh_
SELECT pg_temp.gb2_mark('2 asks at 4''s door') AS done \gset rh_
SELECT pg_temp.gb2_unfollow(2, 4) AS done \gset rh_
INSERT INTO gb2_seen VALUES ('2 withdraws', pg_temp.gb2_told(2, 4, 'follow_request'));
SELECT pg_temp.gb2_mark('2 withdraws') AS done \gset rh_
SELECT pg_temp.gb2_follow(2, 4, 'follow_request') AS done \gset rh_
SELECT pg_temp.gb2_mark('2 asks again') AS done \gset rh_
INSERT INTO gb2_seen VALUES ('2 asks again', pg_temp.gb2_told(2, 4, 'follow_request'));

-- 1 blocks 3, as themselves: the block takes 3's follow.
SELECT pg_temp.gb2_as(1, format('INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES (%L, %L, ''block'')',
  (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3))) AS done \gset rh_
INSERT INTO gb2_seen VALUES ('1 blocks 3', pg_temp.gb2_told(3, 1, 'follow'));

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a follow is told, once', '1', (SELECT got FROM gb2_seen WHERE what = '2 follows 1'));
  PERFORM pg_temp.rh_case('and pushed', '1', pg_temp.gb2_pushed('2 follows 1'));
  PERFORM pg_temp.rh_case('taken back, its notice goes', '0', (SELECT got FROM gb2_seen WHERE what = '2 takes it back'));
  PERFORM pg_temp.rh_case('and nothing is pushed', '0', pg_temp.gb2_pushed('2 takes it back'));
  PERFORM pg_temp.rh_case('followed again, the notice is written again, one of it', '1',
    (SELECT got FROM gb2_seen WHERE what = '2 follows again'));
  PERFORM pg_temp.rh_case('and the phone is not pushed again', '0', pg_temp.gb2_pushed('2 follows again'));
  PERFORM pg_temp.rh_case('another member''s follow pushes', '1', pg_temp.gb2_pushed('3 follows 1'));
  PERFORM pg_temp.rh_case('a month on, a follow given again is pushed again', '1', pg_temp.gb2_pushed('a month on, 2 follows again'));
  PERFORM pg_temp.rh_case('a request at a private door pushes', '1', pg_temp.gb2_pushed('2 asks at 4''s door'));
  PERFORM pg_temp.rh_case('withdrawn, its notice goes, as before', '0', (SELECT got FROM gb2_seen WHERE what = '2 withdraws'));
  PERFORM pg_temp.rh_case('asked again, the notice is written again', '1', (SELECT got FROM gb2_seen WHERE what = '2 asks again'));
  PERFORM pg_temp.rh_case('and the phone is not pushed again', '0', pg_temp.gb2_pushed('2 asks again'));
  PERFORM pg_temp.rh_case('a block takes the follow and its notice', '0', (SELECT got FROM gb2_seen WHERE what = '1 blocks 3'));
  PERFORM pg_temp.rh_case('no client reads the memory of the pushes', 'false|false',
    has_table_privilege('authenticated', 'public.certifications_pushed', 'SELECT')::text || '|'
    || has_table_privilege('anon', 'public.certifications_pushed', 'SELECT')::text);
END $$;

-- ── G-B5 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B5 rehearsal · the phone hears the house take a notice back (review round 12) ───────────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest, so no word sent here reaches a phone), with its rehearsal_members
-- (n = 1..4). The house writes 1 two notices and 2 one. 1 dismisses one, as themselves: 1's topic is
-- told that id. The house takes 1's other notice and 2's in one statement: each member's topic is told
-- their own ids, once. Then 1, as themselves, receives their own topic and the notices channel as
-- before, and 2 receives nothing of 1's topic.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

WITH r AS (INSERT INTO public.notifications (user_id, type, message)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'system', 'G-B5 rehearsal: dismissed') RETURNING id)
INSERT INTO gb5_notices SELECT 'dismissed', id FROM r;
WITH r AS (INSERT INTO public.notifications (user_id, type, message)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'system', 'G-B5 rehearsal: taken, 1') RETURNING id)
INSERT INTO gb5_notices SELECT 'taken, 1', id FROM r;
WITH r AS (INSERT INTO public.notifications (user_id, type, message)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'system', 'G-B5 rehearsal: taken, 2') RETURNING id)
INSERT INTO gb5_notices SELECT 'taken, 2', id FROM r;

-- The words told to a member's topic that name a notice.
CREATE FUNCTION pg_temp.gb5_told(p_member bigint, p_notice text) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM realtime.messages m
   WHERE m.topic = 'notices:' || (SELECT id FROM rehearsal_members WHERE n = p_member)
     AND m.event = 'notices_gone' AND m.private
     AND m.payload -> 'ids' ? (SELECT id::text FROM gb5_notices WHERE what = p_notice);
$$;

-- 1 dismisses one, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.notifications WHERE id = (SELECT id FROM gb5_notices WHERE what = 'dismissed');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- The house takes one of 1's and 2's, in one statement.
DELETE FROM public.notifications WHERE id IN (SELECT id FROM gb5_notices WHERE what LIKE 'taken, %');

-- What each member receives, as themselves (realtime.topic() is the topic their channel joined).
INSERT INTO realtime.messages (topic, extension, payload, event, private)
VALUES ('global_notifications', 'broadcast', '{}', 'gb5_probe', true);
CREATE FUNCTION pg_temp.gb5_reads(p_member bigint, p_topic text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('realtime.topic', p_topic, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*)::text INTO got FROM realtime.messages WHERE topic = p_topic;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN got;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.gb5_reads(bigint, text) TO authenticated;
INSERT INTO gb5_reads VALUES
  ('1 own', pg_temp.gb5_reads(1, 'notices:' || (SELECT id FROM rehearsal_members WHERE n = 1))),
  ('2 of 1', pg_temp.gb5_reads(2, 'notices:' || (SELECT id FROM rehearsal_members WHERE n = 1))),
  ('1 channel', pg_temp.gb5_reads(1, 'global_notifications'));
SELECT set_config('realtime.topic', '', true) AS done \gset rh_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a notice the member dismissed is told to their phones', '1', pg_temp.gb5_told(1, 'dismissed'));
  PERFORM pg_temp.rh_case('a notice the house took is told to its member', '1|1',
    pg_temp.gb5_told(1, 'taken, 1') || '|' || pg_temp.gb5_told(2, 'taken, 2'));
  PERFORM pg_temp.rh_case('and to no one else', '0|0',
    pg_temp.gb5_told(2, 'taken, 1') || '|' || pg_temp.gb5_told(1, 'taken, 2'));
  PERFORM pg_temp.rh_case('one statement tells each member once, their own ids alone', '1',
    (SELECT string_agg(jsonb_array_length(payload -> 'ids')::text, ',') FROM realtime.messages
      WHERE topic = 'notices:' || (SELECT id FROM rehearsal_members WHERE n = 2) AND event = 'notices_gone'
        AND payload -> 'ids' ? (SELECT id::text FROM gb5_notices WHERE what = 'taken, 2')));
  PERFORM pg_temp.rh_case('a member receives their own topic', 'true', ((SELECT got FROM gb5_reads WHERE what = '1 own')::int >= 2)::text);
  PERFORM pg_temp.rh_case('and nothing of another''s', '0', (SELECT got FROM gb5_reads WHERE what = '2 of 1'));
  PERFORM pg_temp.rh_case('the notices channel is received as before', 'true', ((SELECT got FROM gb5_reads WHERE what = '1 channel')::int >= 1)::text);
END $$;

-- ── G-B7 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B7 rehearsal · what a hidden member does is not written as news (review round 12) ──────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). 1 keeps a public profile and a
-- record for the run. 1 mutes 2, as themselves; 4 blocks 1, as themselves. Then 2 follows 1 and
-- certifies 1's record (laid by the house, as the app sends them, a day old so no act waits on
-- another), and 3 does the same: 1 is told of 3's and of none of 2's, though 2's follow and
-- certification stand. 1 unmutes 2, as themselves: nothing of 2's comes back to the board. A notice
-- from 4, who blocked 1, is not written to 1; the house's own word to 2 is.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'privacy_endorsements'
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);

WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990001207, 'gb7 film', current_date) RETURNING id)
INSERT INTO gb7_rows SELECT 'record', id FROM r;

-- 1 mutes 2; 4 blocks 1. Each as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'mute');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 4), (SELECT id FROM rehearsal_members WHERE n = 1), 'block');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- 2 (muted) and 3 (free) each follow 1 and certify 1's record.
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
SELECT id, (SELECT id FROM rehearsal_members WHERE n = 1), 'follow', now() - interval '2 days'
  FROM rehearsal_members WHERE n IN (2, 3);
INSERT INTO public.interactions (user_id, target_log_id, type, created_at)
SELECT id, (SELECT id FROM gb7_rows WHERE what = 'record'), 'endorse_log', now() - interval '1 day'
  FROM rehearsal_members WHERE n IN (2, 3);
-- A notice from 4, who blocked 1; and the house's own word to 2, signed by 1 sitting as the house.
INSERT INTO public.notifications (user_id, type, from_user_id, message)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'comment', (SELECT id FROM rehearsal_members WHERE n = 4), 'G-B7 rehearsal: across a block'),
       ((SELECT id FROM rehearsal_members WHERE n = 2), 'moderation', (SELECT id FROM rehearsal_members WHERE n = 1), 'G-B7 rehearsal: the house''s word');

-- 1 unmutes 2, as themselves, and reads the board.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 2);
INSERT INTO gb7_board
SELECT m.n, coalesce(string_agg(x.type, ',' ORDER BY x.type), '')
  FROM rehearsal_members m
  LEFT JOIN public.notifications x
    ON x.from_user_id = m.id AND x.user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
   AND (x.type = 'follow' OR x.group_key = 'endorse:log:' || (SELECT id FROM gb7_rows WHERE what = 'record'))
 WHERE m.n IN (2, 3, 4)
 GROUP BY m.n;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  m1 uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  m2 uuid := (SELECT id FROM rehearsal_members WHERE n = 2);
BEGIN
  PERFORM pg_temp.rh_case('a free member''s follow and certification are told', 'endorse,follow',
    (SELECT kinds FROM gb7_board WHERE from_n = 3));
  PERFORM pg_temp.rh_case('a muted member''s are not, and unmuted, nothing of them comes back', '',
    (SELECT kinds FROM gb7_board WHERE from_n = 2));
  PERFORM pg_temp.rh_case('nor are they written at all', '0',
    (SELECT count(*)::text FROM public.notifications
      WHERE user_id = m1 AND from_user_id = m2
        AND (type = 'follow' OR group_key = 'endorse:log:' || (SELECT id FROM gb7_rows WHERE what = 'record'))));
  PERFORM pg_temp.rh_case('the muted member''s follow and certification themselves stand', '2',
    (SELECT count(*)::text FROM public.interactions WHERE user_id = m2
      AND ((type = 'follow' AND target_user_id = m1) OR (type = 'endorse_log' AND target_log_id = (SELECT id FROM gb7_rows WHERE what = 'record')))));
  PERFORM pg_temp.rh_case('a notice from a member who blocked its reader is not written', '0',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = m1 AND message = 'G-B7 rehearsal: across a block'));
  PERFORM pg_temp.rh_case('the house''s own word is written as before', '1',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = m2 AND message = 'G-B7 rehearsal: the house''s word'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
