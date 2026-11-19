-- ════════════════════════════════════════════════════════════════════════════
-- a_shorter_sentence_never_cuts_a_longer_one_rehearsal.sql — 20261120_24. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_shorter_sentence_never_cuts_a_longer_one_rehearsal.sql --with-train
--
-- The train applies 20261120_24 here (with_train), 20261120_00 to 20261120_23 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE hb2_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON hb2_ids TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_24_a_shorter_sentence_never_cuts_a_longer_one.sql
\endif

-- ── H-B2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B2 rehearsal · a shorter sentence never cuts a longer one; an admin lifts a ban or a suspension (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-B6.locks, H-B5.table,
-- H-B5 and H-B2 applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member 4 is the house's moderator. Member 1 reports pieces of member 2's: four logs, 2's page and 2's
-- salon. Then, each as themselves:
--   4 suspends 2 for 720 hours, then for 24: 2 stays suspended to the 720 hours' end, under the first
--     reason, and the second notice says the longer pause stands; each notice names its verdict;
--   4 lifts it: 2 is free, both verdicts read lifted, 2 is told and the notice names the verdict;
--   lifting again finds nothing to lift; member 1, no admin, cannot lift or list;
--   4 suspends 2 for 24 hours, then for 48: the later end stands, under the second reason;
--   the SANCTIONS list names 2 while suspended, and not once lifted;
--   4 bans 2 and lifts it: 2 may write again; 4 exiles 2: the exile is never lifted by hand;
--   (H-B7) 4 removes 2's page's words and 2's salon's name: both are cleared, the copy keeps what puts
--     them back, and 2 is told which;
--   a verdict's notice written before this piece is named by the piece's one pass.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET is_banned = false, banned_at = NULL, suspended_until = NULL, suspension_reason = NULL
 WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n < 4) AND role = 'admin';
UPDATE public.profiles SET bio = 'rh the words of 2', display_name = 'rh Two', avatar_url = 'https://example.com/rh2.jpg'
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
DELETE FROM public.reports WHERE reporter_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.mod_actions WHERE target_user_id IN (SELECT id FROM rehearsal_members);

WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              SELECT (SELECT id FROM rehearsal_members WHERE n = 2), 990000600 + g, 'rh film ' || g, '2026-01-01', 'rh review ' || g
                FROM generate_series(1, 4) g RETURNING id, film_id)
INSERT INTO hb2_ids SELECT 'log ' || (film_id - 990000600), id FROM made;
WITH made AS (INSERT INTO public.lounges (name, description, creator_id, is_private)
              VALUES ('rh The Salon of 2', 'rh what the salon of 2 says', (SELECT id FROM rehearsal_members WHERE n = 2), false) RETURNING id)
INSERT INTO hb2_ids SELECT 'salon', id FROM made;
INSERT INTO hb2_ids VALUES ('page', (SELECT id FROM rehearsal_members WHERE n = 2));

CREATE FUNCTION pg_temp.hb2_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.hb2_as(bigint, text) TO authenticated;
-- Member 1 reports a piece of 2's, kept as 'case <piece>'.
CREATE FUNCTION pg_temp.hb2_report(p_piece text, p_type text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id text;
BEGIN
  v_id := pg_temp.hb2_as(1, format('SELECT public.submit_report(%L, %L, %L, %L)::text',
    (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM hb2_ids WHERE what = p_piece), p_type, 'harassment'));
  IF v_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: the report of % was refused: %', p_piece, v_id; END IF;
  INSERT INTO hb2_ids VALUES ('case ' || p_piece, v_id::uuid);
END $$;
-- Member 4's verdict on a case: 'done', or the refusal.
CREATE FUNCTION pg_temp.hb2_verdict(p_piece text, p_action text, p_reason text, p_hours integer) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb2_as(4, format('SELECT ''done'' FROM public.resolve_moderation_report_v2(%L, %L, %L, %L, %s, true)',
    (SELECT id FROM hb2_ids WHERE what = 'case ' || p_piece), p_action, (SELECT id FROM rehearsal_members WHERE n = 4), p_reason, coalesce(p_hours::text, 'NULL')));
$$;
CREATE FUNCTION pg_temp.hb2_lift(p_by bigint, p_reason text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb2_as(p_by, format('SELECT ''done'' FROM public.lift_sanction(%L, %L)', (SELECT id FROM rehearsal_members WHERE n = 2), p_reason));
$$;
-- Member 2's standing, as the house holds it.
CREATE FUNCTION pg_temp.hb2_standing() RETURNS public.profiles LANGUAGE sql AS $$
  SELECT * FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
$$;
-- Member 2's newest notice from the house, as 2 reads it.
CREATE FUNCTION pg_temp.hb2_notice() RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.hb2_as(2, 'SELECT jsonb_build_object(''message'', message, ''metadata'', metadata)::text FROM public.notifications
     WHERE user_id = auth.uid() AND type = ''moderation'' ORDER BY created_at DESC, id DESC LIMIT 1')::jsonb;
END $$;
-- Each verdict in its own moment, as two verdicts given one after the other are.
CREATE FUNCTION pg_temp.hb2_age() RETURNS void LANGUAGE sql AS $$
  UPDATE public.mod_actions SET created_at = created_at - interval '1 minute' WHERE target_user_id = (SELECT id FROM rehearsal_members WHERE n = 2);
  UPDATE public.notifications SET created_at = created_at - interval '1 minute' WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'moderation';
$$;

SELECT pg_temp.hb2_report('log ' || g, 'log') FROM generate_series(1, 4) g;
SELECT pg_temp.hb2_report('page', 'profile') AS done \gset rh_
SELECT pg_temp.hb2_report('salon', 'lounge') AS done \gset rh_

-- A long sentence, then a short one: the long one stands.
SELECT pg_temp.rh_case('720 hours on the first case', 'done', pg_temp.hb2_verdict('log 1', 'suspend', 'rh the long reason', 720));
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('the first notice names its verdict', 'true',
  ((pg_temp.hb2_notice() -> 'metadata' ->> 'mod_action_id')::uuid = (SELECT id FROM public.mod_actions WHERE report_id = (SELECT id FROM hb2_ids WHERE what = 'case log 1')))::text);
SELECT pg_temp.rh_case('24 hours on the second case', 'done', pg_temp.hb2_verdict('log 2', 'suspend', 'rh the short reason', 24));
SELECT pg_temp.rh_case('the 720 hours still stand', 'true',
  ((pg_temp.hb2_standing()).suspended_until > now() + interval '719 hours')::text);
SELECT pg_temp.rh_case('under the long sentence''s reason', 'rh the long reason', (pg_temp.hb2_standing()).suspension_reason);
SELECT pg_temp.rh_case('the short notice says the longer pause stands', 'true',
  (position('The longer pause already in place stands, to ' in pg_temp.hb2_notice() ->> 'message') > 0)::text);
SELECT pg_temp.rh_case('the short notice names its own verdict', 'true',
  ((pg_temp.hb2_notice() -> 'metadata' ->> 'mod_action_id')::uuid = (SELECT id FROM public.mod_actions WHERE report_id = (SELECT id FROM hb2_ids WHERE what = 'case log 2')))::text);

-- The SANCTIONS list, as the moderator reads it; a member reads none.
SELECT pg_temp.rh_case('the list names 2, suspended', 'true',
  (pg_temp.hb2_as(4, 'SELECT public.get_sanctioned_members(NULL, NULL, 50)::text')::jsonb @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM rehearsal_members WHERE n = 2), 'is_banned', false)))::text);
SELECT pg_temp.rh_case('a member reads no list', 'refused: 42501',
  left(pg_temp.hb2_as(1, 'SELECT public.get_sanctioned_members(NULL, NULL, 50)::text'), 14));
SELECT pg_temp.rh_case('a member lifts nothing', 'refused: 42501',
  left(pg_temp.hb2_lift(1, 'rh by hand'), 14));
SELECT pg_temp.rh_case('a lift with no reason', 'refused: P0001',
  left(pg_temp.hb2_lift(4, '  '), 14));
-- No admin lifts their own sanction: 4, suspended, is refused, as the one a case is about always is.
UPDATE public.profiles SET suspended_until = now() + interval '1 day', suspension_reason = 'rh 4 paused'
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
SELECT pg_temp.rh_case('an admin lifts no sanction of their own', 'refused: 42501 OWN_CASE|true',
  pg_temp.hb2_as(4, format('SELECT ''done'' FROM public.lift_sanction(%L, %L)', (SELECT id FROM rehearsal_members WHERE n = 4), 'rh mine'))
  || '|' || ((SELECT suspended_until FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4)) > now())::text);
UPDATE public.profiles SET suspended_until = NULL, suspension_reason = NULL
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
-- A suspension 2 served a month ago: a lift today leaves it served on the record, never "lifted".
INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, duration_hours, expires_at, created_at)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 4), 'suspend',
        'rh served long ago', 24, now() - interval '30 days', now() - interval '31 days');

-- Lifted.
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('4 lifts the suspension', 'done', pg_temp.hb2_lift(4, 'rh served enough'));
SELECT pg_temp.rh_case('2 may write again', 'false|',
  (pg_temp.hb2_standing()).is_banned::text || '|' || coalesce((pg_temp.hb2_standing()).suspended_until::text, ''));
SELECT pg_temp.rh_case('both verdicts read lifted, with the reason', '2|rh served enough',
  (SELECT count(*)::text || '|' || min(lift_reason) FROM public.mod_actions WHERE target_user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND lifted_at IS NOT NULL));
SELECT pg_temp.rh_case('the sentence served a month ago stays served, not lifted', 'served',
  (SELECT CASE WHEN lifted_at IS NULL THEN 'served' ELSE 'lifted' END FROM public.mod_actions
    WHERE target_user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND reason = 'rh served long ago'));
SELECT pg_temp.rh_case('2 is told', 'The house has lifted the pause on your membership. You may write again. Reason: rh served enough',
  pg_temp.hb2_notice() ->> 'message');
SELECT pg_temp.rh_case('the lift''s notice names the long verdict', 'true',
  ((pg_temp.hb2_notice() -> 'metadata' ->> 'mod_action_id')::uuid = (SELECT id FROM public.mod_actions WHERE report_id = (SELECT id FROM hb2_ids WHERE what = 'case log 1')))::text);
SELECT pg_temp.rh_case('lifting again finds nothing', 'refused: P0002 NOT_SANCTIONED', pg_temp.hb2_lift(4, 'rh again'));
SELECT pg_temp.rh_case('the list no longer names 2', 'false',
  (pg_temp.hb2_as(4, 'SELECT public.get_sanctioned_members(NULL, NULL, 50)::text')::jsonb @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM rehearsal_members WHERE n = 2))))::text);

-- A short sentence, then a longer one: the later end stands, under its reason.
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('24 hours on the third case', 'done', pg_temp.hb2_verdict('log 3', 'suspend', 'rh the first short reason', 24));
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('48 hours on the fourth case', 'done', pg_temp.hb2_verdict('log 4', 'suspend', 'rh the longer reason', 48));
SELECT pg_temp.rh_case('the 48 hours stand', 'true',
  ((pg_temp.hb2_standing()).suspended_until > now() + interval '47 hours')::text);
SELECT pg_temp.rh_case('under the longer reason', 'rh the longer reason', (pg_temp.hb2_standing()).suspension_reason);
SELECT pg_temp.rh_case('its notice tells it plainly', 'After reviewing a report, the house has paused your membership for 48 hours. Reason: rh the longer reason',
  pg_temp.hb2_notice() ->> 'message');

-- (H-B7) A page's words and a salon's name removed.
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('REMOVE CONTENT on 2''s page', 'done', pg_temp.hb2_verdict('page', 'delete_content', 'rh a slur in the bio', NULL));
SELECT pg_temp.rh_case('the page''s words, name and picture are cleared', '|||{}',
  coalesce((pg_temp.hb2_standing()).bio, '') || '|' || coalesce((pg_temp.hb2_standing()).display_name, '') || '|'
  || coalesce((pg_temp.hb2_standing()).avatar_url, '') || '|' || coalesce((pg_temp.hb2_standing()).social_links::text, ''));
SELECT pg_temp.rh_case('the copy keeps what puts the page back', 'rh the words of 2|rh Two',
  (SELECT content_snapshot -> 'kept' ->> 'bio' || '|' || (content_snapshot -> 'kept' ->> 'display_name') FROM public.mod_actions
    WHERE report_id = (SELECT id FROM hb2_ids WHERE what = 'case page')));
SELECT pg_temp.rh_case('2 is told their page was cleared', 'After reviewing a report, the house has cleared the words and picture on your page. Reason: rh a slur in the bio',
  pg_temp.hb2_notice() ->> 'message');
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('REMOVE CONTENT on 2''s salon', 'done', pg_temp.hb2_verdict('salon', 'delete_content', 'rh a slur in the name', NULL));
SELECT pg_temp.rh_case('the salon''s name, words and cover are cleared', 'An Unnamed Salon||',
  (SELECT name || '|' || coalesce(description, '') || '|' || coalesce(cover_image, '') FROM public.lounges WHERE id = (SELECT id FROM hb2_ids WHERE what = 'salon')));
SELECT pg_temp.rh_case('the copy keeps the salon''s name', 'rh The Salon of 2',
  (SELECT content_snapshot -> 'kept' ->> 'name' FROM public.mod_actions WHERE report_id = (SELECT id FROM hb2_ids WHERE what = 'case salon')));
SELECT pg_temp.rh_case('its owner, still suspended, may not rename it meanwhile (the freeze stands)', 'refused: 42501',
  left(pg_temp.hb2_as(2, format('UPDATE public.lounges SET name = %L WHERE id = %L RETURNING ''renamed''', 'rh renamed', (SELECT id FROM hb2_ids WHERE what = 'salon'))), 14));

-- A ban, lifted; an exile, never by hand.
UPDATE public.reports SET status = 'pending' WHERE id = (SELECT id FROM hb2_ids WHERE what = 'case log 1');
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('4 bans 2', 'done', pg_temp.hb2_verdict('log 1', 'ban', 'rh the ban''s reason', NULL));
SELECT pg_temp.rh_case('the list names 2, banned', 'true',
  (pg_temp.hb2_as(4, 'SELECT public.get_sanctioned_members(NULL, NULL, 50)::text')::jsonb @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM rehearsal_members WHERE n = 2), 'is_banned', true, 'exiled', false)))::text);
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('4 lifts the ban', 'done', pg_temp.hb2_lift(4, 'rh a second chance'));
SELECT pg_temp.rh_case('2 is no longer banned or suspended', 'false|',
  (pg_temp.hb2_standing()).is_banned::text || '|' || coalesce((pg_temp.hb2_standing()).suspended_until::text, ''));
SELECT pg_temp.rh_case('2 is told the closing is lifted', 'The house has lifted the closing of your membership. You may write again. Reason: rh a second chance',
  pg_temp.hb2_notice() ->> 'message');
UPDATE public.reports SET status = 'pending' WHERE id = (SELECT id FROM hb2_ids WHERE what = 'case log 2');
SELECT pg_temp.hb2_age() AS done \gset rh_
SELECT pg_temp.rh_case('4 exiles 2', 'done', pg_temp.hb2_verdict('log 2', 'permanent_exile', 'rh the exile''s reason', NULL));
SELECT pg_temp.rh_case('an exile is never lifted by hand', 'refused: P0001 EXILE_STANDS', pg_temp.hb2_lift(4, 'rh mercy'));
SELECT pg_temp.rh_case('the list names 2, exiled', 'true',
  (pg_temp.hb2_as(4, 'SELECT public.get_sanctioned_members(NULL, NULL, 50)::text')::jsonb @> jsonb_build_array(jsonb_build_object('id', (SELECT id FROM rehearsal_members WHERE n = 2), 'exiled', true)))::text);

-- A verdict's notice written before this piece (no verdict named) is named by the piece's one pass.
SELECT pg_temp.hb2_age() AS done \gset rh_
WITH v AS (INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 4), 'warn', 'rh an old warning') RETURNING id, created_at)
INSERT INTO hb2_ids SELECT 'old verdict', id FROM v;
INSERT INTO public.notifications (user_id, type, title, body, message, metadata, created_at)
SELECT target_user_id, 'moderation', 'A Notice from the House', 'rh old', 'rh old', jsonb_build_object('action', 'warn', 'reason', 'rh an old warning'), created_at
  FROM public.mod_actions WHERE id = (SELECT id FROM hb2_ids WHERE what = 'old verdict');
UPDATE public.notifications n
   SET metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('mod_action_id', m.id)
  FROM public.mod_actions m
 WHERE m.action <> 'dismiss' AND m.target_user_id IS NOT NULL
   AND n.user_id = m.target_user_id AND n.created_at = m.created_at
   AND n.type = 'moderation' AND n.metadata ->> 'action' = m.action
   AND NOT (coalesce(n.metadata, '{}'::jsonb) ? 'mod_action_id');
SELECT pg_temp.rh_case('an old notice is named by the one pass', 'true',
  ((SELECT metadata ->> 'mod_action_id' FROM public.notifications WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 3) AND message = 'rh old')::uuid
   = (SELECT id FROM hb2_ids WHERE what = 'old verdict'))::text);

SELECT pg_temp.rh_verdict();
ROLLBACK;
