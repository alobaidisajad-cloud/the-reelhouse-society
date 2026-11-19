-- ════════════════════════════════════════════════════════════════════════════
-- a_verdict_is_read_whole_and_appealed_once_rehearsal.sql — 20261120_27. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_verdict_is_read_whole_and_appealed_once_rehearsal.sql --with-train
--
-- The train applies 20261120_27 here (with_train), 20261120_00 to 20261120_26 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE hb6_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON hb6_ids TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_27_a_verdict_is_read_whole_and_appealed_once.sql
\endif

-- ── H-B6 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B6 rehearsal · a member reads a verdict whole, appeals it once, and another moderator hears it (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-B6.locks, H-B5.table,
-- H-B5, H-B2 and H-B6 applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Members 3 and 4 are the house's moderators. Member 1 reports pieces of member 2's; member 4 rules on
-- each: a warning, a 720-hour suspension, a ban, a salon message removed, 2's page cleared, a log removed,
-- and a second ban. Then, each as themselves:
--   2 reads a verdict whole and may appeal it; 1 reads none of 2's verdicts and appeals none;
--   2 appeals once: a second appeal, an empty one, are refused;
--   4, who ruled, reads the appeal as their own and may not hear it; 3 hears it;
--   overturned, the suspension no longer holds and 2 is told, the notice naming the verdict; heard again,
--     refused; upheld, the ban stands and 2 is told;
--   overturned, the warning is withdrawn; the salon message stands again; the page's words come back;
--     the deleted log's words are kept for 2 with the verdict;
--   overturned, the second ban leaves 2 closed by the first, under its reason;
--   the Tribunal door counts the appeals each moderator may hear; the record says what was struck.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET is_banned = false, banned_at = NULL, suspended_until = NULL, suspension_reason = NULL, warning_count = 0
 WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET role = 'admin' WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (3, 4));
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n < 3) AND role = 'admin';
UPDATE public.profiles SET bio = 'rh the words of 2', display_name = 'rh Two' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
DELETE FROM public.reports WHERE reporter_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.mod_actions WHERE target_user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.warnings WHERE user_id IN (SELECT id FROM rehearsal_members);

WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              SELECT (SELECT id FROM rehearsal_members WHERE n = 2), 990000700 + g, 'rh film ' || g, '2026-01-01', 'rh review ' || g
                FROM generate_series(1, 5) g RETURNING id, film_id)
INSERT INTO hb6_ids SELECT 'log ' || (film_id - 990000700), id FROM made;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh The Appeal Room', (SELECT id FROM rehearsal_members WHERE n = 2), false) RETURNING id)
INSERT INTO hb6_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM hb6_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM hb6_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2);
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
              VALUES ((SELECT id FROM hb6_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 2), 'rh the message of 2') RETURNING id)
INSERT INTO hb6_ids SELECT 'message', id FROM made;
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, reply_to_id)
              VALUES ((SELECT id FROM hb6_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 1), 'rh my answer to 2',
                      (SELECT id FROM hb6_ids WHERE what = 'message')) RETURNING id)
INSERT INTO hb6_ids SELECT 'reply', id FROM made;
INSERT INTO hb6_ids VALUES ('page', (SELECT id FROM rehearsal_members WHERE n = 2));

CREATE FUNCTION pg_temp.hb6_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v_got, 'none');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb6_as(bigint, text) TO authenticated;
-- Member 1 reports a piece of 2's; member 4 rules on it; the verdict kept as 'V <piece>'.
CREATE FUNCTION pg_temp.hb6_rule(p_piece text, p_type text, p_action text, p_hours integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id text; v_got text;
BEGIN
  v_id := pg_temp.hb6_as(1, format('SELECT public.submit_report(%L, %L, %L, %L)::text',
    (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM hb6_ids WHERE what = p_piece), p_type, 'harassment'));
  IF v_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: the report of % was refused: %', p_piece, v_id; END IF;
  v_got := pg_temp.hb6_as(4, format('SELECT ''done'' FROM public.resolve_moderation_report_v2(%L, %L, %L, %L, %s, true)',
    v_id, p_action, (SELECT id FROM rehearsal_members WHERE n = 4), 'rh the reason for ' || p_piece, coalesce(p_hours::text, 'NULL')));
  IF v_got <> 'done' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: the verdict on % was refused: %', p_piece, v_got; END IF;
  INSERT INTO hb6_ids SELECT 'V ' || p_piece, id FROM public.mod_actions WHERE report_id = v_id::uuid;
  PERFORM pg_temp.hb6_age();
END $$;
-- Each act in its own moment, as acts one after the other are.
CREATE FUNCTION pg_temp.hb6_age() RETURNS void LANGUAGE sql AS $$
  UPDATE public.mod_actions SET created_at = created_at - interval '1 minute' WHERE target_user_id = (SELECT id FROM rehearsal_members WHERE n = 2);
  UPDATE public.warnings SET created_at = created_at - interval '1 minute' WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2);
  UPDATE public.notifications SET created_at = created_at - interval '1 minute' WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'moderation';
$$;
CREATE FUNCTION pg_temp.hb6_verdict(p_member bigint, p_piece text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  v := pg_temp.hb6_as(p_member, format('SELECT public.get_my_verdict(%L)::text', (SELECT id FROM hb6_ids WHERE what = 'V ' || p_piece)));
  IF v LIKE 'refused:%' THEN RETURN to_jsonb(v); END IF;
  RETURN v::jsonb;
END $$;
CREATE FUNCTION pg_temp.hb6_appeal(p_member bigint, p_piece text, p_words text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb6_as(p_member, format('SELECT ''done'' FROM public.file_appeal(%L, %L)', (SELECT id FROM hb6_ids WHERE what = 'V ' || p_piece), p_words));
$$;
CREATE FUNCTION pg_temp.hb6_hear(p_member bigint, p_piece text, p_outcome text, p_note text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  v := pg_temp.hb6_as(p_member, format('SELECT ''done'' FROM public.judge_appeal(%L, %L, %L)', (SELECT id FROM hb6_ids WHERE what = 'V ' || p_piece), p_outcome, p_note));
  PERFORM pg_temp.hb6_age();
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.hb6_standing() RETURNS public.profiles LANGUAGE sql AS $$
  SELECT * FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
$$;
CREATE FUNCTION pg_temp.hb6_notice() RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.hb6_as(2, 'SELECT jsonb_build_object(''message'', message, ''metadata'', metadata)::text FROM public.notifications
     WHERE user_id = auth.uid() AND type = ''moderation'' ORDER BY created_at DESC, id DESC LIMIT 1')::jsonb;
END $$;
CREATE FUNCTION pg_temp.hb6_appeals(p_member bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.hb6_as(p_member, 'SELECT public.get_pending_appeals(NULL, NULL, 50)::text')::jsonb;
$$;

SELECT pg_temp.hb6_rule('log 1', 'log', 'warn', NULL) AS done \gset rh_
SELECT pg_temp.hb6_rule('log 2', 'log', 'suspend', 720) AS done \gset rh_
SELECT pg_temp.hb6_rule('log 3', 'log', 'ban', NULL) AS done \gset rh_
SELECT pg_temp.hb6_rule('message', 'lounge_message', 'delete_content', NULL) AS done \gset rh_
SELECT pg_temp.hb6_rule('page', 'profile', 'delete_content', NULL) AS done \gset rh_
SELECT pg_temp.hb6_rule('log 4', 'log', 'delete_content', NULL) AS done \gset rh_
SELECT pg_temp.hb6_rule('log 5', 'log', 'ban', NULL) AS done \gset rh_

-- Read whole, by its member alone.
SELECT pg_temp.rh_case('2 reads the suspension''s whole reason', 'rh the reason for log 2', pg_temp.hb6_verdict(2, 'log 2') ->> 'reason');
-- The record of verdicts: every one of 2's, newest first, a page at a time, whatever became of its notice.
DELETE FROM public.notifications WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'moderation';
SELECT pg_temp.rh_case('2 reads their seven verdicts, the newest first, with its notice dismissed', '7|true|ban',
  jsonb_array_length(pg_temp.hb6_as(2, 'SELECT public.get_my_verdicts(NULL, NULL, 50)::text')::jsonb)::text || '|'
  || ((pg_temp.hb6_as(2, 'SELECT public.get_my_verdicts(NULL, NULL, 50)::text')::jsonb -> 0 ->> 'id')::uuid = (SELECT id FROM hb6_ids WHERE what = 'V log 5'))::text || '|'
  || (pg_temp.hb6_as(2, 'SELECT public.get_my_verdicts(NULL, NULL, 50)::text')::jsonb -> 0 ->> 'action'));
SELECT pg_temp.rh_case('a page at a time: the second page follows the first, none read twice', '3|3|0',
  (SELECT jsonb_array_length(a)::text || '|' || jsonb_array_length(b)::text || '|'
          || (SELECT count(*) FROM jsonb_array_elements(a) x JOIN jsonb_array_elements(b) y ON x ->> 'id' = y ->> 'id')::text
     FROM (SELECT p1 AS a, pg_temp.hb6_as(2, format('SELECT public.get_my_verdicts(%L, %L, 3)::text', p1 -> 2 ->> 'created_at', p1 -> 2 ->> 'id'))::jsonb AS b
             FROM (SELECT pg_temp.hb6_as(2, 'SELECT public.get_my_verdicts(NULL, NULL, 3)::text')::jsonb AS p1) q) z));
SELECT pg_temp.rh_case('1 reads none of 2''s', '0',
  jsonb_array_length(pg_temp.hb6_as(1, 'SELECT public.get_my_verdicts(NULL, NULL, 50)::text')::jsonb)::text);
SELECT pg_temp.rh_case('its length', '720', pg_temp.hb6_verdict(2, 'log 2') ->> 'duration_hours');
SELECT pg_temp.rh_case('2 may appeal it', 'true', pg_temp.hb6_verdict(2, 'log 2') ->> 'can_appeal');
SELECT pg_temp.rh_case('1 reads none of 2''s verdicts', '"refused: P0002 VERDICT_GONE"', pg_temp.hb6_verdict(1, 'log 2')::text);

-- One appeal.
SELECT pg_temp.rh_case('an empty appeal', 'refused: P0001', left(pg_temp.hb6_appeal(2, 'log 2', '   '), 14));
SELECT pg_temp.rh_case('1 appeals 2''s verdict', 'refused: P0002 VERDICT_GONE', pg_temp.hb6_appeal(1, 'log 2', 'rh not mine'));
SELECT pg_temp.rh_case('2 appeals the suspension', 'done', pg_temp.hb6_appeal(2, 'log 2', 'rh I was provoked'));
SELECT pg_temp.rh_case('a second appeal of it', 'refused: P0002 ALREADY_APPEALED', pg_temp.hb6_appeal(2, 'log 2', 'rh again'));
SELECT pg_temp.rh_case('2 reads it waiting, and may not appeal again', 'pending|rh I was provoked|false',
  (pg_temp.hb6_verdict(2, 'log 2') -> 'appeal' ->> 'status') || '|' || (pg_temp.hb6_verdict(2, 'log 2') -> 'appeal' ->> 'text') || '|' || (pg_temp.hb6_verdict(2, 'log 2') ->> 'can_appeal'));
SELECT pg_temp.rh_case('the door counts it for 3, never for 4 who ruled', '0|1',
  (pg_temp.hb6_as(4, 'SELECT public.tribunal_waiting()::text')::jsonb ->> 'appeals') || '|' || (pg_temp.hb6_as(3, 'SELECT public.tribunal_waiting()::text')::jsonb ->> 'appeals'));
SELECT pg_temp.rh_case('a member reads no appeals', 'refused: 42501', left(pg_temp.hb6_as(1, 'SELECT public.get_pending_appeals(NULL, NULL, 50)::text'), 14));

-- Heard by another moderator.
SELECT pg_temp.rh_case('4 reads it as their own verdict', 'true',
  (pg_temp.hb6_appeals(4) @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM hb6_ids WHERE what = 'V log 2'), 'ruled_by_you', true, 'appeal', 'rh I was provoked')))::text);
SELECT pg_temp.rh_case('4, who ruled, may not hear it', 'refused: 42501 OWN_VERDICT', pg_temp.hb6_hear(4, 'log 2', 'overturned', 'rh mine to undo'));
SELECT pg_temp.rh_case('3 reads it as another''s', 'true',
  (pg_temp.hb6_appeals(3) @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM hb6_ids WHERE what = 'V log 2'), 'ruled_by_you', false)))::text);
SELECT pg_temp.rh_case('a hearing with no word for the member', 'refused: P0001', left(pg_temp.hb6_hear(3, 'log 2', 'overturned', ''), 14));
SELECT pg_temp.rh_case('3 overturns the suspension', 'done', pg_temp.hb6_hear(3, 'log 2', 'overturned', 'rh the provocation was plain'));
SELECT pg_temp.rh_case('the pause no longer holds; the ban still does', 'true|',
  (pg_temp.hb6_standing()).is_banned::text || '|' || coalesce((pg_temp.hb6_standing()).suspended_until::text, ''));
SELECT pg_temp.rh_case('2 is told it is struck', 'The Tribunal has heard your appeal and overturns the verdict: it is struck from your record. The pause it set no longer holds. The Tribunal''s word: rh the provocation was plain',
  pg_temp.hb6_notice() ->> 'message');
SELECT pg_temp.rh_case('the notice names the verdict', 'true',
  ((pg_temp.hb6_notice() -> 'metadata' ->> 'mod_action_id')::uuid = (SELECT id FROM hb6_ids WHERE what = 'V log 2'))::text);
SELECT pg_temp.rh_case('2 reads the outcome and the word', 'overturned|rh the provocation was plain',
  (pg_temp.hb6_verdict(2, 'log 2') -> 'appeal' ->> 'status') || '|' || (pg_temp.hb6_verdict(2, 'log 2') -> 'appeal' ->> 'note'));
SELECT pg_temp.rh_case('heard again', 'refused: P0002 ALREADY_JUDGED', pg_temp.hb6_hear(3, 'log 2', 'upheld', 'rh second thoughts'));
SELECT pg_temp.rh_case('the record says it was struck', 'overturned|true',
  pg_temp.hb6_as(3, format('SELECT appeal_status || ''|'' || (lifted_at IS NOT NULL)::text FROM public.get_moderation_history_for_users(ARRAY[%L]::uuid[], 20) WHERE id = %L',
    (SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM hb6_ids WHERE what = 'V log 2'))));

-- Upheld: the ban stands.
SELECT pg_temp.rh_case('2, banned, appeals the ban', 'done', pg_temp.hb6_appeal(2, 'log 3', 'rh it was a joke'));
SELECT pg_temp.rh_case('3 upholds it', 'done', pg_temp.hb6_hear(3, 'log 3', 'upheld', 'rh it was no joke'));
SELECT pg_temp.rh_case('the ban stands', 'true', (pg_temp.hb6_standing()).is_banned::text);
SELECT pg_temp.rh_case('2 is told it is upheld', 'The Tribunal has heard your appeal and upholds the verdict. The Tribunal''s word: rh it was no joke',
  pg_temp.hb6_notice() ->> 'message');

-- Overturned: the warning withdrawn.
SELECT pg_temp.rh_case('2 has one warning', '1|1',
  (pg_temp.hb6_standing()).warning_count::text || '|' || (SELECT count(*)::text FROM public.warnings WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2)));
SELECT pg_temp.rh_case('2 appeals the warning', 'done', pg_temp.hb6_appeal(2, 'log 1', 'rh I meant no harm'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb6_hear(3, 'log 1', 'overturned', 'rh fair'));
SELECT pg_temp.rh_case('the warning is withdrawn, and its count', '0|0',
  (pg_temp.hb6_standing()).warning_count::text || '|' || (SELECT count(*)::text FROM public.warnings WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2)));

-- Overturned: the salon message stands again.
SELECT pg_temp.rh_case('the message was struck through, and its quote taken from the reply', '|true|none',
  (SELECT content || '|' || (deleted_at IS NOT NULL)::text FROM public.lounge_messages WHERE id = (SELECT id FROM hb6_ids WHERE what = 'message')) || '|'
  || coalesce((SELECT reply_to_content FROM public.lounge_messages WHERE id = (SELECT id FROM hb6_ids WHERE what = 'reply')), 'none'));
SELECT pg_temp.rh_case('2 appeals its removal', 'done', pg_temp.hb6_appeal(2, 'message', 'rh it was a quote'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb6_hear(3, 'message', 'overturned', 'rh a quote it was'));
SELECT pg_temp.rh_case('the message stands again, as written', 'rh the message of 2|false',
  (SELECT content || '|' || (deleted_at IS NOT NULL)::text FROM public.lounge_messages WHERE id = (SELECT id FROM hb6_ids WHERE what = 'message')));
SELECT pg_temp.rh_case('1 in the salon reads it again', 'rh the message of 2',
  pg_temp.hb6_as(1, format('SELECT content FROM public.lounge_messages WHERE id = %L', (SELECT id FROM hb6_ids WHERE what = 'message'))));
SELECT pg_temp.rh_case('and the reply quotes it again', 'rh the message of 2',
  pg_temp.hb6_as(1, format('SELECT reply_to_content FROM public.lounge_messages WHERE id = %L', (SELECT id FROM hb6_ids WHERE what = 'reply'))));
SELECT pg_temp.rh_case('2 is told it stands again', 'true',
  (position('What it removed stands again where it was.' in pg_temp.hb6_notice() ->> 'message') > 0)::text);

-- Overturned: the page's words come back, never over what was written since.
SELECT pg_temp.rh_case('2 appeals the page cleared', 'done', pg_temp.hb6_appeal(2, 'page', 'rh my bio was a film quote'));
UPDATE public.profiles SET display_name = 'rh Two Again' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb6_hear(3, 'page', 'overturned', 'rh it was a quote'));
SELECT pg_temp.rh_case('the words come back; the name written since stays', 'rh the words of 2|rh Two Again',
  (pg_temp.hb6_standing()).bio || '|' || (pg_temp.hb6_standing()).display_name);

-- Overturned: a removed log's words are kept for 2 with the verdict; the log itself comes back whole where
-- the house withheld it (H-B10, a later car), and is told so either way.
SELECT pg_temp.rh_case('2 reads the removed log''s words', 'rh review 4',
  pg_temp.hb6_verdict(2, 'log 4') -> 'removed' ->> 'body');
SELECT pg_temp.rh_case('2 appeals it', 'done', pg_temp.hb6_appeal(2, 'log 4', 'rh it was a review'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb6_hear(3, 'log 4', 'overturned', 'rh harsh, not hateful'));
SELECT pg_temp.rh_case('2 is told what became of what it removed', 'true',
  (position('What it removed ' in pg_temp.hb6_notice() ->> 'message') > 0)::text);

-- Overturned: the second ban leaves 2 closed by the first, under its reason.
SELECT pg_temp.rh_case('2 appeals the second ban', 'done', pg_temp.hb6_appeal(2, 'log 5', 'rh one ban is enough'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb6_hear(3, 'log 5', 'overturned', 'rh a ban twice over'));
SELECT pg_temp.rh_case('2 stays closed by the first ban, under its reason', 'true|rh the reason for log 3',
  (pg_temp.hb6_standing()).is_banned::text || '|' || (pg_temp.hb6_standing()).suspension_reason);
SELECT pg_temp.rh_case('nothing waits now', '0',
  pg_temp.hb6_as(3, 'SELECT public.tribunal_waiting()::text')::jsonb ->> 'appeals');

-- A verdict about a moderator: 4 warns 3, and 3 appeals it. 3 may not hear it, as 4 who ruled may not.
WITH made AS (INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, appeal, appeal_filed_at, appeal_status)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 4), 'warn',
                      'rh a warning to 3', 'rh not me', now(), 'pending') RETURNING id)
INSERT INTO hb6_ids SELECT 'V of 3', id FROM made;
SELECT pg_temp.rh_case('the door counts it for neither: 3 is its member, 4 its ruler', '0|0',
  (pg_temp.hb6_as(3, 'SELECT public.tribunal_waiting()::text')::jsonb ->> 'appeals') || '|' || (pg_temp.hb6_as(4, 'SELECT public.tribunal_waiting()::text')::jsonb ->> 'appeals'));
SELECT pg_temp.rh_case('the docket tells each why', 'true|true',
  (pg_temp.hb6_appeals(3) @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM hb6_ids WHERE what = 'V of 3'), 'refused', 'OWN_CASE')))::text || '|'
  || (pg_temp.hb6_appeals(4) @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM hb6_ids WHERE what = 'V of 3'), 'refused', 'OWN_VERDICT')))::text);
SELECT pg_temp.rh_case('3 may not hear the appeal of a verdict about themselves', 'refused: 42501 OWN_CASE|pending',
  pg_temp.hb6_hear(3, 'of 3', 'overturned', 'rh I was right') || '|'
  || (SELECT appeal_status FROM public.mod_actions WHERE id = (SELECT id FROM hb6_ids WHERE what = 'V of 3')));

SELECT pg_temp.rh_verdict();
ROLLBACK;
