-- ════════════════════════════════════════════════════════════════════════════
-- a_salon_keeps_its_own_words_rehearsal.sql — 20261016_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_salon_keeps_its_own_words_rehearsal.sql --with-train
--
-- With with_train set, 20261016_01 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). Three members are taken, an open
-- salon where two of them sit and a private one where only the third does are
-- made as the house, and each reaction, reply and withdrawal is tried as a
-- member signed in as the app signs in, with the app's own values beside a
-- forged one. Then a request to follow, read by each kind of reader.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261016_01_a_salon_keeps_its_own_words.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- a and b hold a rank that may speak in a salon; c is a third member who sits nowhere.
SELECT set_config('rehearsal.a', pg_temp.rh_found('a ranked member',
  (SELECT id FROM public.profiles WHERE (lower(tier) IN ('archivist', 'auteur', 'founding') OR lower(role) IN ('archivist', 'auteur', 'founding') OR is_founding)
      AND public.profile_tier_weight(tier, role, is_founding) >= 1 AND role <> 'admin'
    ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.b', pg_temp.rh_found('a second ranked member',
  (SELECT id FROM public.profiles WHERE (lower(tier) IN ('archivist', 'auteur', 'founding') OR lower(role) IN ('archivist', 'auteur', 'founding') OR is_founding)
      AND public.profile_tier_weight(tier, role, is_founding) >= 1
      AND id <> current_setting('rehearsal.a')::uuid ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.c', pg_temp.rh_found('a third member',
  (SELECT id FROM public.profiles WHERE id NOT IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid)
    ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.p', pg_temp.rh_found('a fourth member',
  (SELECT id FROM public.profiles WHERE id NOT IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid,
      current_setting('rehearsal.c')::uuid) ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
-- All in good standing, none blocking another; p's file private, a's open, and no follow among them.
UPDATE public.profiles SET is_banned = false, suspended_until = NULL,
       is_social_private = (id = current_setting('rehearsal.p')::uuid)
 WHERE id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid,
              current_setting('rehearsal.c')::uuid, current_setting('rehearsal.p')::uuid);
DELETE FROM public.user_blocks
 WHERE blocker_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid,
                      current_setting('rehearsal.c')::uuid, current_setting('rehearsal.p')::uuid);
DELETE FROM public.interactions
 WHERE user_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid,
                   current_setting('rehearsal.c')::uuid, current_setting('rehearsal.p')::uuid)
   AND target_user_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid,
                          current_setting('rehearsal.c')::uuid, current_setting('rehearsal.p')::uuid);

CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_rows TO authenticated;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh open salon', current_setting('rehearsal.b')::uuid, false) RETURNING id)
INSERT INTO rh_rows SELECT 'open salon', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh private salon', current_setting('rehearsal.c')::uuid, true) RETURNING id)
INSERT INTO rh_rows SELECT 'private salon', id FROM r;
INSERT INTO public.lounge_members (lounge_id, user_id, status)
VALUES ((SELECT id FROM rh_rows WHERE what = 'open salon'), current_setting('rehearsal.a')::uuid, 'approved'),
       ((SELECT id FROM rh_rows WHERE what = 'open salon'), current_setting('rehearsal.b')::uuid, 'approved'),
       ((SELECT id FROM rh_rows WHERE what = 'private salon'), current_setting('rehearsal.c')::uuid, 'approved')
ON CONFLICT (lounge_id, user_id) DO UPDATE SET status = 'approved';
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'open salon'), current_setting('rehearsal.b')::uuid, 'rh the words b said') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s message', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'open salon'), current_setting('rehearsal.b')::uuid, 'rh b''s second words') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s second message', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'open salon'), NULL, 'rh a departed writer''s words') RETURNING id)
INSERT INTO rh_rows SELECT 'a departed writer''s message', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'private salon'), current_setting('rehearsal.c')::uuid, 'rh words of a private room') RETURNING id)
INSERT INTO rh_rows SELECT 'private message', id FROM r;
-- p has asked nothing yet; c asks to follow p, and c follows a, whose file is open. Dated an
-- hour ago, apart: a member's interactions are kept a second apart (check_interaction_rate_limit).
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
VALUES (current_setting('rehearsal.c')::uuid, current_setting('rehearsal.p')::uuid, 'follow_request', now() - interval '61 minutes');
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
VALUES (current_setting('rehearsal.c')::uuid, current_setting('rehearsal.a')::uuid, 'follow', now() - interval '60 minutes');

CREATE FUNCTION pg_temp.rh_as(member text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting(member), 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.rh_row(what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_rows WHERE rh_rows.what = rh_row.what $$;
CREATE FUNCTION pg_temp.rh_name(member text) RETURNS text LANGUAGE sql AS $$
  SELECT username FROM public.profiles WHERE id = current_setting(member)::uuid $$;
-- A statement tried alone: 'ok', or its SQLSTATE and words. Unless kept, what it did is undone.
CREATE FUNCTION pg_temp.rh_try(stmt text, keep boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  IF NOT keep THEN RAISE EXCEPTION USING ERRCODE = 'RH000', MESSAGE = 'undone'; END IF;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN CASE WHEN SQLSTATE = 'RH000' THEN 'ok' ELSE SQLSTATE || ': ' || SQLERRM END;
END $$;
-- A reply a sends in the open salon, kept under `label`: as the app sends it, the quote and the name it holds.
CREATE TEMP TABLE rh_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT INSERT, SELECT ON rh_got TO authenticated;
CREATE FUNCTION pg_temp.rh_reply(label text, reply_to uuid, quote text, name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE id uuid := gen_random_uuid();
BEGIN
  INSERT INTO rh_got VALUES (label, pg_temp.rh_try(format(
    'INSERT INTO public.lounge_messages (id, lounge_id, user_id, content, reply_to_id, reply_to_content, reply_to_username)
     VALUES (%L, %L, %L, ''rh a reply'', %L, %L, %L)',
    id, pg_temp.rh_row('open salon'), current_setting('rehearsal.a'), reply_to, quote, name), true));
  INSERT INTO rh_rows VALUES (label, id);
END $$;
-- A reply as it is kept: its quote, the name it shows, and its own words.
CREATE FUNCTION pg_temp.rh_quote(what text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(reply_to_content, 'no words') || '|' || coalesce(reply_to_username, 'no name') || '|' || content
    FROM public.lounge_messages WHERE id = (SELECT pg_temp.rh_row(what)) $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_as(text), pg_temp.rh_row(text), pg_temp.rh_name(text), pg_temp.rh_try(text, boolean),
  pg_temp.rh_reply(text, uuid, text, text), pg_temp.rh_quote(text) TO authenticated;
GRANT INSERT ON rh_rows TO authenticated;

-- ── 1. reactions, as a ───────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
INSERT INTO rh_got VALUES ('a reacts to b''s message, as the app sends it', pg_temp.rh_try(format(
  'INSERT INTO public.lounge_message_reactions (message_id, lounge_id, user_id, reaction) VALUES (%L, %L, %L, ''bravo'')',
  pg_temp.rh_row('b''s message'), pg_temp.rh_row('open salon'), current_setting('rehearsal.a'))));
INSERT INTO rh_got VALUES ('a reacts, naming their salon, to a private salon''s message', pg_temp.rh_try(format(
  'INSERT INTO public.lounge_message_reactions (message_id, lounge_id, user_id, reaction) VALUES (%L, %L, %L, ''bravo'')',
  pg_temp.rh_row('private message'), pg_temp.rh_row('open salon'), current_setting('rehearsal.a'))));

-- ── 2. replies, as a ─────────────────────────────────────────────────────────
SELECT pg_temp.rh_reply('as the app sends it', pg_temp.rh_row('b''s message'), 'rh the words b said', pg_temp.rh_name('rehearsal.b')) AS done \gset rh_
SELECT pg_temp.rh_reply('with words b never said', pg_temp.rh_row('b''s message'), 'rh words b never said', 'rh someone else') AS done \gset rh_
SELECT pg_temp.rh_reply('to a private salon''s message', pg_temp.rh_row('private message'), 'rh words of a private room', pg_temp.rh_name('rehearsal.c')) AS done \gset rh_
SELECT pg_temp.rh_reply('with a quote and no message', NULL, 'rh words from nowhere', 'rh nobody') AS done \gset rh_
SELECT pg_temp.rh_reply('to a departed writer', pg_temp.rh_row('a departed writer''s message'), 'rh a departed writer''s words', '[deleted]') AS done \gset rh_
SELECT pg_temp.rh_reply('to b''s second message', pg_temp.rh_row('b''s second message'), 'rh b''s second words', pg_temp.rh_name('rehearsal.b')) AS done \gset rh_
-- What each reply holds now, before b takes anything back.
INSERT INTO rh_got SELECT 'held: ' || what, pg_temp.rh_quote(what) FROM rh_rows
 WHERE what IN ('as the app sends it', 'with words b never said');

-- ── 3. b withdraws one message and deletes the other ─────────────────────────
SELECT pg_temp.rh_as('rehearsal.b') AS done \gset rh_
INSERT INTO rh_got VALUES ('b withdraws their message', pg_temp.rh_try(format(
  'SELECT public.withdraw_lounge_message(%L)', pg_temp.rh_row('b''s message')), true));
INSERT INTO rh_got VALUES ('b deletes their second message', pg_temp.rh_try(format(
  'DELETE FROM public.lounge_messages WHERE id = %L', pg_temp.rh_row('b''s second message')), true));
SELECT pg_temp.rh_as('rehearsal.a') AS done \gset rh_
SELECT pg_temp.rh_reply('to a withdrawn message', pg_temp.rh_row('b''s message'), 'rh the words b said', pg_temp.rh_name('rehearsal.b')) AS done \gset rh_

-- ── 4. a request to follow, read by each ─────────────────────────────────────
CREATE FUNCTION pg_temp.rh_requests() RETURNS text LANGUAGE sql AS $$
  SELECT count(*) FILTER (WHERE type = 'follow_request') || '|' || count(*) FILTER (WHERE type = 'follow')
    FROM public.interactions WHERE user_id = current_setting('rehearsal.c')::uuid
     AND target_user_id IN (current_setting('rehearsal.p')::uuid, current_setting('rehearsal.a')::uuid) $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_requests() TO anon, authenticated;
INSERT INTO rh_got VALUES ('read by a, a third member', pg_temp.rh_requests());
SELECT pg_temp.rh_as('rehearsal.p') AS done \gset rh_
INSERT INTO rh_got VALUES ('read by p, the member asked', pg_temp.rh_requests());
SELECT pg_temp.rh_as('rehearsal.c') AS done \gset rh_
INSERT INTO rh_got VALUES ('read by c, the member who asked', pg_temp.rh_requests());
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) AS done \gset rh_
SET LOCAL ROLE anon;
SELECT set_config('rh.visitor', pg_temp.rh_requests(), true) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO rh_got VALUES ('read by a visitor', current_setting('rh.visitor'));

-- ── 5. what c may answer: a's open log and private stack, p's log ────────────
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES (current_setting('rehearsal.a')::uuid, 990680, 'rh film', current_date) RETURNING id)
INSERT INTO rh_rows SELECT 'a''s log', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title, is_private)
           VALUES (current_setting('rehearsal.a')::uuid, 'rh private stack', true) RETURNING id)
INSERT INTO rh_rows SELECT 'a''s private stack', id FROM r;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES (current_setting('rehearsal.p')::uuid, 990680, 'rh film', current_date) RETURNING id)
INSERT INTO rh_rows SELECT 'p''s log', id FROM r;
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
           VALUES ('take', current_setting('rehearsal.b')::uuid, 'rh', 'rh take') RETURNING id)
INSERT INTO rh_rows SELECT 'b''s post', id FROM r;
-- A write, named by what came back: 'ok', 'rule' for a row rule's refusal, 'no grant' for a table closed to it.
CREATE FUNCTION pg_temp.rh_write(stmt text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE got text := pg_temp.rh_try(stmt);
BEGIN
  RETURN CASE
    WHEN got LIKE '42501: new row violates row-level security policy%' THEN 'rule'
    WHEN got LIKE '42501: permission denied for table %' THEN 'no grant'
    ELSE got END;
END $$;
-- c's answers to each piece of work, recorded under `label`.
CREATE FUNCTION pg_temp.rh_answers(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c text := current_setting('rehearsal.c');
BEGIN
  INSERT INTO rh_got VALUES
    (label || ': c comments on p''s log', pg_temp.rh_write(format(
       'INSERT INTO public.log_comments (log_id, user_id, username, body) VALUES (%L, %L, ''rh'', ''rh words'')', pg_temp.rh_row('p''s log'), c))),
    (label || ': c certifies p''s log', pg_temp.rh_write(format(
       'INSERT INTO public.interactions (user_id, target_user_id, target_log_id, type) VALUES (%L, %L, %L, ''endorse_log'')',
       c, current_setting('rehearsal.p'), pg_temp.rh_row('p''s log')))),
    (label || ': c comments on a''s log', pg_temp.rh_write(format(
       'INSERT INTO public.log_comments (log_id, user_id, username, body) VALUES (%L, %L, ''rh'', ''rh words'')', pg_temp.rh_row('a''s log'), c))),
    (label || ': c certifies a''s log', pg_temp.rh_write(format(
       'INSERT INTO public.interactions (user_id, target_user_id, target_log_id, type) VALUES (%L, %L, %L, ''endorse_log'')',
       c, current_setting('rehearsal.a'), pg_temp.rh_row('a''s log')))),
    (label || ': c comments on a''s private stack', pg_temp.rh_write(format(
       'INSERT INTO public.list_comments (list_id, user_id, content) VALUES (%L, %L, ''rh words'')', pg_temp.rh_row('a''s private stack'), c))),
    (label || ': c certifies a''s private stack', pg_temp.rh_write(format(
       'INSERT INTO public.interactions (user_id, target_user_id, target_list_id, type) VALUES (%L, %L, %L, ''endorse_list'')',
       c, current_setting('rehearsal.a'), pg_temp.rh_row('a''s private stack'))));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_write(text), pg_temp.rh_answers(text) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.c') AS done \gset rh_
SELECT pg_temp.rh_answers('c follows a, asks p') AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- p lets c in.
UPDATE public.interactions SET type = 'follow'
 WHERE user_id = current_setting('rehearsal.c')::uuid AND target_user_id = current_setting('rehearsal.p')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.c') AS done \gset rh_
SELECT pg_temp.rh_answers('p let c in') AS done \gset rh_

-- ── 6. the old Dispatch's tables, and the views of their names ───────────────
INSERT INTO rh_got VALUES ('c writes the old comments table', pg_temp.rh_write(format(
  'INSERT INTO public.dossier_comments_legacy (dossier_id, user_id, username, body) VALUES (%L, %L, ''rh'', ''rh words'')',
  pg_temp.rh_row('b''s post'), current_setting('rehearsal.c'))));
INSERT INTO rh_got VALUES ('c comments through the old name, as an older build does', pg_temp.rh_write(format(
  'INSERT INTO public.dossier_comments (dossier_id, user_id, username, body) VALUES (%L, %L, ''rh'', ''rh words'')',
  pg_temp.rh_row('b''s post'), current_setting('rehearsal.c'))));
INSERT INTO rh_got VALUES ('c certifies through the old name, as an older build does', pg_temp.rh_write(format(
  'INSERT INTO public.dossier_certifications (user_id, dossier_id) VALUES (%L, %L)',
  current_setting('rehearsal.c'), pg_temp.rh_row('b''s post'))));
INSERT INTO rh_got VALUES ('c writes the old certifications table', pg_temp.rh_write(format(
  'INSERT INTO public.dossier_certifications_legacy (user_id, dossier_id) VALUES (%L, %L)',
  current_setting('rehearsal.c'), pg_temp.rh_row('b''s post'))));
INSERT INTO rh_got VALUES ('c writes the old essays table', pg_temp.rh_write(format(
  'INSERT INTO public.dispatch_dossiers_legacy (user_id, author_username, title) VALUES (%L, ''rh'', ''rh essay'')',
  current_setting('rehearsal.c'))));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
DECLARE b text := pg_temp.rh_name('rehearsal.b');
BEGIN
  PERFORM pg_temp.rh_case('a reaction to a message of the salon a member sits in lands', 'ok',
    (SELECT got FROM rh_got WHERE what = 'a reacts to b''s message, as the app sends it'));
  PERFORM pg_temp.rh_case('a reaction naming one salon and a message of another is refused',
    '42501: A reaction belongs to its message''s salon.',
    (SELECT got FROM rh_got WHERE what = 'a reacts, naming their salon, to a private salon''s message'));
  PERFORM pg_temp.rh_case('a reply sent as the app sends it is kept as sent', 'ok|rh the words b said|' || b || '|rh a reply',
    (SELECT got FROM rh_got WHERE what = 'as the app sends it') || '|'
    || (SELECT got FROM rh_got WHERE what = 'held: as the app sends it'));
  PERFORM pg_temp.rh_case('a reply with words its message never said quotes the message''s own, and its writer',
    'ok|rh the words b said|' || b || '|rh a reply',
    (SELECT got FROM rh_got WHERE what = 'with words b never said') || '|'
    || (SELECT got FROM rh_got WHERE what = 'held: with words b never said'));
  PERFORM pg_temp.rh_case('a reply to a message of a private salon is refused', '42501: A reply answers a message of its own salon.',
    (SELECT got FROM rh_got WHERE what = 'to a private salon''s message'));
  PERFORM pg_temp.rh_case('a quote with no message replied to is dropped', 'no words|no name|rh a reply',
    pg_temp.rh_quote('with a quote and no message'));
  PERFORM pg_temp.rh_case('a reply to a departed writer names them as the house does', 'rh a departed writer''s words|[deleted]|rh a reply',
    pg_temp.rh_quote('to a departed writer'));
  PERFORM pg_temp.rh_case('b withdraws and deletes their own words', 'ok|ok',
    (SELECT got FROM rh_got WHERE what = 'b withdraws their message') || '|'
    || (SELECT got FROM rh_got WHERE what = 'b deletes their second message'));
  PERFORM pg_temp.rh_case('a withdrawn message leaves its quotes, the reply and its name kept', 'no words|' || b || '|rh a reply',
    pg_temp.rh_quote('as the app sends it'));
  PERFORM pg_temp.rh_case('and leaves the forged one''s too', 'no words|' || b || '|rh a reply',
    pg_temp.rh_quote('with words b never said'));
  PERFORM pg_temp.rh_case('a deleted message leaves its quotes', 'no words|' || b || '|rh a reply',
    pg_temp.rh_quote('to b''s second message'));
  PERFORM pg_temp.rh_case('a reply to a withdrawn message quotes no words', 'no words|' || b || '|rh a reply',
    pg_temp.rh_quote('to a withdrawn message'));
  PERFORM pg_temp.rh_case('a request to follow p is unseen by a third member; c''s follow of an open file is seen', '0|1',
    (SELECT got FROM rh_got WHERE what = 'read by a, a third member'));
  PERFORM pg_temp.rh_case('and by a visitor', '0|1', (SELECT got FROM rh_got WHERE what = 'read by a visitor'));
  PERFORM pg_temp.rh_case('the member asked sees it', '1|1',(SELECT got FROM rh_got WHERE what = 'read by p, the member asked'));
  PERFORM pg_temp.rh_case('the member who asked sees it', '1|1', (SELECT got FROM rh_got WHERE what = 'read by c, the member who asked'));
  PERFORM pg_temp.rh_case('a member answers an open file''s log, never its private stack: comment, certify, comment, certify',
    'ok|ok|rule|rule',
    (SELECT got FROM rh_got WHERE what = 'c follows a, asks p: c comments on a''s log') || '|'
    || (SELECT got FROM rh_got WHERE what = 'c follows a, asks p: c certifies a''s log') || '|'
    || (SELECT got FROM rh_got WHERE what = 'c follows a, asks p: c comments on a''s private stack') || '|'
    || (SELECT got FROM rh_got WHERE what = 'c follows a, asks p: c certifies a''s private stack'));
  PERFORM pg_temp.rh_case('nor a private member''s log while only asking to follow: comment, certify', 'rule|rule',
    (SELECT got FROM rh_got WHERE what = 'c follows a, asks p: c comments on p''s log') || '|'
    || (SELECT got FROM rh_got WHERE what = 'c follows a, asks p: c certifies p''s log'));
  PERFORM pg_temp.rh_case('once let in, a member answers a private member''s log: comment, certify', 'ok|ok',
    (SELECT got FROM rh_got WHERE what = 'p let c in: c comments on p''s log') || '|'
    || (SELECT got FROM rh_got WHERE what = 'p let c in: c certifies p''s log'));
  PERFORM pg_temp.rh_case('and still never another''s private stack: comment, certify', 'rule|rule',
    (SELECT got FROM rh_got WHERE what = 'p let c in: c comments on a''s private stack') || '|'
    || (SELECT got FROM rh_got WHERE what = 'p let c in: c certifies a''s private stack'));
  PERFORM pg_temp.rh_case('the old Dispatch''s tables take no member''s write: comments, certifications, essays',
    'no grant|no grant|no grant',
    (SELECT got FROM rh_got WHERE what = 'c writes the old comments table') || '|'
    || (SELECT got FROM rh_got WHERE what = 'c writes the old certifications table') || '|'
    || (SELECT got FROM rh_got WHERE what = 'c writes the old essays table'));
  PERFORM pg_temp.rh_case('an older build''s comment and certification through the old names land', 'ok|ok',
    (SELECT got FROM rh_got WHERE what = 'c comments through the old name, as an older build does') || '|'
    || (SELECT got FROM rh_got WHERE what = 'c certifies through the old name, as an older build does'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
