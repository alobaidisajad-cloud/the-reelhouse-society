-- ════════════════════════════════════════════════════════════════════════════
-- a_row_keeps_what_it_is_rehearsal.sql — 20261015_06. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_row_keeps_what_it_is_rehearsal.sql
--
-- 20261015_06 is applied on production; this shows it still holds there, and
-- on every sealed copy (db-integration.yml). Rows are made here, as the house,
-- for two members (one made private), then each is edited as its own member,
-- signed in as the app signs in. Every edit a member makes of what a row is
-- comes back as it was; every edit of what they wrote lands; and the house's
-- own functions still change what only they may (a request accepted).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT set_config('rehearsal.a', pg_temp.rh_found('a member',
  (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.b', pg_temp.rh_found('a second member',
  (SELECT id FROM public.profiles WHERE id <> current_setting('rehearsal.a')::uuid ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
-- Neither is held by a ban, so each edit is judged on what it changes alone.
UPDATE public.profiles SET is_banned = false, suspended_until = NULL
 WHERE id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid);
UPDATE public.profiles SET is_social_private = true WHERE id = current_setting('rehearsal.b')::uuid;
DELETE FROM public.interactions WHERE user_id = current_setting('rehearsal.a')::uuid
   AND target_user_id = current_setting('rehearsal.b')::uuid;

CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_rows TO authenticated;
WITH r AS (INSERT INTO public.interactions (user_id, target_user_id, type)
           VALUES (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid, 'follow_request') RETURNING id)
INSERT INTO rh_rows SELECT 'request', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh open', current_setting('rehearsal.b')::uuid, false) RETURNING id)
INSERT INTO rh_rows SELECT 'open salon', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh private', current_setting('rehearsal.b')::uuid, true) RETURNING id)
INSERT INTO rh_rows SELECT 'private salon', id FROM r;
WITH r AS (INSERT INTO public.lounge_members (lounge_id, user_id, status)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'open salon'), current_setting('rehearsal.a')::uuid, 'approved') RETURNING id)
INSERT INTO rh_rows SELECT 'seat', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'open salon'), current_setting('rehearsal.a')::uuid, 'rh said') RETURNING id)
INSERT INTO rh_rows SELECT 'message', id FROM r;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES (current_setting('rehearsal.a')::uuid, 603, 'rh film', current_date) RETURNING id)
INSERT INTO rh_rows SELECT 'a''s log', id FROM r;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES (current_setting('rehearsal.b')::uuid, 603, 'rh film', current_date) RETURNING id)
INSERT INTO rh_rows SELECT 'b''s log', id FROM r;
WITH r AS (INSERT INTO public.log_comments (log_id, user_id, username, body)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'a''s log'), current_setting('rehearsal.a')::uuid, 'rh', 'rh words') RETURNING id)
INSERT INTO rh_rows SELECT 'comment', id FROM r;
WITH r AS (INSERT INTO public.notifications (user_id, type, message, title)
           VALUES (current_setting('rehearsal.a')::uuid, 'system', 'rh notice', 'rh title') RETURNING id)
INSERT INTO rh_rows SELECT 'notice', id FROM r;
WITH r AS (INSERT INTO public.warnings (user_id, admin_id, reason)
           VALUES (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid, 'rh reason') RETURNING id)
INSERT INTO rh_rows SELECT 'warning', id FROM r;
-- The open salon is the member's own, so its count can be tried.
UPDATE public.lounges SET creator_id = current_setting('rehearsal.a')::uuid WHERE id = (SELECT id FROM rh_rows WHERE what = 'open salon');
SELECT set_config('rh.count', member_count::text, true) AS done FROM public.lounges WHERE id = (SELECT id FROM rh_rows WHERE what = 'open salon') \gset rh_

CREATE FUNCTION pg_temp.rh_as(member text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting(member), 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.rh_row(what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_rows WHERE rh_rows.what = rh_row.what $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_as(text), pg_temp.rh_row(text) TO authenticated;

-- ── as the member: each edit of what a row is ────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
UPDATE public.interactions SET type = 'follow' WHERE id = (SELECT pg_temp.rh_row('request'));
UPDATE public.interactions SET target_user_id = current_setting('rehearsal.a')::uuid WHERE id = (SELECT pg_temp.rh_row('request'));
SELECT set_config('rh.sees', public.can_view_user_data(current_setting('rehearsal.b')::uuid)::text, true) AS done \gset rh_
UPDATE public.lounge_members SET lounge_id = pg_temp.rh_row('private salon'), joined_at = '2000-01-01'
 WHERE id = (SELECT pg_temp.rh_row('seat'));
UPDATE public.lounge_members SET last_read_at = '2001-01-01' WHERE id = (SELECT pg_temp.rh_row('seat'));
UPDATE public.lounge_messages SET lounge_id = pg_temp.rh_row('private salon'), content = 'rh changed',
       created_at = '2000-01-01', reply_to_content = 'rh never said' WHERE id = (SELECT pg_temp.rh_row('message'));
UPDATE public.log_comments SET log_id = pg_temp.rh_row('b''s log'), body = 'rh words, amended' WHERE id = (SELECT pg_temp.rh_row('comment'));
UPDATE public.logs SET created_at = '2000-01-01', review = 'rh review' WHERE id = (SELECT pg_temp.rh_row('a''s log'));
UPDATE public.notifications SET title = 'rh forged', is_read = true WHERE id = (SELECT pg_temp.rh_row('notice'));
UPDATE public.warnings SET reason = 'rh rewritten', acknowledged = true WHERE id = (SELECT pg_temp.rh_row('warning'));
UPDATE public.lounges SET member_count = 9999, name = 'rh renamed' WHERE id = (SELECT pg_temp.rh_row('open salon'));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('an interaction keeps its kind and its parties', 'follow_request|' || current_setting('rehearsal.b'),
    (SELECT type || '|' || target_user_id FROM public.interactions WHERE id = (SELECT pg_temp.rh_row('request'))));
  PERFORM pg_temp.rh_case('a private member''s file opens as the house decides', 'false', current_setting('rh.sees', true));
  PERFORM pg_temp.rh_case('a seat keeps its salon and the day it was taken', pg_temp.rh_row('open salon')::text || '|true',
    (SELECT lounge_id || '|' || (joined_at > '2000-01-02')::text FROM public.lounge_members WHERE id = (SELECT pg_temp.rh_row('seat'))));
  -- Moved, never frozen; dated by the house's clock, whatever the phone sent (20261028_02).
  PERFORM pg_temp.rh_case('a seat''s reading place is the member''s to move, to the house''s now', now()::date::text,
    (SELECT last_read_at::date::text FROM public.lounge_members WHERE id = (SELECT pg_temp.rh_row('seat'))));
  PERFORM pg_temp.rh_case('a message keeps its salon, its words, its quote and its time', pg_temp.rh_row('open salon')::text || '|rh said|true|',
    (SELECT lounge_id || '|' || content || '|' || (created_at > '2000-01-02')::text || '|' || coalesce(reply_to_content, '')
       FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_row('message'))));
  PERFORM pg_temp.rh_case('a comment keeps its log; its words are its writer''s', pg_temp.rh_row('a''s log')::text || '|rh words, amended',
    (SELECT log_id || '|' || body FROM public.log_comments WHERE id = (SELECT pg_temp.rh_row('comment'))));
  PERFORM pg_temp.rh_case('a log keeps the day it was made; its review is its member''s', 'true|rh review',
    (SELECT (created_at > '2000-01-02')::text || '|' || review FROM public.logs WHERE id = (SELECT pg_temp.rh_row('a''s log'))));
  PERFORM pg_temp.rh_case('a notice keeps what it says; its reading is the member''s', 'rh title|true',
    (SELECT title || '|' || is_read FROM public.notifications WHERE id = (SELECT pg_temp.rh_row('notice'))));
  PERFORM pg_temp.rh_case('a warning keeps the house''s word; its member says it was read', 'rh reason|true',
    (SELECT reason || '|' || acknowledged FROM public.warnings WHERE id = (SELECT pg_temp.rh_row('warning'))));
  PERFORM pg_temp.rh_case('a salon''s count is its seats''; its name is its host''s', current_setting('rh.count', true) || '|rh renamed',
    (SELECT member_count || '|' || name FROM public.lounges WHERE id = (SELECT pg_temp.rh_row('open salon'))));
END $$;

-- ── as the private member: the house's own function still accepts the request ─
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.b') AS done \gset rh_
SELECT public.accept_follow_request(current_setting('rehearsal.a')::uuid) AS done \gset rh_
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
SELECT set_config('rh.sees_now', public.can_view_user_data(current_setting('rehearsal.b')::uuid)::text, true) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DO $$ BEGIN
  PERFORM pg_temp.rh_case('an accepted request becomes a follow, as the house makes it', 'follow',
    (SELECT type FROM public.interactions WHERE user_id = current_setting('rehearsal.a')::uuid
        AND target_user_id = current_setting('rehearsal.b')::uuid));
  PERFORM pg_temp.rh_case('and the private member opens to the follower then', 'true', current_setting('rh.sees_now', true));
  PERFORM pg_temp.rh_case('every table a member edits keeps what its rows are', '14',
    (SELECT count(*)::text FROM pg_trigger WHERE tgname = 'a_keeps_what_it_is'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
