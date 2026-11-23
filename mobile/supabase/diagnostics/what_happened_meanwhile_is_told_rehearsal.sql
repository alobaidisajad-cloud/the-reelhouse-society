-- ════════════════════════════════════════════════════════════════════════════
-- what_happened_meanwhile_is_told_rehearsal.sql — 20261117_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs what_happened_meanwhile_is_told_rehearsal.sql --with-train
--
-- The train applies 20261117_01 here (with_train); a sealed copy already holds it. Then members in
-- good standing, acting as themselves, find each of its pieces holding: a verdict on a case judged
-- meanwhile or on a piece already gone refused whole; a seat in a dissolved salon refused as gone; an
-- admission that admits no one saying so; a ballot's running count for its voters alone; every
-- viewing counted and the run told with its last day; the feeds counting the critiques the reader
-- can read; a certification pushed once however often given; a withdrawn salon message read as gone
-- in the evidence; a withdrawn filing's card in a salon marked gone; a deliberate rename kept; and a
-- member leaving with their words unsigned, or erased when they choose. The cases that need the
-- triggers are rehearsed with them, in what_goes_takes_its_word_with_it_rehearsal.sql.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
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
CREATE TEMP TABLE rh_a15_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_a15_rows TO authenticated;
CREATE TEMP TABLE rh_a15_got (n serial, what text, got text) ON COMMIT DROP;
GRANT ALL ON rh_a15_got TO authenticated;
CREATE TEMP TABLE rh_f1_members ON COMMIT DROP AS
  SELECT id, n FROM rehearsal_members WHERE n <= 3;
GRANT SELECT ON rh_f1_members TO authenticated;
CREATE TEMP TABLE rh_f1_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_f1_rows TO authenticated;
CREATE TEMP TABLE rh_f1_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON rh_f1_got TO authenticated;
CREATE TEMP TABLE a2_rooms (what text, id uuid) ON COMMIT DROP;
GRANT SELECT ON a2_rooms TO authenticated;
CREATE TEMP TABLE a2_seen (what text, got text) ON COMMIT DROP;
GRANT ALL ON a2_seen TO authenticated;
CREATE TEMP TABLE rh_a7_members ON COMMIT DROP AS
  SELECT id, n FROM rehearsal_members WHERE n <= 4;
GRANT SELECT ON rh_a7_members TO authenticated;
CREATE TEMP TABLE rh_a7_got (who int, got text) ON COMMIT DROP;
GRANT ALL ON rh_a7_got TO authenticated;
CREATE TEMP TABLE b1_ballots (what text, id uuid) ON COMMIT DROP;
GRANT SELECT ON b1_ballots TO authenticated;
CREATE TEMP TABLE b1_seen (what text, got jsonb) ON COMMIT DROP;
GRANT ALL ON b1_seen TO authenticated;
CREATE TEMP TABLE rh_b25_members ON COMMIT DROP AS
  SELECT id, n FROM rehearsal_members WHERE n <= 3;
GRANT SELECT ON rh_b25_members TO authenticated, anon;
CREATE TEMP TABLE rh_b25_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_b25_rows TO authenticated, anon;
CREATE TEMP TABLE rh_b25_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON rh_b25_got TO authenticated, anon;
CREATE TEMP TABLE rh_b25_page (k integer, day date, viewing_id uuid) ON COMMIT DROP;
GRANT ALL ON rh_b25_page TO authenticated;
CREATE TEMP TABLE rh_b4_members ON COMMIT DROP AS
  SELECT id, n FROM rehearsal_members WHERE n <= 4;
GRANT SELECT ON rh_b4_members TO authenticated;
CREATE TEMP TABLE rh_b4_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON rh_b4_got TO authenticated;
GRANT ALL ON rh_b4_got TO anon;
CREATE TEMP TABLE rh_f11_members ON COMMIT DROP AS
  SELECT id, n FROM rehearsal_members WHERE n <= 3;
GRANT SELECT ON rh_f11_members TO authenticated;
CREATE TEMP TABLE rh_f11_own (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_f11_own TO authenticated;
CREATE TEMP TABLE rh_f11_queued (n serial, what text PRIMARY KEY, queued bigint) ON COMMIT DROP;
CREATE TEMP TABLE rh_d1_members ON COMMIT DROP AS
  SELECT id, n FROM rehearsal_members WHERE n <= 4;
GRANT SELECT ON rh_d1_members TO authenticated;
CREATE TEMP TABLE rh_d1_got (who int, got text) ON COMMIT DROP;
GRANT ALL ON rh_d1_got TO authenticated;
CREATE TEMP TABLE rh_f4_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_f4_rows TO authenticated;
CREATE TEMP TABLE rh_d2_who (what text PRIMARY KEY, id uuid, handle text) ON COMMIT DROP;
GRANT SELECT ON rh_d2_who TO authenticated;
CREATE TEMP TABLE rh_d2_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_d2_rows TO authenticated;
CREATE TEMP TABLE rh_d2_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT INSERT, SELECT ON rh_d2_got TO authenticated;
CREATE TEMP TABLE rh_d2_read (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT INSERT ON rh_d2_read TO authenticated;
CREATE TEMP TABLE rh_d2_plan (line text) ON COMMIT DROP;

-- The train applies it here first (with_train), on production as the cars before it left it; a
-- sealed copy already holds every pending migration.
-- 20261117_01 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── A1A5 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: a verdict is given once, and a removal removes something (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Three members in good standing: 1 sits as a moderator for the run, 2 is
-- the member reported, 3 the reporter. As themselves, the moderator finds:
--   a REMOVE CONTENT on a record its author already deleted is refused (PIECE_GONE), the case stays
--   pending, nothing is recorded on 2's enforcement record and nobody is told; the same case can then
--   be dismissed;
--   a REMOVE CONTENT on a salon message already removed is refused the same way, and so is one on a
--   filing its author already ended, while one on a filing that stands empties it as before;
--   a REMOVE CONTENT on a record that stands removes it, records it and tells 2, as before;
--   a warning is carried out as before, and a second verdict on the case it closed is refused
--   (ALREADY_JUDGED): one record, one notice to each.
-- Two verdicts at the same moment need two sessions, which one transaction cannot hold: the lock that
-- decides them (FOR UPDATE on the pending case) is read from the function's definition instead, and
-- the second verdict above is the one that lock hands back, the case found no longer pending.

-- The round's first 3 members in good standing (rehearsal_members, read once before the train).
CREATE TEMP TABLE rh_a15_members ON COMMIT DROP AS
  SELECT m.id, m.n, p.role AS was_role
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id
   WHERE m.n <= 3;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_a15_members), 3) AS done \gset rh_
GRANT SELECT ON rh_a15_members TO authenticated;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- 2's pieces: a record deleted before the case is judged, a record that stands, and a salon message
-- already removed.
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rh_a15_members WHERE n = 2), 990001101, 'rh a gone record', current_date) RETURNING id)
INSERT INTO rh_a15_rows SELECT 'gone log', id FROM r;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rh_a15_members WHERE n = 2), 990001102, 'rh a standing record', current_date) RETURNING id)
INSERT INTO rh_a15_rows SELECT 'standing log', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('The Rehearsal Tribunal Room', (SELECT id FROM rh_a15_members WHERE n = 2), false) RETURNING id)
INSERT INTO rh_a15_rows SELECT 'room', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, deleted_at)
           VALUES ((SELECT id FROM rh_a15_rows WHERE what = 'room'), (SELECT id FROM rh_a15_members WHERE n = 2), '', now())
           RETURNING id)
INSERT INTO rh_a15_rows SELECT 'removed message', id FROM r;
-- And two filings: one that stands, one its author ended before the case is judged (a filing is
-- never deleted, only emptied: the removal's own row count cannot tell the two apart).
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
           SELECT 'take', m.id, p.username, 'rh a standing take', true
             FROM rh_a15_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 2
           RETURNING id)
INSERT INTO rh_a15_rows SELECT 'standing take', id FROM r;
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
           SELECT 'take', m.id, p.username, 'rh an ended take', true
             FROM rh_a15_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 2
           RETURNING id)
INSERT INTO rh_a15_rows SELECT 'ended take', id FROM r;

-- 3 reports each; then 2 deletes the first record.
DELETE FROM public.reports
 WHERE reporter_id = (SELECT id FROM rh_a15_members WHERE n = 3) AND status = 'pending'
   AND content_type = 'profile' AND content_id = (SELECT id::text FROM rh_a15_members WHERE n = 2);
WITH v (what, kind, content) AS (VALUES
    ('case: gone log', 'log', (SELECT id::text FROM rh_a15_rows WHERE what = 'gone log')),
    ('case: standing log', 'log', (SELECT id::text FROM rh_a15_rows WHERE what = 'standing log')),
    ('case: removed message', 'lounge_message', (SELECT id::text FROM rh_a15_rows WHERE what = 'removed message')),
    ('case: standing take', 'dispatch_post', (SELECT id::text FROM rh_a15_rows WHERE what = 'standing take')),
    ('case: ended take', 'dispatch_post', (SELECT id::text FROM rh_a15_rows WHERE what = 'ended take')),
    ('case: the member', 'profile', (SELECT id::text FROM rh_a15_members WHERE n = 2))),
r AS (
  INSERT INTO public.reports (reporter_id, content_type, content_id, reason, status, target_user_id)
  SELECT (SELECT id FROM rh_a15_members WHERE n = 3), v.kind, v.content, 'spam', 'pending',
         (SELECT id FROM rh_a15_members WHERE n = 2)
    FROM v
  RETURNING id, content_type, content_id)
INSERT INTO rh_a15_rows
SELECT v.what, r.id FROM r JOIN v ON v.kind = r.content_type AND v.content = r.content_id;
SELECT pg_temp.rh_need('cases filed', (SELECT count(*) FROM rh_a15_rows WHERE what LIKE 'case: %'), 6) AS done \gset rh_
DELETE FROM public.logs WHERE id = (SELECT id FROM rh_a15_rows WHERE what = 'gone log');
SELECT public.dispatch_empty_filing((SELECT id FROM rh_a15_rows WHERE what = 'ended take'), 'author') AS done \gset rh_
SELECT pg_temp.rh_need('the ended take is ended', (SELECT count(*) FROM public.dispatch_posts
  WHERE id = (SELECT id FROM rh_a15_rows WHERE what = 'ended take') AND ended_at IS NOT NULL), 1) AS done \gset rh_

UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rh_a15_members WHERE n = 1);

-- A verdict, named by what came back: 'ok', or the house's refusal as SQLSTATE: message.
CREATE FUNCTION pg_temp.rh_a15_judge(p_case text, p_action text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.resolve_moderation_report_v2(
    (SELECT id FROM rh_a15_rows WHERE what = p_case), p_action,
    (SELECT id FROM rh_a15_members WHERE n = 1), 'rh reason', NULL, true);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_a15_judge(text, text) TO authenticated;
GRANT USAGE ON SEQUENCE rh_a15_got_n_seq TO authenticated;

-- The moderator judges, as themselves, in this order.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_a15_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_a15_got (what, got) VALUES ('remove the gone log', pg_temp.rh_a15_judge('case: gone log', 'delete_content'));
INSERT INTO rh_a15_got (what, got) VALUES ('then dismiss it', pg_temp.rh_a15_judge('case: gone log', 'dismiss'));
INSERT INTO rh_a15_got (what, got) VALUES ('remove the removed message', pg_temp.rh_a15_judge('case: removed message', 'delete_content'));
INSERT INTO rh_a15_got (what, got) VALUES ('remove the standing log', pg_temp.rh_a15_judge('case: standing log', 'delete_content'));
INSERT INTO rh_a15_got (what, got) VALUES ('remove the ended take', pg_temp.rh_a15_judge('case: ended take', 'delete_content'));
INSERT INTO rh_a15_got (what, got) VALUES ('remove the standing take', pg_temp.rh_a15_judge('case: standing take', 'delete_content'));
INSERT INTO rh_a15_got (what, got) VALUES ('warn the member', pg_temp.rh_a15_judge('case: the member', 'warn'));
INSERT INTO rh_a15_got (what, got) VALUES ('ban on the judged case', pg_temp.rh_a15_judge('case: the member', 'ban'));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  m2 uuid := (SELECT id FROM rh_a15_members WHERE n = 2);
  m3 uuid := (SELECT id FROM rh_a15_members WHERE n = 3);
  gone uuid := (SELECT id FROM rh_a15_rows WHERE what = 'case: gone log');
  msg uuid := (SELECT id FROM rh_a15_rows WHERE what = 'case: removed message');
  stand uuid := (SELECT id FROM rh_a15_rows WHERE what = 'case: standing log');
  twice uuid := (SELECT id FROM rh_a15_rows WHERE what = 'case: the member');
BEGIN
  PERFORM pg_temp.rh_case('REMOVE CONTENT on a record its author already deleted is refused', 'P0002: PIECE_GONE',
    (SELECT got FROM rh_a15_got WHERE what = 'remove the gone log'));
  PERFORM pg_temp.rh_case('and records no removal on the member''s enforcement record', '0',
    (SELECT count(*)::text FROM public.mod_actions WHERE report_id = gone AND action = 'delete_content'));
  PERFORM pg_temp.rh_case('the case stays to be dismissed, and is', 'ok|resolved|dismiss',
    (SELECT got FROM rh_a15_got WHERE what = 'then dismiss it') || '|'
    || (SELECT status || '|' || resolution_action FROM public.reports WHERE id = gone));
  PERFORM pg_temp.rh_case('REMOVE CONTENT on a salon message already removed is refused', 'P0002: PIECE_GONE',
    (SELECT got FROM rh_a15_got WHERE what = 'remove the removed message'));
  PERFORM pg_temp.rh_case('and that case stays pending, nothing recorded', 'pending|0',
    (SELECT status FROM public.reports WHERE id = msg) || '|'
    || (SELECT count(*)::text FROM public.mod_actions WHERE report_id = msg));
  PERFORM pg_temp.rh_case('REMOVE CONTENT on a filing its author already ended is refused', 'P0002: PIECE_GONE|pending|0',
    (SELECT got FROM rh_a15_got WHERE what = 'remove the ended take') || '|'
    || (SELECT status FROM public.reports WHERE id = (SELECT id FROM rh_a15_rows WHERE what = 'case: ended take')) || '|'
    || (SELECT count(*)::text FROM public.mod_actions WHERE report_id = (SELECT id FROM rh_a15_rows WHERE what = 'case: ended take')));
  -- Taken from the paper: emptied (as REMOVE CONTENT ended a filing before round 14), or withheld whole until
  -- its appeal is judged (round 14's H-B10, asked through the row so the rehearsal reads either house).
  PERFORM pg_temp.rh_case('REMOVE CONTENT on a filing that stands takes it from the paper and records it, as before', 'ok|true|resolved|1',
    (SELECT got FROM rh_a15_got WHERE what = 'remove the standing take') || '|'
    || (SELECT (d.ended_at IS NOT NULL OR (to_jsonb(d) ->> 'withheld_at') IS NOT NULL)::text FROM public.dispatch_posts d WHERE d.id = (SELECT id FROM rh_a15_rows WHERE what = 'standing take')) || '|'
    || (SELECT status FROM public.reports WHERE id = (SELECT id FROM rh_a15_rows WHERE what = 'case: standing take')) || '|'
    || (SELECT count(*)::text FROM public.mod_actions WHERE report_id = (SELECT id FROM rh_a15_rows WHERE what = 'case: standing take') AND action = 'delete_content'));
  PERFORM pg_temp.rh_case('the member is told of the two removals made, a record and a filing', '2',
    (SELECT count(*)::text FROM public.notifications
      WHERE user_id = m2 AND title = 'A Notice from the House' AND metadata ->> 'action' = 'delete_content'
        AND created_at >= now()));
  -- Removed: deleted (before round 14), or withheld whole until its appeal is judged (round 14's H-B10).
  PERFORM pg_temp.rh_case('REMOVE CONTENT on a record that stands removes it and records it, as before', 'ok|0|resolved|1',
    (SELECT got FROM rh_a15_got WHERE what = 'remove the standing log') || '|'
    || (SELECT count(*)::text FROM public.logs l WHERE l.id = (SELECT id FROM rh_a15_rows WHERE what = 'standing log')
          AND (to_jsonb(l) ->> 'withheld_at') IS NULL) || '|'
    || (SELECT status FROM public.reports WHERE id = stand) || '|'
    || (SELECT count(*)::text FROM public.mod_actions WHERE report_id = stand AND action = 'delete_content'));
  PERFORM pg_temp.rh_case('a warning is carried out as before', 'ok|warn',
    (SELECT got FROM rh_a15_got WHERE what = 'warn the member') || '|'
    || (SELECT resolution_action FROM public.reports WHERE id = twice));
  PERFORM pg_temp.rh_case('a second verdict on a case already judged is refused', 'P0002: ALREADY_JUDGED',
    (SELECT got FROM rh_a15_got WHERE what = 'ban on the judged case'));
  PERFORM pg_temp.rh_case('and carries out nothing: one record, the member not banned, one notice each', '1|false|1|1',
    (SELECT count(*)::text FROM public.mod_actions WHERE report_id = twice) || '|'
    || (SELECT coalesce(is_banned, false)::text FROM public.profiles WHERE id = m2) || '|'
    || (SELECT count(*)::text FROM public.notifications
         WHERE user_id = m2 AND title = 'A Notice from the House' AND metadata ->> 'action' IN ('warn', 'ban')
           AND created_at >= now()) || '|'
    || (SELECT count(*)::text FROM public.notifications
         WHERE user_id = m3 AND title = 'Your Report Was Reviewed' AND metadata ->> 'report_id' = twice::text));
  PERFORM pg_temp.rh_case('two verdicts at once: the pending case is read under a lock, and closed only while pending', 'true|true',
    (position('FOR UPDATE' IN pg_get_functiondef('public.resolve_moderation_report_v2'::regproc)) > 0)::text || '|'
    || (position('WHERE id = p_report_id AND status = ''pending'';' IN pg_get_functiondef('public.resolve_moderation_report_v2'::regproc)) > 0)::text);
END $$;

-- The moderator's seat goes back to what it was, for the pieces after this one.
UPDATE public.profiles p SET role = m.was_role FROM rh_a15_members m WHERE m.n = 1 AND p.id = m.id;

-- ── F1 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece F1: a withdrawn salon message is evidence destroyed (review round 11) ────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Three members in good standing: 1 sits as a moderator for the run, 2
-- writes two messages in a salon of their own, 3 reports both. 2 withdraws the first, as themselves.
-- The moderator, as themselves, reads the evidence of each case: the withdrawn message reads as
-- destroyed (found: false), the standing one as before (found, its words and its room); a removal
-- of the withdrawn one is still refused as PIECE_GONE, and the case stays pending.

-- The round's first 3 members in good standing (rehearsal_members, read once before the train).
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_f1_members), 3) AS done \gset rh_

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- 2's salon and its two messages, laid by the house as the app's send lays them.
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('The Rehearsal Evidence Room', (SELECT id FROM rh_f1_members WHERE n = 2), false) RETURNING id)
INSERT INTO rh_f1_rows SELECT 'room', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_f1_rows WHERE what = 'room'), (SELECT id FROM rh_f1_members WHERE n = 2), 'rh f1 words withdrawn')
           RETURNING id)
INSERT INTO rh_f1_rows SELECT 'withdrawn message', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_f1_rows WHERE what = 'room'), (SELECT id FROM rh_f1_members WHERE n = 2), 'rh f1 words standing')
           RETURNING id)
INSERT INTO rh_f1_rows SELECT 'standing message', id FROM r;

-- 3 reports each.
WITH v (what, content) AS (VALUES
    ('case: withdrawn', (SELECT id::text FROM rh_f1_rows WHERE what = 'withdrawn message')),
    ('case: standing', (SELECT id::text FROM rh_f1_rows WHERE what = 'standing message'))),
r AS (
  INSERT INTO public.reports (reporter_id, content_type, content_id, reason, status, target_user_id)
  SELECT (SELECT id FROM rh_f1_members WHERE n = 3), 'lounge_message', v.content, 'spam', 'pending',
         (SELECT id FROM rh_f1_members WHERE n = 2)
    FROM v
  RETURNING id, content_id)
INSERT INTO rh_f1_rows
SELECT v.what, r.id FROM r JOIN v ON v.content = r.content_id;
SELECT pg_temp.rh_need('cases filed', (SELECT count(*) FROM rh_f1_rows WHERE what LIKE 'case: %'), 2) AS done \gset rh_

UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rh_f1_members WHERE n = 1);

-- 2 withdraws the first message, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_f1_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.withdraw_lounge_message((SELECT id FROM rh_f1_rows WHERE what = 'withdrawn message')) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- A removal, named by what came back: 'ok', or the house's refusal as SQLSTATE: message.
CREATE FUNCTION pg_temp.rh_f1_remove(p_case text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.resolve_moderation_report_v2(
    (SELECT id FROM rh_f1_rows WHERE what = p_case), 'delete_content',
    (SELECT id FROM rh_f1_members WHERE n = 1), 'rh reason', NULL, true);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_f1_remove(text) TO authenticated;

-- The moderator reads both exhibits, then tries to remove the withdrawn one, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_f1_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_f1_got VALUES
  ('withdrawn', public.get_report_evidence((SELECT id FROM rh_f1_rows WHERE what = 'case: withdrawn'))::text),
  ('standing', public.get_report_evidence((SELECT id FROM rh_f1_rows WHERE what = 'case: standing'))::text);
INSERT INTO rh_f1_got VALUES ('remove the withdrawn', pg_temp.rh_f1_remove('case: withdrawn'));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  room uuid := (SELECT id FROM rh_f1_rows WHERE what = 'room');
  standing jsonb := (SELECT got::jsonb FROM rh_f1_got WHERE what = 'standing');
BEGIN
  PERFORM pg_temp.rh_case('a withdrawn salon message reads as destroyed', '{"found": false}',
    (SELECT got FROM rh_f1_got WHERE what = 'withdrawn'));
  PERFORM pg_temp.rh_case('a standing salon message reads as before: its words and its room',
    'true|rh f1 words standing|/lounge/' || room,
    (standing ->> 'found') || '|' || (standing ->> 'body') || '|' || (standing ->> 'route'));
  PERFORM pg_temp.rh_case('a removal of the withdrawn message is still refused as gone', 'P0002: PIECE_GONE',
    (SELECT got FROM rh_f1_got WHERE what = 'remove the withdrawn'));
  PERFORM pg_temp.rh_case('and its case stays pending, to be dismissed or judged on the member', 'pending',
    (SELECT status FROM public.reports WHERE id = (SELECT id FROM rh_f1_rows WHERE what = 'case: withdrawn')));
END $$;

-- ── A2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── A2 rehearsal · a dissolved salon's doors say it is gone ─────────────────────────────────────
--   Run inside the round's rehearsal, after rehearsal_kit.sql and its rehearsal_members (four
--   members in good standing, n = 1..4), the round's migration applied. Member 1 hosts an open
--   salon and a private one. Member 2, as themselves, knocks at both while they stand: whatever
--   the house answers there (a seat, a request, or a refusal for the rank), it is never SALON_GONE.
--   Member 1 dissolves both, as themselves; member 2 knocks again and is told SALON_GONE (P0002)
--   at each door. Every row goes with the rehearsal's rollback.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('A2 Rehearsal Open', (SELECT id FROM rehearsal_members WHERE n = 1), false)
  RETURNING id)
INSERT INTO a2_rooms SELECT 'open', id FROM made;
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('A2 Rehearsal Private', (SELECT id FROM rehearsal_members WHERE n = 1), true)
  RETURNING id)
INSERT INTO a2_rooms SELECT 'private', id FROM made;
DELETE FROM public.lounge_members
 WHERE lounge_id IN (SELECT id FROM a2_rooms) AND user_id = (SELECT id FROM rehearsal_members WHERE n = 2);
DELETE FROM public.lounge_sanctions
 WHERE lounge_id IN (SELECT id FROM a2_rooms) AND user_id = (SELECT id FROM rehearsal_members WHERE n = 2);

-- Member 2 knocks at both while they stand, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
BEGIN
  BEGIN
    PERFORM public.join_public_lounge((SELECT id FROM a2_rooms WHERE what = 'open'));
    INSERT INTO a2_seen VALUES ('seat, standing', 'answered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO a2_seen VALUES ('seat, standing', SQLSTATE || ' ' || SQLERRM);
  END;
  BEGIN
    PERFORM public.request_lounge_membership((SELECT id FROM a2_rooms WHERE what = 'private'));
    INSERT INTO a2_seen VALUES ('request, standing', 'answered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO a2_seen VALUES ('request, standing', SQLSTATE || ' ' || SQLERRM);
  END;
END $$;

-- The host dissolves both, as themselves.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.lounges WHERE id IN (SELECT id FROM a2_rooms);

-- Member 2 knocks again.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
BEGIN
  BEGIN
    PERFORM public.join_public_lounge((SELECT id FROM a2_rooms WHERE what = 'open'));
    INSERT INTO a2_seen VALUES ('seat, dissolved', 'answered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO a2_seen VALUES ('seat, dissolved', SQLSTATE || ' ' || SQLERRM);
  END;
  BEGIN
    PERFORM public.request_lounge_membership((SELECT id FROM a2_rooms WHERE what = 'private'));
    INSERT INTO a2_seen VALUES ('request, dissolved', 'answered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO a2_seen VALUES ('request, dissolved', SQLSTATE || ' ' || SQLERRM);
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('the host dissolved both salons, as themselves', '0',
  (SELECT count(*)::text FROM public.lounges WHERE id IN (SELECT id FROM a2_rooms))) AS done \gset rh_
SELECT pg_temp.rh_case('a seat in a standing salon is never told as gone', 'false',
  (SELECT (got LIKE '%SALON_GONE%')::text FROM a2_seen WHERE what = 'seat, standing')) AS done \gset rh_
SELECT pg_temp.rh_case('nor a request at a standing salon''s door', 'false',
  (SELECT (got LIKE '%SALON_GONE%')::text FROM a2_seen WHERE what = 'request, standing')) AS done \gset rh_
SELECT pg_temp.rh_case('a seat in a dissolved salon is refused as gone', 'P0002 SALON_GONE',
  (SELECT got FROM a2_seen WHERE what = 'seat, dissolved')) AS done \gset rh_
SELECT pg_temp.rh_case('and a request at its door', 'P0002 SALON_GONE',
  (SELECT got FROM a2_seen WHERE what = 'request, dissolved')) AS done \gset rh_

-- ── A7 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: an admission says whether anyone was admitted (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Four members in good standing; 2, 3 and 4 each ask at 1's door. 2
-- withdraws; 4's request is left waiting across a block 1 makes in the same moment. Member 1, as
-- themselves, admits each: 3 is admitted (true) and told and counted as before; 2's withdrawn request
-- admits no one (false); 4's across the block admits no one (false) and leaves the door.

-- The round's first 4 members in good standing (rehearsal_members, read once before the train).
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_a7_members), 4) AS done \gset rh_

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- Nothing between the four before the run, so each answer is the run's own doing.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rh_a7_members) AND blocked_id IN (SELECT id FROM rh_a7_members);
DELETE FROM public.interactions
 WHERE type IN ('follow', 'follow_request')
   AND user_id IN (SELECT id FROM rh_a7_members) AND target_user_id IN (SELECT id FROM rh_a7_members);

-- 2 and 3 ask at 1's door, a day ago (a member may act once a second).
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
SELECT a.id, b.id, 'follow_request', now() - interval '1 day'
  FROM rh_a7_members a, rh_a7_members b WHERE a.n IN (2, 3) AND b.n = 1;
-- 4 asks too, in the same moment as a block 1 makes: the block is made while the row is something
-- else, and the row becomes the request.
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
SELECT a.id, b.id, 'rehearsal_waiting', now() - interval '1 day'
  FROM rh_a7_members a, rh_a7_members b WHERE a.n = 4 AND b.n = 1;
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
SELECT b.id, a.id, 'block' FROM rh_a7_members a, rh_a7_members b WHERE a.n = 4 AND b.n = 1;
UPDATE public.interactions SET type = 'follow_request'
 WHERE type = 'rehearsal_waiting'
   AND user_id = (SELECT id FROM rh_a7_members WHERE n = 4)
   AND target_user_id = (SELECT id FROM rh_a7_members WHERE n = 1);
-- 2 withdraws.
DELETE FROM public.interactions
 WHERE type = 'follow_request'
   AND user_id = (SELECT id FROM rh_a7_members WHERE n = 2)
   AND target_user_id = (SELECT id FROM rh_a7_members WHERE n = 1);

CREATE TEMP TABLE rh_a7_counted ON COMMIT DROP AS
  SELECT m.n, p.followers_count, p.following_count
    FROM rh_a7_members m JOIN public.profiles p ON p.id = m.id;

-- 1 presses ADMIT on each, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_a7_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_a7_got SELECT 3, public.accept_follow_request((SELECT id FROM rh_a7_members WHERE n = 3))::text;
INSERT INTO rh_a7_got SELECT 2, public.accept_follow_request((SELECT id FROM rh_a7_members WHERE n = 2))::text;
INSERT INTO rh_a7_got SELECT 4, public.accept_follow_request((SELECT id FROM rh_a7_members WHERE n = 4))::text;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  m1 uuid := (SELECT id FROM rh_a7_members WHERE n = 1);
  m2 uuid := (SELECT id FROM rh_a7_members WHERE n = 2);
  m3 uuid := (SELECT id FROM rh_a7_members WHERE n = 3);
  m4 uuid := (SELECT id FROM rh_a7_members WHERE n = 4);
BEGIN
  PERFORM pg_temp.rh_case('a request at the door is admitted, and the house says so', 'true',
    (SELECT got FROM rh_a7_got WHERE who = 3));
  PERFORM pg_temp.rh_case('and it is a follow, told and counted as before', '1|1|1/1',
    (SELECT count(*)::text FROM public.interactions WHERE user_id = m3 AND target_user_id = m1 AND type = 'follow') || '|'
    || (SELECT count(*)::text FROM public.notifications WHERE user_id = m3 AND type = 'follow_accept' AND from_user_id = m1 AND created_at >= now()) || '|'
    || (SELECT (a.followers_count - ca.followers_count) || '/' || (b.following_count - cb.following_count)
          FROM public.profiles a, public.profiles b, rh_a7_counted ca, rh_a7_counted cb
         WHERE a.id = m1 AND ca.n = 1 AND b.id = m3 AND cb.n = 3));
  PERFORM pg_temp.rh_case('a request withdrawn meanwhile admits no one, and the house says so', 'false',
    (SELECT got FROM rh_a7_got WHERE who = 2));
  PERFORM pg_temp.rh_case('no follow, no notice', '0|0',
    (SELECT count(*)::text FROM public.interactions WHERE user_id = m2 AND target_user_id = m1 AND type = 'follow') || '|'
    || (SELECT count(*)::text FROM public.notifications WHERE user_id = m2 AND type = 'follow_accept' AND from_user_id = m1 AND created_at >= now()));
  PERFORM pg_temp.rh_case('a request across a block admits no one, and the house says so', 'false',
    (SELECT got FROM rh_a7_got WHERE who = 4));
  PERFORM pg_temp.rh_case('and it leaves the door, no follow made', '0|0',
    (SELECT count(*)::text FROM public.interactions WHERE user_id = m4 AND target_user_id = m1 AND type = 'follow_request') || '|'
    || (SELECT count(*)::text FROM public.interactions WHERE user_id = m4 AND target_user_id = m1 AND type = 'follow'));
  PERFORM pg_temp.rh_case('members call it, visitors do not', 'true|false',
    has_function_privilege('authenticated', 'public.accept_follow_request(uuid)', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.accept_follow_request(uuid)', 'EXECUTE')::text);
END $$;

-- ── B1 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── B1 rehearsal · an open ballot is counted for its voters alone ───────────────────────────────
--   Run inside the round's rehearsal, after rehearsal_kit.sql and its rehearsal_members (four
--   members in good standing, n = 1..4), the round's migration applied. Member 1 files an open
--   ballot, and a closed one that 2 voted in before it closed. Each member acts as themselves:
--   3, who has not voted, is told nothing of the open one; 2 votes and reads one ballot cast, on
--   the option they marked; 3 votes and reads two; 4, who never voted, reads the closed one's
--   count; and no one reads the count of a ballot its author withdrew.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Nothing stands between the four, so each case is this run's own doing.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, options, closes_at, is_published)
  SELECT 'ballot', m.id, p.username, 'B1 rehearsal: open', 'B1 rehearsal: open',
         '[{"film_id":1,"title":"rh one"},{"film_id":2,"title":"rh two"},{"film_id":3,"title":"rh three"}]'::jsonb, now() + interval '3 days', true
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO b1_ballots SELECT 'open', id FROM made;
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, options, closes_at, is_published, created_at)
  SELECT 'ballot', m.id, p.username, 'B1 rehearsal: closed', 'B1 rehearsal: closed',
         '[{"film_id":1,"title":"rh one"},{"film_id":2,"title":"rh two"}]'::jsonb, now() - interval '1 day', true, now() - interval '4 days'
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO b1_ballots SELECT 'closed', id FROM made;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
VALUES ((SELECT id FROM b1_ballots WHERE what = 'closed'), (SELECT id FROM rehearsal_members WHERE n = 2), 0);

SET LOCAL ROLE authenticated;
-- 3 has not voted: nothing.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO b1_seen SELECT '3 before voting', public.ballot_tally((SELECT id FROM b1_ballots WHERE what = 'open'));
-- 2 votes for the second film, and reads.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
VALUES ((SELECT id FROM b1_ballots WHERE what = 'open'), (SELECT id FROM rehearsal_members WHERE n = 2), 1);
INSERT INTO b1_seen SELECT '2 voted', public.ballot_tally((SELECT id FROM b1_ballots WHERE what = 'open'));
-- 3 votes for the second film too, and reads.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.dispatch_votes (post_id, user_id, option_index)
VALUES ((SELECT id FROM b1_ballots WHERE what = 'open'), (SELECT id FROM rehearsal_members WHERE n = 3), 1);
INSERT INTO b1_seen SELECT '3 voted', public.ballot_tally((SELECT id FROM b1_ballots WHERE what = 'open'));
-- 4 never voted: the open one is not theirs to see, the closed one is.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO b1_seen SELECT '4 open', public.ballot_tally((SELECT id FROM b1_ballots WHERE what = 'open'));
INSERT INTO b1_seen SELECT '4 closed', public.ballot_tally((SELECT id FROM b1_ballots WHERE what = 'closed'));
RESET ROLE;

-- The author withdraws the open ballot, as themselves; 2, who voted, reads nothing of it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.end_filing((SELECT id FROM b1_ballots WHERE what = 'open'), 'author') AS done \gset rh_
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO b1_seen SELECT '2 withdrawn', public.ballot_tally((SELECT id FROM b1_ballots WHERE what = 'open'));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('an open ballot''s count is not given to a member who has not voted', 'null',
  coalesce((SELECT got::text FROM b1_seen WHERE what = '3 before voting'), 'null')) AS done \gset rh_
SELECT pg_temp.rh_case('a voter reads one ballot cast, their own', '1',
  (SELECT got ->> 'total' FROM b1_seen WHERE what = '2 voted')) AS done \gset rh_
SELECT pg_temp.rh_case('on the option they marked', '1',
  (SELECT got -> 'counts' ->> '1' FROM b1_seen WHERE what = '2 voted')) AS done \gset rh_
SELECT pg_temp.rh_case('the next voter reads two', '2',
  (SELECT got ->> 'total' FROM b1_seen WHERE what = '3 voted')) AS done \gset rh_
SELECT pg_temp.rh_case('in frozen_totals'' shape', 'counts,total',
  (SELECT string_agg(k, ',' ORDER BY k) FROM b1_seen, jsonb_object_keys(got) k WHERE what = '3 voted')) AS done \gset rh_
SELECT pg_temp.rh_case('a member who never voted reads nothing of the open ballot', 'null',
  coalesce((SELECT got::text FROM b1_seen WHERE what = '4 open'), 'null')) AS done \gset rh_
SELECT pg_temp.rh_case('and reads a closed ballot''s count', '1',
  (SELECT got ->> 'total' FROM b1_seen WHERE what = '4 closed')) AS done \gset rh_
SELECT pg_temp.rh_case('no one reads a withdrawn ballot''s count', 'null',
  coalesce((SELECT got::text FROM b1_seen WHERE what = '2 withdrawn'), 'null')) AS done \gset rh_

-- ── B2B5 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: every viewing keeps its own day, and a run is judged by the member's own day (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Three members in good standing, each acting as themselves:
--   1 logs four films on four nights running and then sees the second film again on a fifth night,
--   through the house's own rewatch (log_viewing_add). Their calendar holds all five nights, a film
--   each; both runs are five nights; the newest run is five, ending tonight; the months count five
--   viewings and four records, as the Archive files them; the year holds the earlier viewing on its
--   own night, with the mark it had then, and a page read on from a row starts after that row.
--   2 last watched the night before last: current_streak says 0 as it always did, and current_run
--   still gives that run whole, for the phone to judge on its own calendar; a viewing dated a month
--   ahead is today nowhere, so it is not taken for the newest run.
--   3 is a stranger: reads 1's calendar while 1's file is open; once it is private, no day, no
--   viewing, no year and no analytics of theirs.
-- "Tonight" is the house's day (current_date); the member's own day is the phone's to judge.

-- The round's first 3 members in good standing (rehearsal_members, read once before the train).
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_b25_members), 3) AS done \gset rh_

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- Nothing stands between the three, nobody follows 1, 1's file is open, and 1's and 2's records
-- are only the run's own.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rh_b25_members) AND blocked_id IN (SELECT id FROM rh_b25_members);
DELETE FROM public.interactions
 WHERE user_id IN (SELECT id FROM rh_b25_members) AND target_user_id IN (SELECT id FROM rh_b25_members);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT id FROM rh_b25_members WHERE n = 1);
DELETE FROM public.logs WHERE user_id IN (SELECT id FROM rh_b25_members WHERE n IN (1, 2));

-- 1: four films, four nights running, the last of them last night; the second marked 5.
WITH r AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, rating)
  SELECT (SELECT id FROM rh_b25_members WHERE n = 1), 990001200 + k, 'rh night ' || k, current_date - (5 - k), k + 1
    FROM generate_series(1, 4) AS k
  RETURNING id, film_id)
INSERT INTO rh_b25_rows SELECT 'night ' || (film_id - 990001200), id FROM r;
UPDATE public.logs SET rating = 5 WHERE id = (SELECT id FROM rh_b25_rows WHERE what = 'night 2');

-- 2: three nights running, ending the night before last, never seen again.
INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
SELECT (SELECT id FROM rh_b25_members WHERE n = 2), 990001210 + k, 'rh ended ' || k, current_date - (1 + k)
  FROM generate_series(1, 3) AS k;


-- 1, as themselves: sees the second film again tonight, marked 2, and reads their own file.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_b25_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.log_viewing_add((SELECT id FROM rh_b25_rows WHERE what = 'night 2'), gen_random_uuid(),
                              jsonb_build_object('watched_date', current_date, 'rating', 2)) AS done \gset rh_
INSERT INTO rh_b25_got
SELECT 'calendar', coalesce(string_agg((current_date - c.day)::text || ':' || c.films, ',' ORDER BY c.day DESC), 'none')
  FROM public.calendar_days((SELECT id FROM rh_b25_members WHERE n = 1)) c;
INSERT INTO rh_b25_got
SELECT 'analytics', public.get_user_analytics((SELECT id FROM rh_b25_members WHERE n = 1))::text;
INSERT INTO rh_b25_got
SELECT 'year', coalesce(string_agg(y.film_title || '@' || (current_date - y.day) || '=' || coalesce(y.rating::text, '-'), ',' ORDER BY y.day DESC, y.viewing_id DESC), 'none')
  FROM (SELECT * FROM public.year_viewings((SELECT id FROM rh_b25_members WHERE n = 1), extract(year FROM current_date - 3)::integer)
        UNION ALL
        SELECT * FROM public.year_viewings((SELECT id FROM rh_b25_members WHERE n = 1), extract(year FROM current_date)::integer)
         WHERE extract(year FROM current_date) <> extract(year FROM current_date - 3)) y
 WHERE y.film_title = 'rh night 2';
-- A page read on from the second viewing of a year starts after it: the year of last night, which
-- holds two of the run's viewings at least whatever the date.
INSERT INTO rh_b25_page
SELECT row_number() OVER (ORDER BY y.day DESC, y.viewing_id DESC), y.day, y.viewing_id
  FROM public.year_viewings((SELECT id FROM rh_b25_members WHERE n = 1), extract(year FROM current_date - 1)::integer) y;
INSERT INTO rh_b25_got
SELECT 'read on', (SELECT count(*) FROM rh_b25_page WHERE k = 2)::text || '|'
    || ((SELECT string_agg(y.day::text || '/' || y.viewing_id::text, ',' ORDER BY y.day DESC, y.viewing_id DESC)
           FROM public.year_viewings((SELECT id FROM rh_b25_members WHERE n = 1), extract(year FROM current_date - 1)::integer,
                                     (SELECT day FROM rh_b25_page WHERE k = 2), (SELECT viewing_id FROM rh_b25_page WHERE k = 2)) y)
        IS NOT DISTINCT FROM
        (SELECT string_agg(p.day::text || '/' || p.viewing_id::text, ',' ORDER BY p.k) FROM rh_b25_page p WHERE p.k > 2))::text;

-- 2, as themselves: their calendar and their file; then with a viewing dated a month ahead.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_b25_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_b25_got
SELECT 'ended calendar', coalesce(string_agg((current_date - c.day)::text || ':' || c.films, ',' ORDER BY c.day DESC), 'none')
  FROM public.calendar_days((SELECT id FROM rh_b25_members WHERE n = 2)) c;
INSERT INTO rh_b25_got
SELECT 'ended', public.get_user_analytics((SELECT id FROM rh_b25_members WHERE n = 2))::text;
INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
VALUES ((SELECT id FROM rh_b25_members WHERE n = 2), 990001214, 'rh ahead', current_date + 30);
INSERT INTO rh_b25_got
SELECT 'ahead', public.get_user_analytics((SELECT id FROM rh_b25_members WHERE n = 2))::text;

-- 3, a stranger, reads 1's open file.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_b25_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_b25_got
SELECT 'stranger, open', coalesce(string_agg((current_date - c.day)::text || ':' || c.films, ',' ORDER BY c.day DESC), 'none')
  FROM public.calendar_days((SELECT id FROM rh_b25_members WHERE n = 1)) c;
RESET ROLE;

-- 1's file made private; 3 reads it again.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT id FROM rh_b25_members WHERE n = 1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_b25_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_b25_got
SELECT 'stranger, private',
       (SELECT count(*) FROM public.calendar_days((SELECT id FROM rh_b25_members WHERE n = 1)))::text || '|'
    || (SELECT count(*) FROM public.member_viewings((SELECT id FROM rh_b25_members WHERE n = 1)))::text || '|'
    || (SELECT count(*) FROM public.year_viewings((SELECT id FROM rh_b25_members WHERE n = 1), extract(year FROM current_date)::integer))::text || '|'
    || (public.get_user_analytics((SELECT id FROM rh_b25_members WHERE n = 1)) ->> 'error');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  a  json := (SELECT got FROM rh_b25_got WHERE what = 'analytics')::json;
  e  json := (SELECT got FROM rh_b25_got WHERE what = 'ended')::json;
  f  json := (SELECT got FROM rh_b25_got WHERE what = 'ahead')::json;
BEGIN
  PERFORM pg_temp.rh_case('a rewatch keeps the night before it: five nights on the calendar, a film each', '0:1,1:1,2:1,3:1,4:1',
    (SELECT got FROM rh_b25_got WHERE what = 'calendar'));
  PERFORM pg_temp.rh_case('the run and the longest run are five nights', '5|5',
    (a ->> 'current_streak') || '|' || (a ->> 'longest_streak'));
  PERFORM pg_temp.rh_case('the newest run is given whole: five, ending tonight', '5|' || current_date::text,
    (a -> 'current_run' ->> 'length') || '|' || (a -> 'current_run' ->> 'ends_on'));
  PERFORM pg_temp.rh_case('the months count five viewings, and the Archive''s four records as before', '5|4',
    (SELECT sum((m ->> 'count')::integer)::text FROM json_array_elements(a -> 'monthly_viewings') m) || '|'
    || (SELECT sum((m ->> 'count')::integer)::text FROM json_array_elements(a -> 'monthly_activity') m));
  PERFORM pg_temp.rh_case('the year holds both viewings of the film, each on its night with its mark', 'rh night 2@0=2,rh night 2@3=5',
    (SELECT got FROM rh_b25_got WHERE what = 'year'));
  PERFORM pg_temp.rh_case('a page read on from a row is the rows after it, and only those', '1|true',
    (SELECT got FROM rh_b25_got WHERE what = 'read on'));
  PERFORM pg_temp.rh_case('a member who never rewatched: their nights on the calendar as before', '2:1,3:1,4:1',
    (SELECT got FROM rh_b25_got WHERE what = 'ended calendar'));
  PERFORM pg_temp.rh_case('a run ended the night before last: current_streak 0 as before, the longest 3', '0|3',
    (e ->> 'current_streak') || '|' || (e ->> 'longest_streak'));
  PERFORM pg_temp.rh_case('and the run is still given whole, for the phone to judge', '3|' || (current_date - 2)::text,
    (e -> 'current_run' ->> 'length') || '|' || (e -> 'current_run' ->> 'ends_on'));
  PERFORM pg_temp.rh_case('a viewing dated a month ahead is not the newest run', '3|' || (current_date - 2)::text,
    (f -> 'current_run' ->> 'length') || '|' || (f -> 'current_run' ->> 'ends_on'));
  PERFORM pg_temp.rh_case('a stranger reads an open member''s nights', '0:1,1:1,2:1,3:1,4:1',
    (SELECT got FROM rh_b25_got WHERE what = 'stranger, open'));
  PERFORM pg_temp.rh_case('and none of a private member''s: no day, no viewing, no year, no analytics', '0|0|0|forbidden',
    (SELECT got FROM rh_b25_got WHERE what = 'stranger, private'));
END $$;

-- ── B4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: a log's critiques are the reader's (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Four members in good standing: 1 files a reviewed record, 2 and 4
-- critique it, 3 follows 1 and has muted 2. As themselves, they find:
--   3's house feed and following feed count the record's critiques without 2's: 1, as 3's own read
--   of the critiques counts them, and as critiques_seen counts them;
--   4, who hides no one, reads 2 in the house feed, as before;
--   3, once 2 is let back, reads 2 again.

-- The round's first 4 members in good standing (rehearsal_members, read once before the train).
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_b4_members), 4) AS done \gset rh_

-- As the house: nothing stands between the four, 1's file is open, 3 follows 1, and 3 mutes 2.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rh_b4_members) AND blocked_id IN (SELECT id FROM rh_b4_members);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT id FROM rh_b4_members WHERE n = 1);
DELETE FROM public.interactions
 WHERE user_id = (SELECT id FROM rh_b4_members WHERE n = 3) AND target_user_id = (SELECT id FROM rh_b4_members WHERE n = 1)
   AND type IN ('follow', 'follow_request');
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES ((SELECT id FROM rh_b4_members WHERE n = 3), (SELECT id FROM rh_b4_members WHERE n = 1), 'follow');

CREATE TEMP TABLE rh_b4_log ON COMMIT DROP AS
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
           VALUES ((SELECT id FROM rh_b4_members WHERE n = 1), 990001501, 'rh a record critiqued', current_date, 'rh a review')
           RETURNING id)
SELECT id FROM r;
GRANT SELECT ON rh_b4_log TO authenticated;
INSERT INTO public.log_comments (log_id, user_id, username, body)
SELECT (SELECT id FROM rh_b4_log), m.id, p.username, 'rh a critique'
  FROM rh_b4_members m JOIN public.profiles p ON p.id = m.id WHERE m.n IN (2, 4);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rh_b4_members WHERE n = 3), (SELECT id FROM rh_b4_members WHERE n = 2), 'mute');


-- 3 reads, as themselves, with 2 muted.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_b4_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_b4_got SELECT 'house feed, muted', f.critique_count::text
  FROM public.get_community_feed_auth_cursor(200, NULL, NULL) f WHERE f.id = (SELECT id FROM rh_b4_log);
INSERT INTO rh_b4_got SELECT 'following feed, muted', f.critique_count::text
  FROM public.get_following_feed_auth_cursor(200, NULL, NULL) f WHERE f.id = (SELECT id FROM rh_b4_log);
INSERT INTO rh_b4_got SELECT 'the page, muted', count(*)::text
  FROM public.log_comments WHERE log_id = (SELECT id FROM rh_b4_log);
INSERT INTO rh_b4_got SELECT 'critiques_seen, muted', public.critiques_seen(l)::text
  FROM public.logs l WHERE l.id = (SELECT id FROM rh_b4_log);
-- 4 reads, hiding no one.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_b4_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_b4_got SELECT 'house feed, hiding no one', f.critique_count::text
  FROM public.get_community_feed_auth_cursor(200, NULL, NULL) f WHERE f.id = (SELECT id FROM rh_b4_log);
INSERT INTO rh_b4_got SELECT 'critiques_seen, hiding no one', public.critiques_seen(l)::text
  FROM public.logs l WHERE l.id = (SELECT id FROM rh_b4_log);
RESET ROLE;

-- 3 lets 2 back, and reads again.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks WHERE blocker_id = (SELECT id FROM rh_b4_members WHERE n = 3) AND blocked_id = (SELECT id FROM rh_b4_members WHERE n = 2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_b4_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_b4_got SELECT 'following feed, let back', f.critique_count::text
  FROM public.get_following_feed_auth_cursor(200, NULL, NULL) f WHERE f.id = (SELECT id FROM rh_b4_log);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('the house feed counts a record''s critiques without the member its reader muted', '1',
  (SELECT got FROM rh_b4_got WHERE what = 'house feed, muted')) AS done \gset rh_
SELECT pg_temp.rh_case('and so does the following feed', '1',
  (SELECT got FROM rh_b4_got WHERE what = 'following feed, muted')) AS done \gset rh_
SELECT pg_temp.rh_case('as the record''s page counts them', '1',
  (SELECT got FROM rh_b4_got WHERE what = 'the page, muted')) AS done \gset rh_
SELECT pg_temp.rh_case('and as a direct read''s critiques_seen counts them', '1',
  (SELECT got FROM rh_b4_got WHERE what = 'critiques_seen, muted')) AS done \gset rh_
SELECT pg_temp.rh_case('a reader who hides no one reads every critique in the house feed, as before', '2',
  (SELECT got FROM rh_b4_got WHERE what = 'house feed, hiding no one')) AS done \gset rh_
SELECT pg_temp.rh_case('and in critiques_seen', '2',
  (SELECT got FROM rh_b4_got WHERE what = 'critiques_seen, hiding no one')) AS done \gset rh_
SELECT pg_temp.rh_case('a member let back is counted again', '2',
  (SELECT got FROM rh_b4_got WHERE what = 'following feed, let back')) AS done \gset rh_

-- A visitor is not given the reader's count (a visitor hides no one, and reads log_counts'): refused.
GRANT SELECT ON rh_b4_log TO anon;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) AS done \gset rh_
DO $$
BEGIN
  BEGIN
    PERFORM public.critiques_seen(jsonb_populate_record(NULL::public.logs, jsonb_build_object('id', (SELECT id FROM rh_b4_log))));
    INSERT INTO rh_b4_got VALUES ('critiques_seen, a visitor', 'answered');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO rh_b4_got VALUES ('critiques_seen, a visitor', 'refused');
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor is not given critiques_seen, and reads log_counts'' count', 'refused',
  (SELECT got FROM rh_b4_got WHERE what = 'critiques_seen, a visitor')) AS done \gset rh_

-- ── F11 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece F11: a certification buzzes the phone once (review round 11) ─────────────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest, so no push queued here is ever sent). Three members in good standing:
-- 1 keeps a record and a stack and files a take; 1 and 2 each critique the take. The pushes are
-- counted as notify-push's queue grows (net.http_request_queue), the owner's switch on and nothing
-- standing between the three. Then:
--   2 certifies the record: one push. 2 takes it back as themselves and certifies again: the notice
--   is written again, and no push. 3 certifies the record: one push, another member's.
--   3 certifies the take and both critiques: a push each (a critique is its own thing, though its
--   notice's group key is the filing's). 3 takes back one critique's certification as themselves
--   and gives it again: no push.
--   1 has switched off certification pushes when 3 certifies the stack: no push, and none
--   remembered; 1 switches them on, 3 takes it back and certifies again: its one push.
--   A notice of another kind is pushed as before.

-- The round's first 3 members in good standing (rehearsal_members, read once before the train).
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_f11_members), 3) AS done \gset rh_

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- The owner's switch on, nothing between the three, and every one's certification pushes on: each
-- push counted below is the run's own doing.
UPDATE public.house_settings SET pushes_sent = true;
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rh_f11_members) AND blocked_id IN (SELECT id FROM rh_f11_members);
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'notif_endorsements'
 WHERE id IN (SELECT id FROM rh_f11_members);

WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rh_f11_members WHERE n = 1), 990001111, 'rh f11 film', current_date) RETURNING id)
INSERT INTO rh_f11_own SELECT 'log', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title) VALUES ((SELECT id FROM rh_f11_members WHERE n = 1), 'rh f11 stack') RETURNING id)
INSERT INTO rh_f11_own SELECT 'stack', id FROM r;
WITH r AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
  SELECT 'take', m.id, p.username, 'F11 rehearsal: a take', true
    FROM rh_f11_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO rh_f11_own SELECT 'take', id FROM r;
WITH r AS (
  INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
  SELECT (SELECT id FROM rh_f11_own WHERE what = 'take'), m.id, p.username, 'F11 rehearsal: the author''s critique'
    FROM rh_f11_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO rh_f11_own SELECT 'critique 1', id FROM r;
WITH r AS (
  INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
  SELECT (SELECT id FROM rh_f11_own WHERE what = 'take'), m.id, p.username, 'F11 rehearsal: a reader''s critique'
    FROM rh_f11_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 2
  RETURNING id)
INSERT INTO rh_f11_own SELECT 'critique 2', id FROM r;

-- The pushes queued so far, read after each step.
CREATE FUNCTION pg_temp.rh_f11_mark(p_what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rh_f11_queued (what, queued) SELECT p_what, count(*) FROM net.http_request_queue;
$$;
-- The pushes a step queued: its count less the one before it.
CREATE FUNCTION pg_temp.rh_f11_pushed(p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT (q.queued - (SELECT b.queued FROM rh_f11_queued b WHERE b.n < q.n ORDER BY b.n DESC LIMIT 1))::text
    FROM rh_f11_queued q WHERE q.what = p_what;
$$;
-- A member takes back their own certification, as themselves.
CREATE FUNCTION pg_temp.rh_f11_take_back(p_member bigint, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_f11_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_f11_take_back(bigint, text) TO authenticated;

SELECT pg_temp.rh_f11_mark('before') AS done \gset rh_

-- 2 certifies the record (laid by the house, as the certify the app sends), takes it back, gives it again.
INSERT INTO public.interactions (user_id, target_log_id, type)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 2), (SELECT id FROM rh_f11_own WHERE what = 'log'), 'endorse_log');
SELECT pg_temp.rh_f11_mark('2 certifies the record') AS done \gset rh_
SELECT pg_temp.rh_f11_take_back(2, format(
  'DELETE FROM public.interactions WHERE user_id = %L AND type = ''endorse_log'' AND target_log_id = %L',
  (SELECT id FROM rh_f11_members WHERE n = 2), (SELECT id FROM rh_f11_own WHERE what = 'log'))) AS done \gset rh_
SELECT pg_temp.rh_f11_mark('2 takes it back') AS done \gset rh_
INSERT INTO public.interactions (user_id, target_log_id, type)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 2), (SELECT id FROM rh_f11_own WHERE what = 'log'), 'endorse_log');
SELECT pg_temp.rh_f11_mark('2 certifies it again') AS done \gset rh_

-- 3 certifies the record, the take and both critiques.
INSERT INTO public.interactions (user_id, target_log_id, type)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'log'), 'endorse_log');
SELECT pg_temp.rh_f11_mark('3 certifies the record') AS done \gset rh_
INSERT INTO public.dispatch_certifications (user_id, post_id)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'take'));
INSERT INTO public.dispatch_certifications (user_id, comment_id)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'critique 1')),
       ((SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'critique 2'));
SELECT pg_temp.rh_f11_mark('3 certifies the take and both critiques') AS done \gset rh_
SELECT pg_temp.rh_f11_take_back(3, format(
  'DELETE FROM public.dispatch_certifications WHERE user_id = %L AND comment_id = %L',
  (SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'critique 2'))) AS done \gset rh_
INSERT INTO public.dispatch_certifications (user_id, comment_id)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'critique 2'));
SELECT pg_temp.rh_f11_mark('3 takes back a critique''s and gives it again') AS done \gset rh_

-- 1 has switched certification pushes off: 3 certifies the stack. 1 switches them on; 3 takes it
-- back and certifies again.
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) || '{"notif_endorsements": "false"}'::jsonb
 WHERE id = (SELECT id FROM rh_f11_members WHERE n = 1);
-- Before 20261119_07 a member's interactions are kept a second apart, and now() stands still in this
-- transaction: 3's certification of the record is stepped an hour back, as the house, so the train's
-- rehearsal of this car (applied before 20261119_07) lets 3 certify the stack too.
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id = (SELECT id FROM rh_f11_members WHERE n = 3) AND created_at = now();
INSERT INTO public.interactions (user_id, target_list_id, type)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'stack'), 'endorse_list');
SELECT pg_temp.rh_f11_mark('3 certifies the stack, its pushes off') AS done \gset rh_
CREATE TEMP TABLE rh_f11_remembered ON COMMIT DROP AS
  SELECT count(*) AS n FROM public.certifications_pushed
   WHERE from_user_id = (SELECT id FROM rh_f11_members WHERE n = 3)
     AND thing = 'endorse:list:' || (SELECT id FROM rh_f11_own WHERE what = 'stack');
UPDATE public.profiles SET preferences = preferences - 'notif_endorsements'
 WHERE id = (SELECT id FROM rh_f11_members WHERE n = 1);
SELECT pg_temp.rh_f11_take_back(3, format(
  'DELETE FROM public.interactions WHERE user_id = %L AND type = ''endorse_list'' AND target_list_id = %L',
  (SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'stack'))) AS done \gset rh_
INSERT INTO public.interactions (user_id, target_list_id, type)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 3), (SELECT id FROM rh_f11_own WHERE what = 'stack'), 'endorse_list');
SELECT pg_temp.rh_f11_mark('3 certifies it again, its pushes on') AS done \gset rh_

-- A notice of another kind.
INSERT INTO public.notifications (user_id, type, message)
VALUES ((SELECT id FROM rh_f11_members WHERE n = 1), 'system', 'rh f11 notice of another kind');
SELECT pg_temp.rh_f11_mark('a notice of another kind') AS done \gset rh_

DO $$
DECLARE
  m1 uuid := (SELECT id FROM rh_f11_members WHERE n = 1);
  m2 uuid := (SELECT id FROM rh_f11_members WHERE n = 2);
  rec uuid := (SELECT id FROM rh_f11_own WHERE what = 'log');
BEGIN
  PERFORM pg_temp.rh_case('a certification pushes once', '1', pg_temp.rh_f11_pushed('2 certifies the record'));
  PERFORM pg_temp.rh_case('taken back, no push', '0', pg_temp.rh_f11_pushed('2 takes it back'));
  PERFORM pg_temp.rh_case('given again, no second push', '0', pg_temp.rh_f11_pushed('2 certifies it again'));
  -- One notice, never a second, once 20261117_02's trigger takes the first with its certification:
  -- counted in that car's rehearsal (B6). Here, before it, the notice is under the bell.
  PERFORM pg_temp.rh_case('and its notice is written again, under the bell', 'true',
    (SELECT (count(*) >= 1)::text FROM public.notifications
      WHERE user_id = m1 AND from_user_id = m2 AND type = 'endorse' AND group_key = 'endorse:log:' || rec));
  PERFORM pg_temp.rh_case('another member''s certification of the same record pushes', '1',
    pg_temp.rh_f11_pushed('3 certifies the record'));
  PERFORM pg_temp.rh_case('a filing and each critique on it push, each its own', '3',
    pg_temp.rh_f11_pushed('3 certifies the take and both critiques'));
  PERFORM pg_temp.rh_case('a critique''s certification given again pushes no more', '0',
    pg_temp.rh_f11_pushed('3 takes back a critique''s and gives it again'));
  PERFORM pg_temp.rh_case('a push the member switched off is not sent, nor remembered', '0|0',
    pg_temp.rh_f11_pushed('3 certifies the stack, its pushes off') || '|' || (SELECT n::text FROM rh_f11_remembered));
  PERFORM pg_temp.rh_case('switched on, that certification still pushes its once', '1',
    pg_temp.rh_f11_pushed('3 certifies it again, its pushes on'));
  PERFORM pg_temp.rh_case('a notice of another kind pushes as before', '1',
    pg_temp.rh_f11_pushed('a notice of another kind'));
  PERFORM pg_temp.rh_case('no client reads the memory of the pushes', 'false|false',
    has_table_privilege('authenticated', 'public.certifications_pushed', 'SELECT')::text || '|'
    || has_table_privilege('anon', 'public.certifications_pushed', 'SELECT')::text);
END $$;

-- ── D1 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: a rename the member chooses is kept (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Four members in good standing. 1 and 2 are given handles that predate
-- today's letters, as the house still holds a few ("Rh_R11.Kept", "Rh_R11.Old"), and 4 is banned. As
-- themselves: 1 renames to the cleaned form through rename_my_handle and keeps it, the house
-- answering with it, and the mark is gone after; 2's old build then saves its bio with the cleaned
-- handle by a plain write, in the same transaction, and keeps the old handle as before; 3 renames to
-- a fresh handle and keeps it, and asking for 1's new handle is refused as taken; 4, banned, is
-- refused and keeps their handle. Members call it; visitors do not.

-- The round's first 4 members in good standing (rehearsal_members, read once before the train).
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_d1_members), 4) AS done \gset rh_

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- The handles from before today's letters, and 4's ban, laid as the house past the username rule (as
-- the rows from before the rule was made). The rehearsal runs as production's postgres, which is no
-- superuser and may not turn every trigger off for its writes; it owns the rule's function, so
-- the rule is set aside for these three writes alone and put back whole, its own definition read
-- first, all in this transaction: no table is held, and no other session ever sees it set aside.
CREATE TEMP TABLE rh_d1_rule ON COMMIT DROP AS
  SELECT pg_get_functiondef('public.enforce_username_policy()'::regprocedure) AS def;
CREATE OR REPLACE FUNCTION public.enforce_username_policy() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$ BEGIN RETURN NEW; END $$;
UPDATE public.profiles SET username = 'Rh_R11.Kept' WHERE id = (SELECT id FROM rh_d1_members WHERE n = 1);
UPDATE public.profiles SET username = 'Rh_R11.Old' WHERE id = (SELECT id FROM rh_d1_members WHERE n = 2);
UPDATE public.profiles SET is_banned = true, banned_at = now() WHERE id = (SELECT id FROM rh_d1_members WHERE n = 4);
DO $$ BEGIN EXECUTE (SELECT def FROM rh_d1_rule); END $$;
SELECT pg_temp.rh_case('the username rule is put back whole before the members act', 'true',
  (SELECT (pg_get_functiondef('public.enforce_username_policy()'::regprocedure) = def)::text FROM rh_d1_rule)) AS done \gset rh_

CREATE TEMP TABLE rh_d1_handles ON COMMIT DROP AS
  SELECT m.n, p.username FROM rh_d1_members m JOIN public.profiles p ON p.id = m.id;

SET LOCAL ROLE authenticated;

-- 1 renames "Rh_R11.Kept" to its cleaned form, in Edit Profile, as themselves.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_d1_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_d1_got SELECT 1, public.rename_my_handle('rh_r11kept');
INSERT INTO rh_d1_got SELECT 10, coalesce(current_setting('reelhouse.deliberate_rename', true), '');

-- 2's old build saves a bio, sending the cleaned form of "Rh_R11.Old" with it, by a plain write.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_d1_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
UPDATE public.profiles SET username = 'rh_r11old', bio = 'rh d1 saved' WHERE id = (SELECT id FROM rh_d1_members WHERE n = 2);

-- 3 renames to a fresh handle, then asks for the one 1 now holds.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_d1_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_d1_got SELECT 3, public.rename_my_handle('rh_r11fresh');
DO $$
BEGIN
  PERFORM public.rename_my_handle('rh_r11kept');
  INSERT INTO rh_d1_got VALUES (31, 'renamed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO rh_d1_got VALUES (31, SQLSTATE);
END $$;

-- 4, banned, tries a rename.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_d1_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
BEGIN
  PERFORM public.rename_my_handle('rh_r11banned');
  INSERT INTO rh_d1_got VALUES (41, 'renamed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO rh_d1_got VALUES (41, SQLSTATE);
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  m1 uuid := (SELECT id FROM rh_d1_members WHERE n = 1);
  m2 uuid := (SELECT id FROM rh_d1_members WHERE n = 2);
  m3 uuid := (SELECT id FROM rh_d1_members WHERE n = 3);
  m4 uuid := (SELECT id FROM rh_d1_members WHERE n = 4);
BEGIN
  PERFORM pg_temp.rh_case('a chosen rename to a handle''s own cleaned form is kept, and the house answers with it', 'rh_r11kept|rh_r11kept',
    (SELECT got FROM rh_d1_got WHERE who = 1) || '|' || (SELECT username FROM public.profiles WHERE id = m1));
  PERFORM pg_temp.rh_case('the mark is off once the rename is made', '',
    (SELECT got FROM rh_d1_got WHERE who = 10));
  PERFORM pg_temp.rh_case('an old build''s save keeps the old handle as before, and its words are saved', 'Rh_R11.Old|rh d1 saved',
    (SELECT username || '|' || bio FROM public.profiles WHERE id = m2));
  PERFORM pg_temp.rh_case('a rename to a fresh handle is kept as before', 'rh_r11fresh|rh_r11fresh',
    (SELECT got FROM rh_d1_got WHERE who = 3) || '|' || (SELECT username FROM public.profiles WHERE id = m3));
  PERFORM pg_temp.rh_case('another member''s handle is refused as taken', '23505|rh_r11fresh',
    (SELECT got FROM rh_d1_got WHERE who = 31) || '|' || (SELECT username FROM public.profiles WHERE id = m3));
  PERFORM pg_temp.rh_case('a banned member''s rename is refused, their handle as it was', '42501|true',
    (SELECT got FROM rh_d1_got WHERE who = 41) || '|'
    || ((SELECT username FROM public.profiles WHERE id = m4) = (SELECT username FROM rh_d1_handles WHERE n = 4))::text);
  PERFORM pg_temp.rh_case('members call it, visitors do not', 'true|false',
    has_function_privilege('authenticated', 'public.rename_my_handle(text)', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.rename_my_handle(text)', 'EXECUTE')::text);
END $$;

-- ── F4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: a shared filing whose piece is gone reads as gone (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql, its rehearsal_members (four
-- members in good standing, n = 1..4) and the train. Member 1 writes a take; member 2 hosts a salon
-- and, as the house sets it, shares in it member 1's take (the card carrying its headline, as the
-- phone sends it). Then, signed in as themselves, member 1 withdraws the take. The house finds:
--   the take's card has no headline and no byline, is marked gone, and still names its filing;
--   member 2's own words under the card stay.
-- A stack's card goes with its stack by a trigger, made in the next car (20261117_02), and is
-- rehearsed there.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- As the house: member 1's take, member 2's salon, and member 2's card.
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body)
           VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 1),
                   (SELECT p.username FROM public.profiles p WHERE p.id = (SELECT id FROM rehearsal_members WHERE n = 1)),
                   'rh-f4 a headline', 'rh-f4 the take''s words') RETURNING id)
INSERT INTO rh_f4_rows SELECT 'take', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh-f4 a salon', (SELECT id FROM rehearsal_members WHERE n = 2), false) RETURNING id)
INSERT INTO rh_f4_rows SELECT 'salon', id FROM r;

WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, film_title, metadata)
           VALUES ((SELECT id FROM rh_f4_rows WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 2),
                   'rh-f4 read this take', 'dossier_share', 'rh-f4 a headline',
                   jsonb_build_object('dossier_id', (SELECT id FROM rh_f4_rows WHERE what = 'take')::text,
                                      'author_username', 'rh-f4-author', 'kind', 'take')) RETURNING id)
INSERT INTO rh_f4_rows SELECT 'take card', id FROM r;
SELECT pg_temp.rh_need('the card', (SELECT count(*) FROM rh_f4_rows WHERE what LIKE '%card'), 1) AS done \gset rh_

-- Member 1, as themselves, withdraws the take, as the app does.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.end_filing((SELECT id FROM rh_f4_rows WHERE what = 'take'), 'author') AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('the take is withdrawn by its author', 'author',
  (SELECT ended_by FROM public.dispatch_posts WHERE id = (SELECT id FROM rh_f4_rows WHERE what = 'take'))) AS done \gset rh_
SELECT pg_temp.rh_case('the take''s card has no headline', NULL,
  (SELECT film_title FROM public.lounge_messages WHERE id = (SELECT id FROM rh_f4_rows WHERE what = 'take card'))) AS done \gset rh_
SELECT pg_temp.rh_case('and reads as gone, still naming its filing and its kind, with no byline',
  jsonb_build_object('dossier_id', (SELECT id FROM rh_f4_rows WHERE what = 'take')::text, 'kind', 'take', 'gone', true)::text,
  (SELECT metadata::text FROM public.lounge_messages WHERE id = (SELECT id FROM rh_f4_rows WHERE what = 'take card'))) AS done \gset rh_
SELECT pg_temp.rh_case('the sharer''s own words under the card stay', 'rh-f4 read this take',
  (SELECT content FROM public.lounge_messages WHERE id = (SELECT id FROM rh_f4_rows WHERE what = 'take card'))) AS done \gset rh_

-- ── D2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: a member who leaves may take their words with them (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Three members in good standing: S stays; K and E leave. S keeps a record,
-- a stack, a seeking filing and a salon K and E sit in. Each of K and E, as the house, is given what a
-- member writes for others: a critique on S's record, a note on S's stack, a critique on S's filing, a
-- take of their own (S critiques it), a salon message (S replies to it, quoting it), an old Dispatch
-- critique, an old essay, and a stack S shares in the salon. E also files a ballot S voted in (closed,
-- so S holds its notice), and E's critique is the answer S took on the seeking filing. Then, signed in
-- as themselves:
--   K closes the account as every client does today, with no argument: K's words all stay, signed
--   '[deleted]' (the old tables and the stack's card no longer keep K's handle either);
--   E closes the account choosing to erase: nothing E wrote is readable by S any more (the tables, the
--   quotes, the ballot's notice, the old tables), and S's own pages still read: the record, the
--   filing and S's critique under E's take, the salon and S's reply; the counters settle (one critique
--   on S's record, one on S's filing, no answer taken); E's take reads as withdrawn by its author.

INSERT INTO rh_d2_who
SELECT (ARRAY['S', 'K', 'E'])[n], id, username FROM (
  SELECT p.id, p.username, row_number() OVER (ORDER BY p.created_at) AS n
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
   WHERE p.role <> 'admin' AND NOT coalesce(p.is_banned, false)
     AND (p.suspended_until IS NULL OR p.suspended_until <= now())
     AND p.username IS NOT NULL
   ORDER BY p.created_at LIMIT 3) m;
SELECT pg_temp.rh_need('members in good standing, with handles', (SELECT count(*) FROM rh_d2_who), 3) AS done \gset rh_
CREATE FUNCTION pg_temp.rh_d2(member text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_d2_who WHERE what = member $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_d2(text) TO authenticated;

-- As the house: nothing stands between the three, and no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rh_d2_who) AND blocked_id IN (SELECT id FROM rh_d2_who);

CREATE FUNCTION pg_temp.rh_d2_row(name text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_d2_rows WHERE what = name $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_d2_row(text) TO authenticated;

-- S's pieces: a record, a stack, a seeking filing, a salon, an old essay.
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT pg_temp.rh_d2('S')), 990001501, 'rh-d2 a record', current_date) RETURNING id)
INSERT INTO rh_d2_rows SELECT 'record', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title, is_private)
           VALUES ((SELECT pg_temp.rh_d2('S')), 'rh-d2 a stack', false) RETURNING id)
INSERT INTO rh_d2_rows SELECT 'stack', id FROM r;
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
           VALUES ('seeking', (SELECT pg_temp.rh_d2('S')), (SELECT handle FROM rh_d2_who WHERE what = 'S'), 'rh-d2 S seeks a film') RETURNING id)
INSERT INTO rh_d2_rows SELECT 'seeking', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh-d2 a salon', (SELECT pg_temp.rh_d2('S')), false) RETURNING id)
INSERT INTO rh_d2_rows SELECT 'salon', id FROM r;
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT pg_temp.rh_d2_row('salon'), id, 'approved' FROM rh_d2_who
ON CONFLICT DO NOTHING;
WITH r AS (INSERT INTO public.dispatch_dossiers_legacy (user_id, author_username, title, excerpt, full_content)
           VALUES ((SELECT pg_temp.rh_d2('S')), (SELECT handle FROM rh_d2_who WHERE what = 'S'), 'rh-d2 S old essay', 'rh-d2 S', 'rh-d2 S') RETURNING id)
INSERT INTO rh_d2_rows SELECT 'S old essay', id FROM r;

-- What K and E each write for others; every word carries its writer's mark (rh-d2-K, rh-d2-E).
DO $$
DECLARE w record; v_id uuid; v_mark text;
BEGIN
  FOR w IN SELECT what, id, handle FROM rh_d2_who WHERE what IN ('K', 'E') LOOP
    v_mark := 'rh-d2-' || w.what;
    INSERT INTO public.log_comments (log_id, user_id, username, body)
    VALUES ((SELECT pg_temp.rh_d2_row('record')), w.id, w.handle, v_mark || ' critique');
    INSERT INTO public.list_comments (list_id, user_id, content)
    VALUES ((SELECT pg_temp.rh_d2_row('stack')), w.id, v_mark || ' note');
    INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
    VALUES ((SELECT pg_temp.rh_d2_row('seeking')), w.id, w.handle, v_mark || ' answer') RETURNING id INTO v_id;
    INSERT INTO rh_d2_rows VALUES (w.what || ' answer', v_id);
    INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
    VALUES ('take', w.id, w.handle, v_mark || ' take') RETURNING id INTO v_id;
    INSERT INTO rh_d2_rows VALUES (w.what || ' take', v_id);
    INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
    VALUES (v_id, (SELECT pg_temp.rh_d2('S')), (SELECT handle FROM rh_d2_who WHERE what = 'S'), 'rh-d2 S critiques a take');
    INSERT INTO public.lounge_messages (lounge_id, user_id, content)
    VALUES ((SELECT pg_temp.rh_d2_row('salon')), w.id, v_mark || ' message') RETURNING id INTO v_id;
    INSERT INTO rh_d2_rows VALUES (w.what || ' message', v_id);
    INSERT INTO public.lounge_messages (lounge_id, user_id, content, reply_to_id)
    VALUES ((SELECT pg_temp.rh_d2_row('salon')), (SELECT pg_temp.rh_d2('S')), 'rh-d2 S replies', v_id) RETURNING id INTO v_id;
    INSERT INTO rh_d2_rows VALUES ('reply to ' || w.what, v_id);
    -- A stack the writer curates, shared by S: its card names its curator (since round 14 the house
    -- writes a card's curator from the stack it names, so the stack is the writer's own).
    INSERT INTO public.lists (user_id, title, is_private)
    VALUES (w.id, 'rh-d2 a stack curated by ' || w.what, false) RETURNING id INTO v_id;
    INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata)
    VALUES ((SELECT pg_temp.rh_d2_row('salon')), (SELECT pg_temp.rh_d2('S')), 'rh-d2 S shares a stack', 'list_share',
            jsonb_build_object('listId', v_id::text, 'title', 'rh-d2 a stack curated by ' || w.what, 'curator', w.handle)) RETURNING id INTO v_id;
    INSERT INTO rh_d2_rows VALUES ('card of ' || w.what, v_id);
    INSERT INTO public.dossier_comments_legacy (dossier_id, user_id, username, body)
    VALUES ((SELECT pg_temp.rh_d2_row('S old essay')), w.id, w.handle, v_mark || ' old critique');
    INSERT INTO public.dispatch_dossiers_legacy (user_id, author_username, title, excerpt, full_content)
    VALUES (w.id, w.handle, v_mark || ' old essay', v_mark || ' old excerpt', v_mark || ' old words') RETURNING id INTO v_id;
    INSERT INTO rh_d2_rows VALUES (w.what || ' old essay', v_id);
  END LOOP;
END $$;

-- E's ballot, voted in by S and closed (S is sent its notice), and E's critique the answer S took.
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, options, closes_at)
           VALUES ('ballot', (SELECT pg_temp.rh_d2('E')), (SELECT handle FROM rh_d2_who WHERE what = 'E'), 'rh-d2-E ballot',
                   'rh-d2-E ballot words',
                   '[{"film_id": 990001502, "title": "rh film one"}, {"film_id": 990001503, "title": "rh film two"}]'::jsonb,
                   now() + interval '1 day') RETURNING id)
INSERT INTO rh_d2_rows SELECT 'E ballot', id FROM r;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index) VALUES ((SELECT pg_temp.rh_d2_row('E ballot')), (SELECT pg_temp.rh_d2('S')), 0);
UPDATE public.dispatch_posts SET frozen_totals = '{"total": 1, "counts": {"0": 1}}'::jsonb WHERE id = (SELECT pg_temp.rh_d2_row('E ballot'));
-- The house's job tells the ballot's voters, as the schedule runs it, until none waits.
DO $$
BEGIN
  WHILE EXISTS (SELECT 1 FROM private.ballot_notices_waiting) LOOP
    PERFORM private.closed_ballots_told();
  END LOOP;
END $$;
UPDATE public.dispatch_posts SET answer_id = (SELECT pg_temp.rh_d2_row('E answer')) WHERE id = (SELECT pg_temp.rh_d2_row('seeking'));

SELECT pg_temp.rh_need('the ballot''s notice to S, quoting its question',
  (SELECT count(*) FROM public.notifications WHERE created_at >= now() AND user_id = (SELECT pg_temp.rh_d2('S')) AND message LIKE '%rh-d2-E ballot%'), 1) AS done \gset rh_
SELECT pg_temp.rh_need('S''s reply quoting E''s message',
  (SELECT count(*) FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_d2_row('reply to E')) AND reply_to_content LIKE 'rh-d2-E%'), 1) AS done \gset rh_

-- ── K and E each close their account, signed in as the app signs in ─────────────────────────────
CREATE FUNCTION pg_temp.rh_d2_try(stmt text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_d2_try(text) TO authenticated;

-- The old Dispatch's tables, read by no member since round 14 (H-B10.locks), are read as the house:
-- what they still hold of a member's words, which no reader may then reach either.
CREATE FUNCTION pg_temp.rh_d2_legacy(stmt text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v text;
BEGIN
  EXECUTE stmt INTO v;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_d2_legacy(text) TO authenticated;

-- Every place another member can read a member's words, counted for one writer's mark (as the reader).
-- Each table is read where this piece wrote and where the house copies it: under S's record, stack,
-- essay and salon, on the filings laid here, and in the notices to or from the three. A house of any
-- size is never read whole for them.
CREATE FUNCTION pg_temp.rh_d2_words(v_mark text) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|',
    (SELECT count(*) FROM public.log_comments WHERE log_id = (SELECT pg_temp.rh_d2_row('record')) AND body LIKE v_mark || '%'),
    (SELECT count(*) FROM public.list_comments WHERE list_id = (SELECT pg_temp.rh_d2_row('stack')) AND content LIKE v_mark || '%'),
    (SELECT count(*) FROM public.dispatch_comments
      WHERE post_id IN (SELECT id FROM rh_d2_rows) AND body LIKE v_mark || '%'),
    (SELECT count(*) FROM public.dispatch_posts
      WHERE id IN (SELECT id FROM rh_d2_rows)
        AND concat_ws(' ', title, body, full_content, series_title) LIKE '%' || v_mark || '%'),
    (SELECT count(*) FROM public.lounge_messages
      WHERE lounge_id = (SELECT pg_temp.rh_d2_row('salon'))
        AND concat_ws(' ', content, reply_to_content, film_title, metadata::text) LIKE '%' || v_mark || '%'),
    (SELECT count(*) FROM public.notifications
      WHERE created_at >= now() AND (user_id IN (SELECT id FROM rh_d2_who) OR from_user_id IN (SELECT id FROM rh_d2_who))
        AND concat_ws(' ', message, metadata::text) LIKE '%' || v_mark || '%'),
    pg_temp.rh_d2_legacy(format('SELECT count(*)::text FROM public.dossier_comments_legacy WHERE dossier_id = %L AND body LIKE %L',
      (SELECT pg_temp.rh_d2_row('S old essay')), v_mark || '%')),
    pg_temp.rh_d2_legacy(format('SELECT count(*)::text FROM public.dispatch_dossiers_legacy WHERE id = ANY (%L::uuid[]) AND concat_ws('' '', title, excerpt, full_content) LIKE %L',
      (SELECT array_agg(id) FROM rh_d2_rows), '%' || v_mark || '%')))
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_d2_words(text) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT pg_temp.rh_d2('K')), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_d2_got VALUES ('K leaves', pg_temp.rh_d2_try('SELECT public.request_account_deletion()'));
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT pg_temp.rh_d2('E')), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_d2_got VALUES ('E leaves', pg_temp.rh_d2_try('SELECT public.request_account_deletion(p_erase_writing => true)'));

-- ── What S reads afterwards, as S ──────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT pg_temp.rh_d2('S')), 'role', 'authenticated')::text, true) AS done \gset rh_

INSERT INTO rh_d2_read VALUES ('K words', pg_temp.rh_d2_words('rh-d2-K'));
INSERT INTO rh_d2_read VALUES ('E words', pg_temp.rh_d2_words('rh-d2-E'));
INSERT INTO rh_d2_read VALUES ('K signed', concat_ws('|',
  (SELECT string_agg(DISTINCT username, ',') FROM public.log_comments
    WHERE log_id = (SELECT pg_temp.rh_d2_row('record')) AND body LIKE 'rh-d2-K%'),
  (SELECT bool_and(user_id IS NULL)::text FROM public.list_comments
    WHERE list_id = (SELECT pg_temp.rh_d2_row('stack')) AND content LIKE 'rh-d2-K%'),
  (SELECT string_agg(DISTINCT author_username, ',') FROM public.dispatch_comments
    WHERE post_id IN (SELECT id FROM rh_d2_rows) AND body LIKE 'rh-d2-K%'),
  (SELECT author_username || ',' || (ended_at IS NULL)::text FROM public.dispatch_posts WHERE id = (SELECT pg_temp.rh_d2_row('K take'))),
  (SELECT (user_id IS NULL)::text || ',' || (deleted_at IS NULL)::text FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_d2_row('K message'))),
  (SELECT reply_to_username || ',' || (reply_to_content LIKE 'rh-d2-K%')::text FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_d2_row('reply to K'))),
  pg_temp.rh_d2_legacy(format('SELECT string_agg(DISTINCT username, '','') FROM public.dossier_comments_legacy WHERE dossier_id = %L AND body LIKE ''rh-d2-K%%''',
    (SELECT pg_temp.rh_d2_row('S old essay')))),
  pg_temp.rh_d2_legacy(format('SELECT author_username FROM public.dispatch_dossiers_legacy WHERE id = %L', (SELECT pg_temp.rh_d2_row('K old essay')))),
  (SELECT (metadata ? 'curator')::text FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_d2_row('card of K')))));
INSERT INTO rh_d2_read VALUES ('E take', (SELECT concat_ws('|', ended_by, (ended_at IS NOT NULL)::text, body, author_username)
  FROM public.dispatch_posts WHERE id = (SELECT pg_temp.rh_d2_row('E take'))));
INSERT INTO rh_d2_read VALUES ('E take thread', (SELECT count(*)::text FROM public.dispatch_comments
  WHERE post_id = (SELECT pg_temp.rh_d2_row('E take')) AND body = 'rh-d2 S critiques a take'));
INSERT INTO rh_d2_read VALUES ('E message', (SELECT concat_ws('|', (deleted_at IS NOT NULL)::text, content, (user_id IS NULL)::text)
  FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_d2_row('E message'))));
INSERT INTO rh_d2_read VALUES ('reply to E', (SELECT concat_ws('|', content, coalesce(reply_to_content, 'no quote'), reply_to_username)
  FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_d2_row('reply to E'))));
INSERT INTO rh_d2_read VALUES ('E ballot notice', (SELECT string_agg(message || '|' || (metadata ? 'title')::text, ',')
  FROM public.notifications WHERE created_at >= now() AND user_id = (SELECT pg_temp.rh_d2('S')) AND metadata @> jsonb_build_object('dispatch_post_id', (SELECT pg_temp.rh_d2_row('E ballot')))));
INSERT INTO rh_d2_read VALUES ('S pages', concat_ws('|',
  (SELECT count(*) FROM public.logs WHERE id = (SELECT pg_temp.rh_d2_row('record'))),
  (SELECT count(*) FROM public.lists WHERE id = (SELECT pg_temp.rh_d2_row('stack'))),
  (SELECT count(*) FROM public.dispatch_posts WHERE id = (SELECT pg_temp.rh_d2_row('seeking')) AND body = 'rh-d2 S seeks a film'),
  (SELECT count(*) FROM public.lounge_messages WHERE lounge_id = (SELECT pg_temp.rh_d2_row('salon')) AND user_id = (SELECT pg_temp.rh_d2('S')))));
INSERT INTO rh_d2_read VALUES ('counts', concat_ws('|',
  (SELECT critique_count FROM public.log_counts WHERE log_id = (SELECT pg_temp.rh_d2_row('record'))),
  (SELECT comment_count FROM public.dispatch_posts WHERE id = (SELECT pg_temp.rh_d2_row('seeking'))),
  (SELECT coalesce(answer_id::text, 'no answer') FROM public.dispatch_posts WHERE id = (SELECT pg_temp.rh_d2_row('seeking'))),
  (SELECT comment_count FROM public.dispatch_posts WHERE id = (SELECT pg_temp.rh_d2_row('E take')))));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('a member closing their account with no choice (every client today) is gone', 'ok|true',
  (SELECT got FROM rh_d2_got WHERE what = 'K leaves') || '|'
  || (NOT EXISTS (SELECT 1 FROM auth.users WHERE id = (SELECT pg_temp.rh_d2('K'))))::text) AS done \gset rh_
SELECT pg_temp.rh_case('and every word they wrote for others stays where it was: record, stack, filing, take, salon, quote, notice, old critique, old essay',
  '1|1|1|1|2|0|1|1', (SELECT got FROM rh_d2_read WHERE what = 'K words')) AS done \gset rh_
SELECT pg_temp.rh_case('signed [deleted] everywhere, the old tables and a shared stack''s card included',
  '[deleted]|true|[deleted]|[deleted],true|true,true|[deleted],true|[deleted]|[deleted]|false',
  (SELECT got FROM rh_d2_read WHERE what = 'K signed')) AS done \gset rh_
SELECT pg_temp.rh_case('a member who chooses to erase their words is gone', 'ok|true',
  (SELECT got FROM rh_d2_got WHERE what = 'E leaves') || '|'
  || (NOT EXISTS (SELECT 1 FROM auth.users WHERE id = (SELECT pg_temp.rh_d2('E'))))::text) AS done \gset rh_
SELECT pg_temp.rh_case('and no word of theirs is left for another member to read, anywhere',
  '0|0|0|0|0|0|0|0', (SELECT got FROM rh_d2_read WHERE what = 'E words')) AS done \gset rh_
SELECT pg_temp.rh_case('their take reads as withdrawn by its author, emptied and unsigned',
  'author|true||[deleted]', (SELECT got FROM rh_d2_read WHERE what = 'E take')) AS done \gset rh_
SELECT pg_temp.rh_case('the critique another member wrote under it still reads', '1',
  (SELECT got FROM rh_d2_read WHERE what = 'E take thread')) AS done \gset rh_
SELECT pg_temp.rh_case('their salon message reads as withdrawn', 'true||true',
  (SELECT got FROM rh_d2_read WHERE what = 'E message')) AS done \gset rh_
SELECT pg_temp.rh_case('the reply another member wrote to it still reads, without the quote', 'rh-d2 S replies|no quote|[deleted]',
  (SELECT got FROM rh_d2_read WHERE what = 'reply to E')) AS done \gset rh_
SELECT pg_temp.rh_case('the ballot''s notice stays with its voter, without the question', 'A ballot you voted in has closed.|false',
  (SELECT got FROM rh_d2_read WHERE what = 'E ballot notice')) AS done \gset rh_
SELECT pg_temp.rh_case('the staying member''s own record, stack, filing and salon still read', '1|1|1|4',
  (SELECT got FROM rh_d2_read WHERE what = 'S pages')) AS done \gset rh_
SELECT pg_temp.rh_case('the counts settle: one critique on the record, one on the filing, no answer taken, S''s critique on the withdrawn take',
  '1|1|no answer|1', (SELECT got FROM rh_d2_read WHERE what = 'counts')) AS done \gset rh_

-- On a sealed copy alone (plan_checks, which e2e/db/rehearsals.mjs sets): a plan is chosen by statistics,
-- and a copy of production carries its rows without them; the Load's plan guards hold the bound at size.
\if :{?plan_checks}
-- The card read now also asks a stack's curator: still answered by the cards' own index
-- (lounge_messages_card_names), never by reading every message. Sequential scans are off for the plan
-- alone, and put back.
DO $$
DECLARE l text;
BEGIN
  PERFORM set_config('enable_seqscan', 'off', true);
  FOR l IN EXPLAIN UPDATE public.lounge_messages
       SET metadata = ((metadata - 'owner_username') - 'author_username')
                      - CASE WHEN type = 'list_share' AND metadata @> jsonb_build_object('curator', 'rh_departed')
                             THEN 'curator' ELSE '' END
     WHERE metadata <> '{}'::jsonb
       AND (metadata @> jsonb_build_object('owner_username', 'rh_departed')
         OR metadata @> jsonb_build_object('author_username', 'rh_departed')
         OR (type = 'list_share' AND metadata @> jsonb_build_object('curator', 'rh_departed'))) LOOP
    INSERT INTO rh_d2_plan VALUES (l);
  END LOOP;
  PERFORM set_config('enable_seqscan', 'on', true);
END $$;
SELECT pg_temp.rh_case('a departing member''s cards, a stack''s among them, are found by the cards'' index', 'true|false',
  (SELECT bool_or(line LIKE '%lounge_messages_card_names%')::text || '|' || bool_or(line LIKE '%Seq Scan%')::text FROM rh_d2_plan)) AS done \gset rh_
\endif

SELECT pg_temp.rh_verdict();
ROLLBACK;
