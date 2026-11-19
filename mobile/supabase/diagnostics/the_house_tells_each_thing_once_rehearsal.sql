-- ════════════════════════════════════════════════════════════════════════════
-- the_house_tells_each_thing_once_rehearsal.sql — 20261118_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_house_tells_each_thing_once_rehearsal.sql --with-train
--
-- The train applies 20261118_01 here (with_train), 20261118_00 already applied; a sealed copy already holds it.
-- First the one-time statements are read back once over the house's notices; then members in good standing,
-- acting as themselves, find each of its pieces holding: a withdrawn filing gone from the evidence; a salon's
-- door and a ballot told as what they are; a ballot's close kept from the hidden; an answer told once; records
-- and members found at the house, paged, the hidden left out (a private, a muted and a blocked author's
-- records never found). The cases that need the triggers are rehearsed with them, in the_notices_follow_what_happens_rehearsal.sql.
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
CREATE TEMP TABLE ga2_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ga2_rows TO authenticated;
CREATE TEMP TABLE ga2_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON ga2_got TO authenticated;
CREATE TEMP TABLE gb6_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON gb6_rows TO authenticated;
CREATE TEMP TABLE gb6_queued (n serial, what text PRIMARY KEY, queued bigint) ON COMMIT DROP;
CREATE TEMP TABLE gb6_seen (kinds text) ON COMMIT DROP;
CREATE TEMP TABLE gb4_ballots (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON gb4_ballots TO authenticated;
CREATE TEMP TABLE gb4_board (n bigint) ON COMMIT DROP;
GRANT ALL ON gb4_board TO authenticated;
CREATE TEMP TABLE gb9_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON gb9_rows TO authenticated;
CREATE TEMP TABLE gb9_queued (n serial, what text PRIMARY KEY, queued bigint) ON COMMIT DROP;
CREATE TEMP TABLE gb9_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
CREATE TEMP TABLE gc3_logs (what text, id uuid) ON COMMIT DROP;
GRANT SELECT ON gc3_logs TO anon, authenticated;
CREATE TEMP TABLE gc3_seen (who text, what text, got text) ON COMMIT DROP;
GRANT ALL ON gc3_seen TO anon, authenticated;
CREATE TEMP TABLE gc3_page (n int, id uuid, created_at timestamptz) ON COMMIT DROP;
GRANT ALL ON gc3_page TO authenticated;
CREATE TEMP TABLE gc4_seen (who text, what text, got text) ON COMMIT DROP;
GRANT ALL ON gc4_seen TO anon, authenticated;
CREATE TEMP TABLE gc4_page (n int, username text, closeness int) ON COMMIT DROP;
GRANT ALL ON gc4_page TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261118_01 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── G-sweeps ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-sweeps rehearsal · what the one-time statements left, read once (review round 12) ──────────
-- Run first of the car's pieces, right after the car, before any piece writes a notice. The car
-- gave the notices written before their kinds (G-B6) and took the notices standing for a salon
-- request no longer pending (G-B1) and for a follow since taken back (G-B2); here the house's
-- notices are read once to find none left of them. A request or a follow taken back from here on
-- takes its notice by its trigger, made in the next car (20261118_03) and rehearsed there.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE gsw_left ON COMMIT DROP AS
SELECT count(*) FILTER (WHERE n.type = 'system' AND n.related_lounge_id IS NOT NULL) AS salon_as_system,
       count(*) FILTER (WHERE n.type = 'system' AND n.metadata ->> 'kind' = 'ballot') AS ballot_as_system,
       count(*) FILTER (WHERE n.type IN ('salon', 'system') AND n.related_lounge_id IS NOT NULL AND n.from_user_id IS NOT NULL
                          AND n.user_id IS DISTINCT FROM n.from_user_id
                          AND n.message NOT LIKE 'You were admitted to %'
                          AND n.from_user_id IS DISTINCT FROM (SELECT l.creator_id FROM public.lounges l WHERE l.id = n.related_lounge_id)
                          AND NOT EXISTS (SELECT 1 FROM public.lounge_members m
                                           WHERE m.lounge_id = n.related_lounge_id AND m.user_id = n.from_user_id
                                             AND m.status = 'pending')) AS request_answered,
       count(*) FILTER (WHERE n.type = 'follow' AND n.from_user_id IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.interactions i
                                           WHERE i.user_id = n.from_user_id AND i.target_user_id = n.user_id
                                             AND i.type = 'follow')) AS follow_taken_back
  FROM public.notifications n;

SELECT pg_temp.rh_case('no salon notice is left of the house''s own kind', '0',
  (SELECT salon_as_system::text FROM gsw_left)) AS done \gset rh_
SELECT pg_temp.rh_case('nor a ballot''s close', '0',
  (SELECT ballot_as_system::text FROM gsw_left)) AS done \gset rh_
SELECT pg_temp.rh_case('no salon request notice in the house outlives its request', '0',
  (SELECT request_answered::text FROM gsw_left)) AS done \gset rh_
SELECT pg_temp.rh_case('no follow notice in the house outlives its follow', '0',
  (SELECT follow_taken_back::text FROM gsw_left)) AS done \gset rh_

-- ── G-A2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-A2 rehearsal · a filing already withdrawn is evidence destroyed (review round 12) ───────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). 1 sits as a moderator for the run;
-- 2 files two takes; 3 reports both, and one twice. 2 withdraws the first take, as themselves. The
-- moderator, as themselves, reads each case's evidence: the withdrawn take reads as destroyed (found:
-- false); the standing one as before (found, its words and its page). The moderator removes the
-- standing take on its first report: then its second report reads as destroyed too, and a removal on
-- it is refused as PIECE_GONE, the case left pending. A record that stands reads as before.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

WITH r AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
  SELECT 'take', m.id, p.username, 'G-A2 rehearsal: a take withdrawn', true
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 2
  RETURNING id)
INSERT INTO ga2_rows SELECT 'withdrawn take', id FROM r;
WITH r AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
  SELECT 'take', m.id, p.username, 'G-A2 rehearsal: a take standing', true
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 2
  RETURNING id)
INSERT INTO ga2_rows SELECT 'standing take', id FROM r;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990001201, 'ga2 film', current_date, 'G-A2 rehearsal: a review')
           RETURNING id)
INSERT INTO ga2_rows SELECT 'record', id FROM r;

-- 3 reports each; 4 reports the standing take too (two members' reports of one piece, two cases).
CREATE FUNCTION pg_temp.ga2_report(p_what text, p_by bigint, p_kind text, p_piece text) RETURNS void LANGUAGE sql AS $f$
  WITH r AS (
    INSERT INTO public.reports (reporter_id, content_type, content_id, reason, status, target_user_id)
    VALUES ((SELECT id FROM rehearsal_members WHERE n = p_by), p_kind, (SELECT id::text FROM ga2_rows WHERE what = p_piece),
            'spam', 'pending', (SELECT id FROM rehearsal_members WHERE n = 2))
    RETURNING id)
  INSERT INTO ga2_rows SELECT p_what, id FROM r;
$f$;
SELECT pg_temp.ga2_report('case: withdrawn', 3, 'dispatch_post', 'withdrawn take') AS done \gset rh_
SELECT pg_temp.ga2_report('case: standing, first', 3, 'dispatch_post', 'standing take') AS done \gset rh_
SELECT pg_temp.ga2_report('case: standing, second', 4, 'dispatch_post', 'standing take') AS done \gset rh_
SELECT pg_temp.ga2_report('case: record', 3, 'log', 'record') AS done \gset rh_
SELECT pg_temp.rh_need('cases filed', (SELECT count(*) FROM ga2_rows WHERE what LIKE 'case: %'), 4) AS done \gset rh_

CREATE TEMP TABLE ga2_was ON COMMIT DROP AS
  SELECT role FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);

-- 2 withdraws the first take, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.end_filing((SELECT id FROM ga2_rows WHERE what = 'withdrawn take'), 'author') AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- A removal, named by what came back: 'ok', or the house's refusal as SQLSTATE: message.
CREATE FUNCTION pg_temp.ga2_remove(p_case text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.resolve_moderation_report_v2(
    (SELECT id FROM ga2_rows WHERE what = p_case), 'delete_content',
    (SELECT id FROM rehearsal_members WHERE n = 1), 'rh reason', NULL, true);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ga2_remove(text) TO authenticated;

-- The moderator reads the exhibits, removes the standing take on its first report, and reads and
-- tries its second, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ga2_got VALUES
  ('withdrawn', public.get_report_evidence((SELECT id FROM ga2_rows WHERE what = 'case: withdrawn'))::text),
  ('standing', public.get_report_evidence((SELECT id FROM ga2_rows WHERE what = 'case: standing, first'))::text),
  ('record', public.get_report_evidence((SELECT id FROM ga2_rows WHERE what = 'case: record'))::text);
INSERT INTO ga2_got VALUES ('remove the standing', pg_temp.ga2_remove('case: standing, first'));
INSERT INTO ga2_got VALUES
  ('second report', public.get_report_evidence((SELECT id FROM ga2_rows WHERE what = 'case: standing, second'))::text);
INSERT INTO ga2_got VALUES ('remove it again', pg_temp.ga2_remove('case: standing, second'));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  standing jsonb := (SELECT got::jsonb FROM ga2_got WHERE what = 'standing');
  record jsonb := (SELECT got::jsonb FROM ga2_got WHERE what = 'record');
  take uuid := (SELECT id FROM ga2_rows WHERE what = 'standing take');
  rec uuid := (SELECT id FROM ga2_rows WHERE what = 'record');
BEGIN
  PERFORM pg_temp.rh_case('a take its author withdrew reads as destroyed', '{"found": false}',
    (SELECT got FROM ga2_got WHERE what = 'withdrawn'));
  PERFORM pg_temp.rh_case('a standing take reads as before: its words and its page',
    'true|G-A2 rehearsal: a take standing|/dispatch/' || take,
    (standing ->> 'found') || '|' || (standing ->> 'body') || '|' || (standing ->> 'route'));
  PERFORM pg_temp.rh_case('a standing record reads as before', 'true|G-A2 rehearsal: a review|/log/' || rec,
    (record ->> 'found') || '|' || (record ->> 'body') || '|' || (record ->> 'route'));
  PERFORM pg_temp.rh_case('a removal of a standing take is carried out as before', 'ok',
    (SELECT got FROM ga2_got WHERE what = 'remove the standing'));
  -- Withheld by the first removal since round 14 (H-B10): not destroyed, and said so; destroyed before it
  -- (the train rehearses this car before round 14's, so it reads either house).
  PERFORM pg_temp.rh_case('its second report then reads as withheld by the first removal (destroyed before round 14), not found',
    CASE WHEN to_regprocedure('public.withhold_piece(uuid, text, uuid)') IS NULL THEN '{"found": false}'
         ELSE '{"found": false, "appealed": false, "withheld": true}' END,
    (SELECT got FROM ga2_got WHERE what = 'second report'));
  PERFORM pg_temp.rh_case('and a removal on it is refused as gone', 'P0002: PIECE_GONE',
    (SELECT got FROM ga2_got WHERE what = 'remove it again'));
  PERFORM pg_temp.rh_case('its case stays pending, to be dismissed or judged on the member', 'pending',
    (SELECT status FROM public.reports WHERE id = (SELECT id FROM ga2_rows WHERE what = 'case: standing, second')));
  PERFORM pg_temp.rh_case('the evidence and the verdict ask one question: no member may ask it', 'false|false',
    has_function_privilege('authenticated', 'public.piece_stands(text, uuid)', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.piece_stands(text, uuid)', 'EXECUTE')::text);
END $$;

-- The moderator's chair given back: 1 holds the role they held before the run.
UPDATE public.profiles SET role = (SELECT role FROM ga2_was) WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);

-- ── G-B6 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B6 rehearsal · a salon's door and a ballot's close heard under switches that name them (review round 12) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest, so no push queued here is ever sent), with its rehearsal_members
-- (n = 1..4). 1 hosts a private salon; 2 and 3, ranked for the Lounge for the run, ask to enter, each
-- as themselves. With 1's Salons switch off, 2's request is written, of kind 'salon', and not pushed;
-- with Salons on and System Alerts off, 3's is pushed. 1 admits 3: the admission is a salon's notice.
-- 1 files two ballots past their close, 4 votes in both: with 4's System Alerts off the first close is
-- pushed; with 4's critiques switch off the second is not. (That no salon notice is left of the house's
-- kind is G-sweeps', read once.)

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.house_settings SET pushes_sent = true;
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'notif_salons' - 'notif_system' - 'notif_comments'
 WHERE id IN (SELECT id FROM rehearsal_members);
SELECT count(*) AS done FROM rehearsal_members m, public.grant_entitlement(m.id, 'archivist', 'manual') g
 WHERE m.n IN (2, 3) \gset rh_

WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('The G-B6 Door', (SELECT id FROM rehearsal_members WHERE n = 1), true)
  RETURNING id)
INSERT INTO gb6_rows SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members
 WHERE lounge_id = (SELECT id FROM gb6_rows WHERE what = 'salon') AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 3));
DELETE FROM public.lounge_sanctions
 WHERE lounge_id = (SELECT id FROM gb6_rows WHERE what = 'salon') AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 3));
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, options, closes_at, is_published, created_at)
  SELECT 'ballot', m.id, p.username, 'G-B6 rehearsal: ' || v.what, 'G-B6 rehearsal: ' || v.what,
         '[{"film_id":1,"title":"rh one"},{"film_id":2,"title":"rh two"}]'::jsonb, now() - interval '1 hour', true, now() - interval '4 days'
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id, (VALUES ('first'), ('second')) v(what)
   WHERE m.n = 1
  RETURNING id, title)
INSERT INTO gb6_rows SELECT 'ballot: ' || substr(title, length('G-B6 rehearsal: ') + 1), id FROM made;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
SELECT id, (SELECT id FROM rehearsal_members WHERE n = 4), 0 FROM gb6_rows WHERE what LIKE 'ballot: %';
SELECT pg_temp.rh_need('ballots filed', (SELECT count(*) FROM gb6_rows WHERE what LIKE 'ballot: %'), 2) AS done \gset rh_

CREATE FUNCTION pg_temp.gb6_mark(p_what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO gb6_queued (what, queued) SELECT p_what, count(*) FROM net.http_request_queue;
$$;
CREATE FUNCTION pg_temp.gb6_pushed(p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT (q.queued - (SELECT b.queued FROM gb6_queued b WHERE b.n < q.n ORDER BY b.n DESC LIMIT 1))::text
    FROM gb6_queued q WHERE q.what = p_what;
$$;
CREATE FUNCTION pg_temp.gb6_as(p_member bigint, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.gb6_as(bigint, text) TO authenticated;
CREATE FUNCTION pg_temp.gb6_prefs(p_member bigint, p_prefs jsonb) RETURNS void LANGUAGE sql AS $$
  UPDATE public.profiles SET preferences = (coalesce(preferences, '{}'::jsonb) - 'notif_salons' - 'notif_system' - 'notif_comments') || p_prefs
   WHERE id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;

SELECT pg_temp.gb6_mark('before') AS done \gset rh_
-- The host's Salons switch off: 2 asks.
SELECT pg_temp.gb6_prefs(1, '{"notif_salons": false}') AS done \gset rh_
SELECT pg_temp.gb6_as(2, format('SELECT public.request_lounge_membership(%L)', (SELECT id FROM gb6_rows WHERE what = 'salon'))) AS done \gset rh_
SELECT pg_temp.gb6_mark('2 asks, Salons off') AS done \gset rh_
-- Salons on, System Alerts off: 3 asks.
SELECT pg_temp.gb6_prefs(1, '{"notif_system": false}') AS done \gset rh_
SELECT pg_temp.gb6_as(3, format('SELECT public.request_lounge_membership(%L)', (SELECT id FROM gb6_rows WHERE what = 'salon'))) AS done \gset rh_
SELECT pg_temp.gb6_mark('3 asks, System Alerts off') AS done \gset rh_
-- The member a value the plan sees, so their notices are read by their index.
DO $$
DECLARE
  m1 uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  salon uuid := (SELECT id FROM gb6_rows WHERE what = 'salon');
BEGIN
  INSERT INTO gb6_seen SELECT string_agg(type, ',' ORDER BY type) FROM public.notifications
   WHERE user_id = m1 AND related_lounge_id = salon;
END $$;
SELECT pg_temp.gb6_prefs(1, '{}') AS done \gset rh_
-- The host admits 3, as themselves.
SELECT pg_temp.gb6_as(1, format('SELECT public.approve_lounge_member(%L, %L)', (SELECT id FROM gb6_rows WHERE what = 'salon'),
  (SELECT id FROM rehearsal_members WHERE n = 3))) AS done \gset rh_

-- The ballots close: 4's System Alerts off for the first, the critiques' switch off for the second.
SELECT pg_temp.gb6_prefs(4, '{"notif_system": false}') AS done \gset rh_
SELECT pg_temp.gb6_mark('before the first close') AS done \gset rh_
UPDATE public.dispatch_posts SET frozen_totals = jsonb_build_object('total', 1, 'counts', jsonb_build_object('0', 1), 'frozen_at', now())
 WHERE id = (SELECT id FROM gb6_rows WHERE what = 'ballot: first');
SELECT pg_temp.gb6_mark('the first close, System Alerts off') AS done \gset rh_
SELECT pg_temp.gb6_prefs(4, '{"notif_comments": false}') AS done \gset rh_
UPDATE public.dispatch_posts SET frozen_totals = jsonb_build_object('total', 1, 'counts', jsonb_build_object('0', 1), 'frozen_at', now())
 WHERE id = (SELECT id FROM gb6_rows WHERE what = 'ballot: second');
SELECT pg_temp.gb6_mark('the second close, critiques off') AS done \gset rh_
SELECT pg_temp.gb6_prefs(4, '{}') AS done \gset rh_

DO $$
DECLARE
  m3 uuid := (SELECT id FROM rehearsal_members WHERE n = 3);
  m4 uuid := (SELECT id FROM rehearsal_members WHERE n = 4);
BEGIN
  PERFORM pg_temp.rh_case('a request to enter is a salon''s notice', 'salon,salon', (SELECT kinds FROM gb6_seen));
  PERFORM pg_temp.rh_case('the host''s Salons switch off: written, not pushed', '0', pg_temp.gb6_pushed('2 asks, Salons off'));
  PERFORM pg_temp.rh_case('Salons on, System Alerts off: pushed', '1', pg_temp.gb6_pushed('3 asks, System Alerts off'));
  PERFORM pg_temp.rh_case('an admission is a salon''s notice', 'salon',
    (SELECT string_agg(type, ',') FROM public.notifications
      WHERE user_id = m3
        AND related_lounge_id = (SELECT id FROM gb6_rows WHERE what = 'salon')));
  PERFORM pg_temp.rh_case('a ballot''s close is heard past System Alerts off', '1', pg_temp.gb6_pushed('the first close, System Alerts off'));
  PERFORM pg_temp.rh_case('and under the critiques'' switch: off, it is written and not pushed', '0|1',
    pg_temp.gb6_pushed('the second close, critiques off') || '|'
    || (SELECT count(*)::text FROM public.notifications
         WHERE user_id = m4 AND type = 'ballot'
           AND metadata ->> 'dispatch_post_id' = (SELECT id::text FROM gb6_rows WHERE what = 'ballot: second')));
END $$;

-- ── G-B4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B4 rehearsal · a ballot's close is told only to those who may read it (review round 12) ─────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). 1 files two ballots, both past
-- their close; the house withholds the second. 2, 3 and 4 vote in the first, 4 in the second (laid by
-- the house, as the vote the app sends). 2 mutes 1 and 1 blocks 3, each as themselves. The house
-- freezes both counts, as freeze_closed_ballots does. Then 4 is told of the first, the notice naming
-- its author, of kind 'ballot', and 4 reads it on their board, as themselves; 2 and 3 are told
-- nothing; nobody is told of the withheld one.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);

WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, options, closes_at, is_published, created_at)
  SELECT 'ballot', m.id, p.username, 'G-B4 rehearsal: told', 'G-B4 rehearsal: told',
         '[{"film_id":1,"title":"rh one"},{"film_id":2,"title":"rh two"}]'::jsonb, now() - interval '1 hour', true, now() - interval '4 days'
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO gb4_ballots SELECT 'told', id FROM made;
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, options, closes_at, is_published, created_at, withheld_at)
  SELECT 'ballot', m.id, p.username, 'G-B4 rehearsal: withheld', 'G-B4 rehearsal: withheld',
         '[{"film_id":1,"title":"rh one"},{"film_id":2,"title":"rh two"}]'::jsonb, now() - interval '1 hour', true, now() - interval '4 days', now() - interval '2 hours'
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO gb4_ballots SELECT 'withheld', id FROM made;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
SELECT (SELECT id FROM gb4_ballots WHERE what = 'told'), id, 0 FROM rehearsal_members WHERE n IN (2, 3, 4);
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
SELECT (SELECT id FROM gb4_ballots WHERE what = 'withheld'), id, 1 FROM rehearsal_members WHERE n = 4;

-- 2 mutes the author; the author blocks 3. Each as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 1), 'mute');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3), 'block');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- The house freezes both counts, as freeze_closed_ballots does for each ballot past its close.
UPDATE public.dispatch_posts SET frozen_totals = jsonb_build_object('total', 3, 'counts', jsonb_build_object('0', 3), 'frozen_at', now())
 WHERE id = (SELECT id FROM gb4_ballots WHERE what = 'told');
UPDATE public.dispatch_posts SET frozen_totals = jsonb_build_object('total', 1, 'counts', jsonb_build_object('1', 1), 'frozen_at', now())
 WHERE id = (SELECT id FROM gb4_ballots WHERE what = 'withheld');

-- 4 reads their board, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gb4_board SELECT count(*) FROM public.notifications
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 4)
   AND metadata ->> 'dispatch_post_id' = (SELECT id::text FROM gb4_ballots WHERE what = 'told');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  told uuid := (SELECT id FROM gb4_ballots WHERE what = 'told');
  withheld uuid := (SELECT id FROM gb4_ballots WHERE what = 'withheld');
  closes CONSTANT text := 'SELECT count(*)::text FROM public.notifications WHERE user_id = $1 AND metadata ->> ''dispatch_post_id'' = $2::text';
  got text;
  -- Values the plan sees, so each member's notices are read by their index.
  m1 uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  m4 uuid := (SELECT id FROM rehearsal_members WHERE n = 4);
BEGIN
  EXECUTE closes INTO got USING (SELECT id FROM rehearsal_members WHERE n = 4), told;
  PERFORM pg_temp.rh_case('a voter free of its author is told the ballot closed', '1', got);
  PERFORM pg_temp.rh_case('a notice of its own kind, naming the ballot''s author and no handle', 'ballot|true|true',
    (SELECT type || '|' || (from_user_id = m1)::text || '|' || (from_username IS NULL)::text
       FROM public.notifications
      WHERE user_id = m4 AND metadata ->> 'dispatch_post_id' = told::text));
  PERFORM pg_temp.rh_case('and reads it on their board', '1', (SELECT n::text FROM gb4_board));
  EXECUTE closes INTO got USING (SELECT id FROM rehearsal_members WHERE n = 2), told;
  PERFORM pg_temp.rh_case('a voter who muted the author is told nothing', '0', got);
  EXECUTE closes INTO got USING (SELECT id FROM rehearsal_members WHERE n = 3), told;
  PERFORM pg_temp.rh_case('nor one the author blocked', '0', got);
  EXECUTE closes INTO got USING (SELECT id FROM rehearsal_members WHERE n = 4), withheld;
  PERFORM pg_temp.rh_case('nobody is told of a ballot the house withheld', '0', got);
END $$;

-- ── G-B9 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B9 rehearsal · an answer moved takes its notice, and is pushed once (review round 12) ───────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest, so no push queued here is ever sent), with its rehearsal_members
-- (n = 1..4). 1 files a seeking; 2 and 3 each critique it. 1, as themselves, takes 2's critique as the
-- answer: 2 is told, marked as an answer, and pushed. 1 takes 3's instead: 2's notice goes, 3 is told.
-- 1 takes 2's again: 2 is told again, one notice, and not pushed again; 3's notice goes.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.house_settings SET pushes_sent = true;
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'notif_comments'
 WHERE id IN (SELECT id FROM rehearsal_members);

WITH r AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
  SELECT 'seeking', m.id, p.username, 'G-B9 rehearsal: a seeking', true
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO gb9_rows SELECT 'seeking', id FROM r;
WITH r AS (
  INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
  SELECT (SELECT id FROM gb9_rows WHERE what = 'seeking'), m.id, p.username, 'G-B9 rehearsal: an answer of ' || m.n
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n IN (2, 3)
  RETURNING id, body)
INSERT INTO gb9_rows SELECT 'critique ' || right(body, 1), id FROM r;
SELECT pg_temp.rh_need('critiques filed', (SELECT count(*) FROM gb9_rows WHERE what LIKE 'critique %'), 2) AS done \gset rh_

CREATE FUNCTION pg_temp.gb9_mark(p_what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO gb9_queued (what, queued) SELECT p_what, count(*) FROM net.http_request_queue;
$$;
CREATE FUNCTION pg_temp.gb9_pushed(p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT (q.queued - (SELECT b.queued FROM gb9_queued b WHERE b.n < q.n ORDER BY b.n DESC LIMIT 1))::text
    FROM gb9_queued q WHERE q.what = p_what;
$$;
-- The author takes a critique as the answer, as themselves (the app's TAKE THIS ONE).
CREATE FUNCTION pg_temp.gb9_take(p_critique text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.dispatch_posts SET answer_id = (SELECT id FROM gb9_rows WHERE what = p_critique)
   WHERE id = (SELECT id FROM gb9_rows WHERE what = 'seeking');
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.gb9_take(text) TO authenticated;
-- The answer notices a critic holds for their critique: how many, and how many marked as an answer.
-- The member a value the plan sees, so their notices are read by their index.
CREATE FUNCTION pg_temp.gb9_told(p_member bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_member uuid := (SELECT id FROM rehearsal_members WHERE n = p_member);
  v_critique text := (SELECT id::text FROM gb9_rows WHERE what = 'critique ' || p_member);
BEGIN
  RETURN (SELECT count(*)::text || '/' || count(*) FILTER (WHERE metadata ? 'answer')::text FROM public.notifications
           WHERE user_id = v_member
             AND type = 'comment' AND message = 'took your critique as the answer.'
             AND metadata ->> 'comment_id' = v_critique);
END $$;

SELECT pg_temp.gb9_mark('before') AS done \gset rh_
SELECT pg_temp.gb9_take('critique 2') AS done \gset rh_
SELECT pg_temp.gb9_mark('2''s taken') AS done \gset rh_
INSERT INTO gb9_seen VALUES ('2''s taken', pg_temp.gb9_told(2) || ' ' || pg_temp.gb9_told(3));
SELECT pg_temp.gb9_take('critique 3') AS done \gset rh_
SELECT pg_temp.gb9_mark('3''s taken') AS done \gset rh_
INSERT INTO gb9_seen VALUES ('3''s taken', pg_temp.gb9_told(2) || ' ' || pg_temp.gb9_told(3));
SELECT pg_temp.gb9_take('critique 2') AS done \gset rh_
SELECT pg_temp.gb9_mark('2''s taken again') AS done \gset rh_
INSERT INTO gb9_seen VALUES ('2''s taken again', pg_temp.gb9_told(2) || ' ' || pg_temp.gb9_told(3));

DO $$ BEGIN
  PERFORM pg_temp.rh_case('an answer taken is told to its critic, marked as an answer', '1/1 0/0',
    (SELECT got FROM gb9_seen WHERE what = '2''s taken'));
  PERFORM pg_temp.rh_case('and pushed', '1', pg_temp.gb9_pushed('2''s taken'));
  PERFORM pg_temp.rh_case('moved to another, the first critic''s notice goes and the second is told', '0/0 1/1',
    (SELECT got FROM gb9_seen WHERE what = '3''s taken'));
  PERFORM pg_temp.rh_case('and the second is pushed', '1', pg_temp.gb9_pushed('3''s taken'));
  PERFORM pg_temp.rh_case('moved back, one notice each way, never two', '1/1 0/0',
    (SELECT got FROM gb9_seen WHERE what = '2''s taken again'));
  PERFORM pg_temp.rh_case('and the first critic is not pushed again', '0', pg_temp.gb9_pushed('2''s taken again'));
END $$;

-- ── G-C3 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-C3 rehearsal · the search's logs are read by pages, hidden authors left out, spoilers said ──
--   Run inside the round's rehearsal, after rehearsal_kit.sql and its rehearsal_members (four
--   members in good standing, n = 1..4), the round's migration applied. Members 1, 2 and 3 keep
--   open files for the run. Member 1 has blocked member 3. Each writes records holding one word no
--   real record holds: member 1 a review marked as spoilers; member 2 a review, and a film whose
--   title holds it, both made at one moment; member 3 a review; member 2 also a record with no
--   review (never a search result) and one that holds the word nowhere (found only by the handle).
--   Member 1, as themselves, finds their own and member 2's three-in-order, never member 3's,
--   their own spoiler said as one; reads them again two at a time, every one once; finds member
--   2's other record by member 2's handle; and finds nothing for nothing. Member 3, blocked by 1,
--   finds none of member 1's. A visitor finds all four reviewed records. Every row goes with the
--   rehearsal's rollback.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET is_social_private = false
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2, 3));
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2, 3))
   AND blocked_id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2, 3));
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3), 'block');

WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, is_spoiler, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990901, 'GC3 Picture One', '2026-01-01',
          'the zqgc3word twist is that he was dead', true, now() - interval '1 hour')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'spoiler', id FROM made;
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990902, 'GC3 Picture Two', '2026-01-01',
          'a zqgc3word night at the pictures', now() - interval '2 hours')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'review', id FROM made;
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990903, 'The Zqgc3word Picture', '2026-01-01',
          'quiet and long', now() - interval '2 hours')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'title', id FROM made;
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), 990904, 'GC3 Picture Four', '2026-01-01',
          'zqgc3word, said by the member who was blocked', now() - interval '3 hours')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'blocked', id FROM made;
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990905, 'Zqgc3word Unreviewed', '2026-01-01',
          '', now() - interval '4 hours')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'unreviewed', id FROM made;
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990906, 'GC3 Picture Six', '2026-01-01',
          'a record of no word in particular', now() - interval '5 hours')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'handle only', id FROM made;


-- Member 1 searches, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc3_seen SELECT '1', 'found', string_agg(g.what, ',' ORDER BY s.created_at DESC, s.id DESC)
  FROM public.search_logs('zqgc3word', 'zqgc3word', NULL, NULL, 50) s JOIN gc3_logs g ON g.id = s.id;
INSERT INTO gc3_seen SELECT '1', 'spoiler', s.is_spoiler::text
  FROM public.search_logs('zqgc3word', NULL, NULL, NULL, 50) s WHERE s.id = (SELECT id FROM gc3_logs WHERE what = 'spoiler');
INSERT INTO gc3_seen SELECT '1', 'not spoiler', s.is_spoiler::text
  FROM public.search_logs('zqgc3word', NULL, NULL, NULL, 50) s WHERE s.id = (SELECT id FROM gc3_logs WHERE what = 'review');
INSERT INTO gc3_seen SELECT '1', 'its author', (s.username = p.username)::text
  FROM public.search_logs('zqgc3word', NULL, NULL, NULL, 50) s JOIN public.profiles p ON p.id = s.user_id
 WHERE s.id = (SELECT id FROM gc3_logs WHERE what = 'review');
-- Two at a time: the first page, then the page after its last row.
INSERT INTO gc3_page SELECT 1, s.id, s.created_at FROM public.search_logs('zqgc3word', NULL, NULL, NULL, 2) s;
INSERT INTO gc3_page SELECT 2, s.id, s.created_at
  FROM public.search_logs('zqgc3word', NULL,
         (SELECT created_at FROM gc3_page WHERE n = 1 ORDER BY created_at, id LIMIT 1),
         (SELECT id FROM gc3_page WHERE n = 1 ORDER BY created_at, id LIMIT 1), 2) s;
INSERT INTO gc3_seen SELECT '1', 'pages', string_agg(p.n || ':' || g.what, ',' ORDER BY p.n, p.created_at DESC, p.id DESC)
  FROM gc3_page p JOIN gc3_logs g ON g.id = p.id;
INSERT INTO gc3_seen SELECT '1', 'tie in order', ((SELECT id FROM gc3_logs WHERE what = 'review') > (SELECT id FROM gc3_logs WHERE what = 'title'))::text;
INSERT INTO gc3_seen SELECT '1', 'by handle', count(*)::text
  FROM public.search_logs(
         public.like_escape((SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2))),
         public.like_escape((SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2))),
         NULL, NULL, 51) s
 WHERE s.id = (SELECT id FROM gc3_logs WHERE what = 'handle only');
INSERT INTO gc3_seen SELECT '1', 'nothing', count(*)::text FROM public.search_logs('', NULL, NULL, NULL, 50) s;

-- Member 3, whom member 1 blocked, as themselves.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc3_seen SELECT '3', 'found', coalesce(string_agg(g.what, ',' ORDER BY s.created_at DESC, s.id DESC), '')
  FROM public.search_logs('zqgc3word', NULL, NULL, NULL, 50) s JOIN gc3_logs g ON g.id = s.id;
RESET ROLE;

-- A visitor.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO gc3_seen SELECT 'visitor', 'found', string_agg(g.what, ',' ORDER BY s.created_at DESC, s.id DESC)
  FROM public.search_logs('zqgc3word', NULL, NULL, NULL, 50) s JOIN gc3_logs g ON g.id = s.id;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- The order of the two made at one moment is their ids', the larger first.
SELECT pg_temp.rh_case('the search finds the reader''s own and another''s, newest first, never a hidden author''s nor an unreviewed record',
  CASE WHEN (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'tie in order') = 'true'
       THEN 'spoiler,review,title' ELSE 'spoiler,title,review' END,
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'found')) AS done \gset rh_
SELECT pg_temp.rh_case('a review its author marked as spoilers is said to be one', 'true',
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'spoiler')) AS done \gset rh_
SELECT pg_temp.rh_case('and one not marked is not', 'false',
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'not spoiler')) AS done \gset rh_
SELECT pg_temp.rh_case('each record comes with its author''s handle', 'true',
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'its author')) AS done \gset rh_
SELECT pg_temp.rh_case('read two at a time, every record comes once, in the same order',
  CASE WHEN (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'tie in order') = 'true'
       THEN '1:spoiler,1:review,2:title' ELSE '1:spoiler,1:title,2:review' END,
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'pages')) AS done \gset rh_
SELECT pg_temp.rh_case('a record is found by its author''s handle', '1',
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'by handle')) AS done \gset rh_
SELECT pg_temp.rh_case('nothing searched finds nothing', '0',
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'nothing')) AS done \gset rh_
SELECT pg_temp.rh_case('a member the author blocked finds none of the author''s records',
  CASE WHEN (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'tie in order') = 'true'
       THEN 'review,title,blocked' ELSE 'title,review,blocked' END,
  (SELECT got FROM gc3_seen WHERE who = '3' AND what = 'found')) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor finds every reviewed record',
  CASE WHEN (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'tie in order') = 'true'
       THEN 'spoiler,review,title,blocked' ELSE 'spoiler,title,review,blocked' END,
  (SELECT got FROM gc3_seen WHERE who = 'visitor' AND what = 'found')) AS done \gset rh_

-- The read rule, asked by the house of what it found (search_logs runs as the house): a private
-- author's record, a muted author's and a blocked one's never come back, by the walk (a page of one)
-- or by the words' pieces (a page of fifty). Member 4 keeps a private file and a record holding a
-- second word; member 1 holds one too. Member 1, not following 4, finds only their own; member 4 finds
-- both (their own, and 1's); a visitor finds 1's alone. Member 2 mutes member 1: member 2 finds 4's
-- not (private) and 1's not (muted). Member 1 then follows 4 (laid by the house, a day old): 1 finds
-- both. Member 3, whom 1 blocked, finds none of 1's.
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
DELETE FROM public.interactions
 WHERE type IN ('follow', 'follow_request')
   AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2, 3)) AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members)
   AND NOT (blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 3));
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 1), 'mute');
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 4), 990907, 'GC3 Picture Seven', '2026-01-01',
          'a zqgc3hush word kept for followers', now() - interval '30 minutes')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'private', id FROM made;
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990908, 'GC3 Picture Eight', '2026-01-01',
          'a zqgc3hush word for anyone', now() - interval '40 minutes')
  RETURNING id)
INSERT INTO gc3_logs SELECT 'open', id FROM made;
-- Who found what for the second word, by a page of one (the walk) and a page of fifty (the pieces).
CREATE FUNCTION pg_temp.gc3_hush(p_limit integer) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(g.what, ',' ORDER BY s.created_at DESC, s.id DESC), '')
    FROM public.search_logs('zqgc3hush', 'zqgc3hush', NULL, NULL, p_limit) s JOIN gc3_logs g ON g.id = s.id;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.gc3_hush(integer) TO anon, authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc3_seen VALUES ('1', 'hush 50', pg_temp.gc3_hush(50)), ('1', 'hush 1', pg_temp.gc3_hush(1));
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc3_seen VALUES ('4', 'hush 50', pg_temp.gc3_hush(50)), ('4', 'hush 1', pg_temp.gc3_hush(1));
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc3_seen VALUES ('2', 'hush 50', pg_temp.gc3_hush(50)), ('2', 'hush 1', pg_temp.gc3_hush(1));
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc3_seen VALUES ('3', 'hush 50', pg_temp.gc3_hush(50)), ('3', 'hush 1', pg_temp.gc3_hush(1));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO gc3_seen VALUES ('visitor', 'hush 50', pg_temp.gc3_hush(50)), ('visitor', 'hush 1', pg_temp.gc3_hush(1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- A follow at a private door is a request (enforce_privacy_on_follow); admitted, it is a follow.
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'follow_request', now() - interval '1 day');
UPDATE public.interactions SET type = 'follow'
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 4)
   AND type = 'follow_request';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc3_seen VALUES ('1 following', 'hush 50', pg_temp.gc3_hush(50)), ('1 following', 'hush 1', pg_temp.gc3_hush(1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('a private author''s record is never found by one who does not follow them', 'open|open',
  (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'hush 50') || '|' || (SELECT got FROM gc3_seen WHERE who = '1' AND what = 'hush 1')) AS done \gset rh_
SELECT pg_temp.rh_case('nor by a visitor', 'open|open',
  (SELECT got FROM gc3_seen WHERE who = 'visitor' AND what = 'hush 50') || '|' || (SELECT got FROM gc3_seen WHERE who = 'visitor' AND what = 'hush 1')) AS done \gset rh_
SELECT pg_temp.rh_case('its author finds it, newest first', 'private,open|private',
  (SELECT got FROM gc3_seen WHERE who = '4' AND what = 'hush 50') || '|' || (SELECT got FROM gc3_seen WHERE who = '4' AND what = 'hush 1')) AS done \gset rh_
SELECT pg_temp.rh_case('a muted author''s record is never found by the one who muted them, nor a private one', '|',
  (SELECT got FROM gc3_seen WHERE who = '2' AND what = 'hush 50') || '|' || (SELECT got FROM gc3_seen WHERE who = '2' AND what = 'hush 1')) AS done \gset rh_
SELECT pg_temp.rh_case('a blocked member finds none of the record of the one who blocked them', '|',
  (SELECT got FROM gc3_seen WHERE who = '3' AND what = 'hush 50') || '|' || (SELECT got FROM gc3_seen WHERE who = '3' AND what = 'hush 1')) AS done \gset rh_
SELECT pg_temp.rh_case('a follower finds the private author''s record', 'private,open|private',
  (SELECT got FROM gc3_seen WHERE who = '1 following' AND what = 'hush 50') || '|' || (SELECT got FROM gc3_seen WHERE who = '1 following' AND what = 'hush 1')) AS done \gset rh_

-- The block and the mute this piece made go, and member 4's file is open again, so no later piece meets them.
DELETE FROM public.user_blocks
 WHERE (blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 3))
    OR (blocker_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 1));
DELETE FROM public.interactions
 WHERE type = 'follow' AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);

-- ── G-C4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-C4 rehearsal · PEOPLE finds the handle that begins with the words, closest first, by pages ──
--   Run inside the round's rehearsal, after rehearsal_kit.sql and its rehearsal_members (four
--   members in good standing, n = 1..4), the round's migration applied. As the house, the four are
--   given handles and a name around one word no real member holds: member 2's handle IS the word,
--   member 3's begins with it, member 4's NAME begins with it (their handle does not hold it), and
--   member 1's handle holds it after a letter. (They keep these handles until the rehearsal's
--   rollback; every later piece reads a member's handle from their profile.) Member 2, as
--   themselves, finds 2, 3, 4, 1 in that order, and again two at a time, each once; with handles
--   alone (a search written "@..."), 2, 3, 1. Member 1, who has muted member 3, finds 2, 4, 1.
--   Nothing searched finds no one. A visitor finds the four. Every row goes with the rollback.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET username = 'azqgc4' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
UPDATE public.profiles SET username = 'zqgc4' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
UPDATE public.profiles SET username = 'zqgc4x' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 3);
UPDATE public.profiles SET display_name = 'Zqgc4 Fourth' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
UPDATE public.profiles SET display_name = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2, 3));
SELECT pg_temp.rh_need('member 4''s handle without the word',
  (SELECT count(*) FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4)
      AND username NOT ILIKE '%zqgc4%'), 1) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3), 'mute');

GRANT SELECT ON rehearsal_members TO anon;

-- Member 2 searches, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc4_seen SELECT '2', 'found', string_agg(r.n::text, ',' ORDER BY s.closeness, s.username)
  FROM public.search_members('zqgc4', false, NULL, NULL, 50) s JOIN rehearsal_members r ON r.id = s.id;
INSERT INTO gc4_page SELECT 1, s.username, s.closeness FROM public.search_members('zqgc4', false, NULL, NULL, 2) s;
INSERT INTO gc4_page SELECT 2, s.username, s.closeness
  FROM public.search_members('zqgc4', false,
         (SELECT closeness FROM gc4_page WHERE n = 1 ORDER BY closeness DESC, username DESC LIMIT 1),
         (SELECT username FROM gc4_page WHERE n = 1 ORDER BY closeness DESC, username DESC LIMIT 1), 2) s;
INSERT INTO gc4_seen SELECT '2', 'pages', string_agg(p.n || ':' || p.username, ',' ORDER BY p.n, p.closeness, p.username)
  FROM gc4_page p;
INSERT INTO gc4_seen SELECT '2', 'handles', string_agg(r.n::text, ',' ORDER BY s.closeness, s.username)
  FROM public.search_members('zqgc4', true, NULL, NULL, 50) s JOIN rehearsal_members r ON r.id = s.id;
INSERT INTO gc4_seen SELECT '2', 'nothing', count(*)::text FROM public.search_members('', false, NULL, NULL, 50) s;

-- Member 1, who has muted member 3, as themselves.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO gc4_seen SELECT '1', 'found', string_agg(r.n::text, ',' ORDER BY s.closeness, s.username)
  FROM public.search_members('zqgc4', false, NULL, NULL, 50) s JOIN rehearsal_members r ON r.id = s.id;
RESET ROLE;

-- A visitor.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO gc4_seen SELECT 'visitor', 'found', string_agg(r.n::text, ',' ORDER BY s.closeness, s.username)
  FROM public.search_members('zqgc4', false, NULL, NULL, 50) s JOIN rehearsal_members r ON r.id = s.id;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('the handle that is the words first, then a handle beginning with them, then a name, then the rest', '2,3,4,1',
  (SELECT got FROM gc4_seen WHERE who = '2' AND what = 'found')) AS done \gset rh_
SELECT pg_temp.rh_case('read two at a time, every member comes once, in the same order', '1:zqgc4,1:zqgc4x,2:'
    || (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4)) || ',2:azqgc4',
  (SELECT got FROM gc4_seen WHERE who = '2' AND what = 'pages')) AS done \gset rh_
SELECT pg_temp.rh_case('a search of handles alone reads no name', '2,3,1',
  (SELECT got FROM gc4_seen WHERE who = '2' AND what = 'handles')) AS done \gset rh_
SELECT pg_temp.rh_case('nothing searched finds no one', '0',
  (SELECT got FROM gc4_seen WHERE who = '2' AND what = 'nothing')) AS done \gset rh_
SELECT pg_temp.rh_case('a member the reader muted is never found', '2,4,1',
  (SELECT got FROM gc4_seen WHERE who = '1' AND what = 'found')) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor finds every one', '2,3,4,1',
  (SELECT got FROM gc4_seen WHERE who = 'visitor' AND what = 'found')) AS done \gset rh_

-- The mute this piece made goes, so no later piece meets it.
DELETE FROM public.user_blocks
 WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 3);

SELECT pg_temp.rh_verdict();
ROLLBACK;
