-- ════════════════════════════════════════════════════════════════════════════
-- a_rule_holds_on_every_path_rehearsal.sql — 20261015_07. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_rule_holds_on_every_path_rehearsal.sql --with-train
--
-- With with_train set, 20261015_07 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). Two members are taken, rows are made
-- for them as the house, and each write and read is tried as a member signed
-- in as the app signs in: with no block between them (every write lands), with
-- a block (each is refused, either way), and with a mute (nothing the muted
-- member writes is refused). Then each other rule. A write tried here is undone
-- at once unless a case reads what it left.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261015_07_a_rule_holds_on_every_path.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT set_config('rehearsal.a', pg_temp.rh_found('a member',
  (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.b', pg_temp.rh_found('a second member',
  (SELECT id FROM public.profiles WHERE id <> current_setting('rehearsal.a')::uuid ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
-- Both in good standing and open to everyone, with no block, follow or error report between them yet.
UPDATE public.profiles SET is_banned = false, suspended_until = NULL, is_social_private = false,
       preferences = COALESCE(preferences, '{}'::jsonb) - 'privacy_annotations' - 'privacy_endorsements'
 WHERE id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid);
DELETE FROM public.user_blocks WHERE blocker_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid)
   AND blocked_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid);
DELETE FROM public.interactions WHERE user_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid)
   AND target_user_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid);
DELETE FROM public.error_logs WHERE user_id = current_setting('rehearsal.a')::uuid;

CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_rows TO authenticated;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES (current_setting('rehearsal.a')::uuid, 603, 'rh film', current_date) RETURNING id)
INSERT INTO rh_rows SELECT 'a''s log', id FROM r;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES (current_setting('rehearsal.b')::uuid, 603, 'rh film', current_date) RETURNING id)
INSERT INTO rh_rows SELECT 'b''s log', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title) VALUES (current_setting('rehearsal.b')::uuid, 'rh list') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s list', id FROM r;
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
           VALUES ('take', current_setting('rehearsal.b')::uuid, 'rh', 'rh take') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s post', id FROM r;
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, ended_at, ended_by)
           VALUES ('take', current_setting('rehearsal.b')::uuid, 'rh', 'rh ended', now(), 'author') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s ended post', id FROM r;
WITH r AS (INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'b''s post'), current_setting('rehearsal.b')::uuid, 'rh', 'rh critique') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s critique', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh open', current_setting('rehearsal.b')::uuid, false) RETURNING id)
INSERT INTO rh_rows SELECT 'salon', id FROM r;
INSERT INTO public.lounge_members (lounge_id, user_id, status)
VALUES ((SELECT id FROM rh_rows WHERE what = 'salon'), current_setting('rehearsal.a')::uuid, 'approved');
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'salon'), current_setting('rehearsal.b')::uuid, 'rh said') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s message', id FROM r;

CREATE FUNCTION pg_temp.rh_as(member text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting(member), 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.rh_row(what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_rows WHERE rh_rows.what = rh_row.what $$;
-- A statement tried alone: 'ok', or its SQLSTATE and words. Unless kept, what it did is undone, so
-- each write is tried on the same rows.
CREATE FUNCTION pg_temp.rh_try(stmt text, keep boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  IF NOT keep THEN RAISE EXCEPTION USING ERRCODE = 'RH000', MESSAGE = 'undone'; END IF;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN CASE WHEN SQLSTATE = 'RH000' THEN 'ok' ELSE SQLSTATE || ': ' || SQLERRM END;
END $$;
-- A member's write, named by what came back: 'ok', 'block' for the block's own refusal,
-- 'rule' for a row rule's, or whatever else it was.
CREATE FUNCTION pg_temp.rh_write(stmt text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE got text := pg_temp.rh_try(stmt);
BEGIN
  RETURN CASE
    WHEN got = '42501: A block stands between these members.' THEN 'block'
    WHEN got LIKE '42501: new row violates row-level security policy%' THEN 'rule'
    ELSE got END;
END $$;
CREATE TEMP TABLE rh_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT INSERT ON rh_got TO authenticated;
-- Every write a member makes on b's work, tried as member a and recorded under `label`.
CREATE FUNCTION pg_temp.rh_writes(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  a text := current_setting('rehearsal.a');
  b text := current_setting('rehearsal.b');
BEGIN
  INSERT INTO rh_got VALUES
    (label || ': a comments on b''s log', pg_temp.rh_write(format(
       'INSERT INTO public.log_comments (log_id, user_id, username, body) VALUES (%L, %L, ''rh'', ''rh words'')', pg_temp.rh_row('b''s log'), a))),
    (label || ': a comments on b''s list', pg_temp.rh_write(format(
       'INSERT INTO public.list_comments (list_id, user_id, content) VALUES (%L, %L, ''rh words'')', pg_temp.rh_row('b''s list'), a))),
    (label || ': a certifies b''s log', pg_temp.rh_write(format(
       'INSERT INTO public.interactions (user_id, target_user_id, target_log_id, type) VALUES (%L, %L, %L, ''endorse_log'')', a, b, pg_temp.rh_row('b''s log')))),
    (label || ': a critiques b''s post', pg_temp.rh_write(format(
       'INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body) VALUES (%L, %L, ''rh'', ''rh critique'')', pg_temp.rh_row('b''s post'), a))),
    (label || ': a certifies b''s post', pg_temp.rh_write(format(
       'INSERT INTO public.dispatch_certifications (user_id, post_id) VALUES (%L, %L)', a, pg_temp.rh_row('b''s post')))),
    (label || ': a certifies b''s critique', pg_temp.rh_write(format(
       'INSERT INTO public.dispatch_certifications (user_id, comment_id) VALUES (%L, %L)', a, pg_temp.rh_row('b''s critique')))),
    (label || ': a certifies b''s post by the old function', pg_temp.rh_write(format(
       'SELECT public.toggle_dossier_certify(%L)', pg_temp.rh_row('b''s post')))),
    (label || ': a follows b', pg_temp.rh_write(format(
       'INSERT INTO public.interactions (user_id, target_user_id, type) VALUES (%L, %L, ''follow'')', a, b)));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_as(text), pg_temp.rh_row(text), pg_temp.rh_try(text, boolean),
  pg_temp.rh_write(text), pg_temp.rh_writes(text) TO authenticated;

-- ── with no block: every write lands, and a's seat reads b's message ─────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
SELECT pg_temp.rh_writes('no block') AS done \gset rh_
SELECT set_config('rh.salon_open', (SELECT count(*) FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_row('b''s message')))::text, true) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- ── b blocks a: refused, either way ──────────────────────────────────────────
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES (current_setting('rehearsal.b')::uuid, current_setting('rehearsal.a')::uuid, 'block');
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
SELECT pg_temp.rh_writes('blocked') AS done \gset rh_
SELECT set_config('rh.salon_blocked', (SELECT count(*) FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_row('b''s message')))::text, true) AS done \gset rh_
-- The member who blocked is refused too.
SELECT pg_temp.rh_as('rehearsal.b') AS done \gset rh_
INSERT INTO rh_got VALUES ('blocked: b comments on a''s log', pg_temp.rh_write(format(
  'INSERT INTO public.log_comments (log_id, user_id, username, body) VALUES (%L, %L, ''rh'', ''rh words'')', pg_temp.rh_row('a''s log'), current_setting('rehearsal.b'))));
INSERT INTO rh_got VALUES ('blocked: b follows a', pg_temp.rh_write(format(
  'INSERT INTO public.interactions (user_id, target_user_id, type) VALUES (%L, %L, ''follow'')', current_setting('rehearsal.b'), current_setting('rehearsal.a'))));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- ── b mutes a: a mute refuses nothing a writes ───────────────────────────────
UPDATE public.user_blocks SET type = 'mute'
 WHERE blocker_id = current_setting('rehearsal.b')::uuid AND blocked_id = current_setting('rehearsal.a')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
SELECT pg_temp.rh_writes('muted') AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id = current_setting('rehearsal.b')::uuid AND blocked_id = current_setting('rehearsal.a')::uuid;

-- ── the comment gate answers for the one signed in, not the one it names ─────
-- b's comments are for followers only; a, who does not follow b, names b.
UPDATE public.profiles SET preferences = COALESCE(preferences, '{}'::jsonb) || '{"privacy_annotations": "followers"}'
 WHERE id = current_setting('rehearsal.b')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
SELECT set_config('rh.named', public.can_annotate_log(current_setting('rehearsal.b')::uuid, pg_temp.rh_row('b''s log'))::text, true) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET preferences = preferences - 'privacy_annotations' WHERE id = current_setting('rehearsal.b')::uuid;

DO $$
DECLARE w text;
BEGIN
  FOREACH w IN ARRAY ARRAY['a comments on b''s log', 'a comments on b''s list', 'a certifies b''s log', 'a critiques b''s post',
                           'a certifies b''s post', 'a certifies b''s critique', 'a certifies b''s post by the old function', 'a follows b'] LOOP
    PERFORM pg_temp.rh_case('no block: ' || w, 'ok', (SELECT got FROM rh_got WHERE what = 'no block: ' || w));
    PERFORM pg_temp.rh_case('muted: ' || w, 'ok', (SELECT got FROM rh_got WHERE what = 'muted: ' || w));
  END LOOP;
  -- A comment or certification of a log or list is refused by its gate; the rest by the block's own words.
  FOREACH w IN ARRAY ARRAY['a comments on b''s log', 'a comments on b''s list', 'a certifies b''s log', 'b comments on a''s log'] LOOP
    PERFORM pg_temp.rh_case('blocked: ' || w, 'rule', (SELECT got FROM rh_got WHERE what = 'blocked: ' || w));
  END LOOP;
  FOREACH w IN ARRAY ARRAY['a critiques b''s post', 'a certifies b''s post', 'a certifies b''s critique',
                           'a certifies b''s post by the old function', 'a follows b', 'b follows a'] LOOP
    PERFORM pg_temp.rh_case('blocked: ' || w, 'block', (SELECT got FROM rh_got WHERE what = 'blocked: ' || w));
  END LOOP;
  PERFORM pg_temp.rh_case('a salon message reads with no block, and not across one', '1|0',
    current_setting('rh.salon_open', true) || '|' || current_setting('rh.salon_blocked', true));
  PERFORM pg_temp.rh_case('the comment gate answers for the one signed in, not the one named', 'false', current_setting('rh.named', true));
  PERFORM pg_temp.rh_case('visitors run none of the three gates', 'false|false|false',
    has_function_privilege('anon', 'public.can_annotate_log(uuid, uuid)', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.can_annotate_list(uuid, uuid)', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.can_endorse_content(uuid, text, uuid, uuid)', 'EXECUTE')::text);
END $$;

-- ── the other rules, as member a ──────────────────────────────────────────────
-- 199 error reports of a's today, so a's next is the 200th.
INSERT INTO public.error_logs (user_id, error_type, error_message)
SELECT current_setting('rehearsal.a')::uuid, 'rh', 'rh error ' || n FROM generate_series(1, 199) AS n;
WITH r AS (INSERT INTO public.reports (reporter_id, content_type, content_id, reason, status, target_user_id)
           VALUES (NULL, 'log', (SELECT id FROM rh_rows WHERE what = 'b''s log')::text, 'spam', 'pending', current_setting('rehearsal.b')::uuid) RETURNING id)
INSERT INTO rh_rows SELECT 'report', id FROM r;
UPDATE public.profiles SET role = 'admin' WHERE id = current_setting('rehearsal.a')::uuid;

SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
INSERT INTO rh_got VALUES
  ('a count of another table', pg_temp.rh_try('SELECT public.rate_limit_check(''profiles'', ''id'', 1)')),
  ('the logs'' daily count', pg_temp.rh_try('SELECT public.rate_limit_check(''logs'', ''user_id'', 20000, 1440)')),
  ('an event filed under another member', pg_temp.rh_write(format(
     'INSERT INTO public.analytics_events (user_id, event_name) VALUES (%L, ''rh'')', current_setting('rehearsal.b')))),
  ('an event filed under its own member', pg_temp.rh_write(format(
     'INSERT INTO public.analytics_events (user_id, event_name) VALUES (%L, ''rh'')', current_setting('rehearsal.a')))),
  ('a certification of an ended post by the old function', pg_temp.rh_write(format(
     'SELECT public.toggle_dossier_certify(%L)', pg_temp.rh_row('b''s ended post'))));
INSERT INTO rh_got VALUES ('the 200th error report of a day, dated in 2000', pg_temp.rh_try(format(
  'INSERT INTO public.error_logs (user_id, error_type, error_message, created_at) VALUES (%L, ''rh'', ''rh last'', ''2000-01-01'')',
  current_setting('rehearsal.a')), true));
INSERT INTO rh_got VALUES ('the 201st', pg_temp.rh_try(format(
  'INSERT INTO public.error_logs (user_id, error_type, error_message) VALUES (%L, ''rh'', ''rh over'')', current_setting('rehearsal.a'))));
INSERT INTO rh_got VALUES ('a report whose reporter has left, resolved', pg_temp.rh_try(format(
  'SELECT public.resolve_moderation_report_v2(%L, ''warn'', %L, ''rh reason'', NULL, true)',
  pg_temp.rh_row('report'), current_setting('rehearsal.a')), true));
-- Certified, then withdrawn: the post is left as it was.
SELECT set_config('rh.toggle', public.toggle_dossier_certify(pg_temp.rh_row('b''s post'))::text || '|'
  || public.toggle_dossier_certify(pg_temp.rh_row('b''s post'))::text, true) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Suspended: the old function says so, as every other write does.
UPDATE public.profiles SET suspended_until = now() + interval '1 day' WHERE id = current_setting('rehearsal.a')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
INSERT INTO rh_got VALUES ('a suspended member certifies by the old function', pg_temp.rh_try(format(
  'SELECT public.toggle_dossier_certify(%L)', pg_temp.rh_row('b''s post'))));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('rate_limit_check counts no table but the one its rule names', '42501: rate_limit_check counts only the rows a rule names',
    (SELECT got FROM rh_got WHERE what = 'a count of another table'));
  PERFORM pg_temp.rh_case('and still counts the logs', 'ok', (SELECT got FROM rh_got WHERE what = 'the logs'' daily count'));
  PERFORM pg_temp.rh_case('an analytics event under another member is refused', 'rule',
    (SELECT got FROM rh_got WHERE what = 'an event filed under another member'));
  PERFORM pg_temp.rh_case('and under its own member is filed', 'ok', (SELECT got FROM rh_got WHERE what = 'an event filed under its own member'));
  PERFORM pg_temp.rh_case('a member''s 200th error report of a day is kept, dated as it arrives', 'ok|true',
    (SELECT got FROM rh_got WHERE what = 'the 200th error report of a day, dated in 2000') || '|'
    || (SELECT (min(created_at) > now() - interval '1 minute')::text FROM public.error_logs
         WHERE user_id = current_setting('rehearsal.a')::uuid AND error_message = 'rh last'));
  PERFORM pg_temp.rh_case('and the 201st is refused', 'P0001: PGRST301: Too many requests. Please wait a moment.',
    (SELECT got FROM rh_got WHERE what = 'the 201st'));
  PERFORM pg_temp.rh_case('the old function certifies and withdraws on an open post', 'true|false', current_setting('rh.toggle', true));
  PERFORM pg_temp.rh_case('and certifies no ended post', 'rule',
    (SELECT got FROM rh_got WHERE what = 'a certification of an ended post by the old function'));
  PERFORM pg_temp.rh_case('nor for a suspended member', 'true',
    ((SELECT got FROM rh_got WHERE what = 'a suspended member certifies by the old function') LIKE '42501: Your account is suspended until %')::text);
  PERFORM pg_temp.rh_case('a report whose reporter has left is resolved, and its member told', 'ok|resolved|1',
    (SELECT got FROM rh_got WHERE what = 'a report whose reporter has left, resolved') || '|'
    || (SELECT status FROM public.reports WHERE id = (SELECT pg_temp.rh_row('report'))) || '|'
    || (SELECT count(*)::text FROM public.notifications WHERE user_id = current_setting('rehearsal.b')::uuid
          AND title = 'A Notice from the House' AND created_at >= now()));
  PERFORM pg_temp.rh_case('every member''s private choice is the one the house keeps', '0',
    (SELECT count(*)::text FROM public.profiles
      WHERE preferences ->> 'social_visibility' = 'private' AND is_social_private IS NOT TRUE));
  PERFORM pg_temp.rh_case('no profile keeps a list of follows in text', '0',
    (SELECT count(*)::text FROM public.profiles WHERE cardinality(following) > 0 OR cardinality(followers) > 0));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
