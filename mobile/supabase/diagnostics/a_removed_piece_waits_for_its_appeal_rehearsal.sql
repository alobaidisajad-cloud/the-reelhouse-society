-- ════════════════════════════════════════════════════════════════════════════
-- a_removed_piece_waits_for_its_appeal_rehearsal.sql — 20261120_32. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_removed_piece_waits_for_its_appeal_rehearsal.sql --with-train
--
-- The train applies 20261120_32 here (with_train), 20261120_00 to 20261120_31 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE hb10_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON hb10_ids TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_32_a_removed_piece_waits_for_its_appeal.sql
\endif

-- ── H-B10 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B10 rehearsal · a removed piece is withheld whole, gone to every reader but its author, and given back whole (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-B10.table, H-B10.locks
-- and H-B10 applied, with round 14's moderation pieces before them), with its rehearsal_members (n = 1..4);
-- every row is undone with the transaction. Member 4 rules; member 3 hears appeals. Member 2 keeps a log of a
-- film (rated), certified and critiqued by 1, and shared by 3 into a salon where 1, 2 and 3 sit; a stack
-- critiqued by 1; a filing; two critiques on 1's log; a critique on 1's filing. 1 follows 2. Member 1 reports
-- each piece of 2's; member 4 removes each. Then, each as themselves:
--   withheld: 1 reads none of them, nor the log's critique; 3's card of it, and of a second stack with its
--   caption and the reply quoting it, are turned gone for everyone; no one, 2 included, shares it again;
--   search, the following feed, the stacks shelf, 2's counts as 1 reads them and the
--   film's verdict leave them out; the counts of critiques on 1's log and 1's filing leave 2's critiques out,
--   and 1's notices of them are set aside; no one critiques or marks the withheld log; a second report of it
--   reads as gone; 2 reads every piece of theirs, and their verdict says it is withheld and until when;
--   2 appeals the log: it is kept until heard; 3 overturns it: everything returns as it was, the counts and
--   the card too, and 2's verdict says it was put back; the second stack likewise, caption and quote with it;
--   a second report's evidence reads the piece as withheld, never destroyed;
--   a log 2 deletes while it is withheld, then overturned: 2 is told they deleted it, and nothing was put back;
--   the hourly job, asked of a piece whose appeal came after it read the list, leaves it;
--   2 appeals a critique: 3 overturns it: 1's notice of it is written back, already pushed;
--   2 appeals the stack: 3 upholds it: the stack is deleted;
--   the filing and the other critique, unappealed past their 30 days, are deleted by the hourly job, and the
--   count of critiques is not taken twice.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'auteur', is_banned = false, suspended_until = NULL, is_social_private = false,
       preferences = coalesce(preferences, '{}'::jsonb) - 'privacy_annotations' - 'privacy_endorsements'
 WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET role = 'admin' WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (3, 4));
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n < 3) AND role = 'admin';
DELETE FROM public.reports WHERE reporter_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions WHERE user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'follow');

WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, rating)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990001101, 'rh withheld film', '2026-01-01', 'rh zephyrine words of 2', 4) RETURNING id)
INSERT INTO hb10_ids SELECT 'log', id FROM made;
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990001102, 'rh film of 1', '2026-01-01', 'rh review of 1') RETURNING id)
INSERT INTO hb10_ids SELECT 'log of 1', id FROM made;
WITH made AS (INSERT INTO public.lists (user_id, title, is_private) VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'rh zephyrine stack of 2', false) RETURNING id)
INSERT INTO hb10_ids SELECT 'stack', id FROM made;
INSERT INTO public.list_items (list_id, film_id, film_title, poster_path)
SELECT (SELECT id FROM hb10_ids WHERE what = 'stack'), 990001110 + g, 'rh film ' || g, '/rh' || g || '.jpg' FROM generate_series(1, 4) g;
WITH made AS (INSERT INTO public.lists (user_id, title, is_private) VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'rh second stack of 2', false) RETURNING id)
INSERT INTO hb10_ids SELECT 'stack 2', id FROM made;
INSERT INTO public.list_items (list_id, film_id, film_title, poster_path)
SELECT (SELECT id FROM hb10_ids WHERE what = 'stack 2'), 990001120 + g, 'rh film ' || g, '/rh2' || g || '.jpg' FROM generate_series(1, 2) g;
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990001103, 'rh film 2 deletes', '2026-01-01', 'rh words 2 deletes') RETURNING id)
INSERT INTO hb10_ids SELECT 'log 2 deletes', id FROM made;
WITH made AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, is_published)
              VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 2), 'rh', 'rh filing of 2', 'rh words of 2', true) RETURNING id)
INSERT INTO hb10_ids SELECT 'filing', id FROM made;
WITH made AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, is_published)
              VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh', 'rh filing of 1', 'rh words of 1', true) RETURNING id)
INSERT INTO hb10_ids SELECT 'filing of 1', id FROM made;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private) VALUES ('rh The Withholding Room', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
INSERT INTO hb10_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM hb10_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT (SELECT id FROM hb10_ids WHERE what = 'salon'), id, 'approved', now() - interval '1 day' FROM rehearsal_members WHERE n IN (1, 2, 3);

-- One act as a member, as themselves: what it answers, or the refusal's code and words.
CREATE FUNCTION pg_temp.hb10_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.hb10_as(bigint, text) TO authenticated;
-- A member writes a row as themselves, kept under a name.
CREATE FUNCTION pg_temp.hb10_write(p_what text, p_member bigint, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id text;
BEGIN
  v_id := pg_temp.hb10_as(p_member, p_sql);
  IF v_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: % was refused: %', p_what, v_id; END IF;
  INSERT INTO hb10_ids VALUES (p_what, v_id::uuid);
END $$;
-- What member reads of one row by its name: 'read' or 'unread'.
CREATE FUNCTION pg_temp.hb10_reads(p_member bigint, p_table text, p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE pg_temp.hb10_as(p_member, format('SELECT count(*)::text FROM public.%I WHERE id = (SELECT id FROM hb10_ids WHERE what = %L)', p_table, p_what))
           WHEN '1' THEN 'read' WHEN '0' THEN 'unread' ELSE 'refused' END;
$$;
CREATE FUNCTION pg_temp.hb10_id(p_what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM hb10_ids WHERE what = p_what $$;
CREATE FUNCTION pg_temp.hb10_m(p_n bigint) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rehearsal_members WHERE n = p_n $$;
-- Member 1 reports a piece; member 4 removes it; the verdict kept as 'V <piece>'.
CREATE FUNCTION pg_temp.hb10_remove(p_piece text, p_type text, p_reporter bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id text; v_got text;
BEGIN
  v_id := pg_temp.hb10_as(p_reporter, format('SELECT public.submit_report(%L, %L, %L, %L)::text',
    pg_temp.hb10_m(p_reporter), pg_temp.hb10_id(p_piece), p_type, 'harassment'));
  IF v_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: the report of % was refused: %', p_piece, v_id; END IF;
  INSERT INTO hb10_ids VALUES ('case ' || p_piece, v_id::uuid);
  v_got := pg_temp.hb10_as(4, format('SELECT ''done'' FROM public.resolve_moderation_report_v2(%L, ''delete_content'', %L, %L, NULL, true)',
    v_id, pg_temp.hb10_m(4), 'rh the reason for ' || p_piece));
  IF v_got <> 'done' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: the removal of % was refused: %', p_piece, v_got; END IF;
  INSERT INTO hb10_ids SELECT 'V ' || p_piece, id FROM public.mod_actions WHERE report_id = v_id::uuid;
END $$;
CREATE FUNCTION pg_temp.hb10_appeal(p_piece text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb10_as(2, format('SELECT ''done'' FROM public.file_appeal(%L, %L)', pg_temp.hb10_id('V ' || p_piece), 'rh my appeal'));
$$;
CREATE FUNCTION pg_temp.hb10_hear(p_piece text, p_outcome text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb10_as(3, format('SELECT ''done'' FROM public.judge_appeal(%L, %L, %L)', pg_temp.hb10_id('V ' || p_piece), p_outcome, 'rh heard'));
$$;

-- The conversation around 2's pieces, each written as its member writes it.
SELECT pg_temp.hb10_write('critique on log', 1, format('INSERT INTO public.log_comments (log_id, user_id, body) VALUES (%L, %L, ''rh critique of 1'') RETURNING id::text', pg_temp.hb10_id('log'), pg_temp.hb10_m(1))) AS done \gset rh_
SELECT pg_temp.hb10_write('mark on log', 1, format('INSERT INTO public.interactions (user_id, target_user_id, target_log_id, type) VALUES (%L, %L, %L, ''endorse_log'') RETURNING id::text', pg_temp.hb10_m(1), pg_temp.hb10_m(2), pg_temp.hb10_id('log'))) AS done \gset rh_
SELECT pg_temp.hb10_write('critique on stack', 1, format('INSERT INTO public.list_comments (list_id, user_id, content) VALUES (%L, %L, ''rh critique of 1 on the stack'') RETURNING id::text', pg_temp.hb10_id('stack'), pg_temp.hb10_m(1))) AS done \gset rh_
SELECT pg_temp.hb10_write('critique of 2', 2, format('INSERT INTO public.log_comments (log_id, user_id, body) VALUES (%L, %L, ''rh zephyrine critique of 2'') RETURNING id::text', pg_temp.hb10_id('log of 1'), pg_temp.hb10_m(2))) AS done \gset rh_
UPDATE public.notifications SET created_at = created_at - interval '1 minute', pushed_at = NULL WHERE user_id = (SELECT pg_temp.hb10_m(1));
UPDATE public.log_comments SET created_at = created_at - interval '1 minute' WHERE id = (SELECT pg_temp.hb10_id('critique of 2'));
SELECT pg_temp.hb10_write('second critique of 2', 2, format('INSERT INTO public.log_comments (log_id, user_id, body) VALUES (%L, %L, ''rh second critique of 2'') RETURNING id::text', pg_temp.hb10_id('log of 1'), pg_temp.hb10_m(2))) AS done \gset rh_
SELECT pg_temp.hb10_write('filing critique of 2', 2, format('INSERT INTO public.dispatch_comments (post_id, user_id, body) VALUES (%L, %L, ''rh critique of 2 on the filing'') RETURNING id::text', pg_temp.hb10_id('filing of 1'), pg_temp.hb10_m(2))) AS done \gset rh_
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata)
              VALUES (pg_temp.hb10_id('salon'), pg_temp.hb10_m(3), '', 'log_share', jsonb_build_object('log_id', pg_temp.hb10_id('log'))) RETURNING id)
INSERT INTO hb10_ids SELECT 'card', id FROM made;
-- The second stack's card as the website writes one: its caption, the stack's title, count and curator.
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata)
              VALUES (pg_temp.hb10_id('salon'), pg_temp.hb10_m(3),
                      'rh second stack of 2 · 2 films · by @' || (SELECT username FROM public.profiles WHERE id = (SELECT pg_temp.hb10_m(2))),
                      'list_share', jsonb_build_object('listId', pg_temp.hb10_id('stack 2'))) RETURNING id)
INSERT INTO hb10_ids SELECT 'stack card', id FROM made;
SELECT pg_temp.hb10_write('reply to stack card', 1, format('INSERT INTO public.lounge_messages (lounge_id, user_id, content, reply_to_id) VALUES (%L, %L, ''rh a fine stack'', %L) RETURNING id::text',
  pg_temp.hb10_id('salon'), pg_temp.hb10_m(1), pg_temp.hb10_id('stack card'))) AS done \gset rh_
CREATE TEMP TABLE hb10_cards_before ON COMMIT DROP AS
  SELECT id, content, metadata, film_title, film_poster, reply_to_content FROM public.lounge_messages
   WHERE id IN (pg_temp.hb10_id('card'), pg_temp.hb10_id('stack card'), pg_temp.hb10_id('reply to stack card'));

-- What stands before: the counts and readers as they read.
CREATE TEMP TABLE hb10_before ON COMMIT DROP AS SELECT
  (SELECT critique_count FROM public.log_counts WHERE log_id = (SELECT pg_temp.hb10_id('log of 1'))) AS critiques_of_1,
  (SELECT comment_count FROM public.dispatch_posts WHERE id = (SELECT pg_temp.hb10_id('filing of 1'))) AS filing_critiques_of_1,
  (SELECT log_count FROM public.films WHERE id = 990001101) AS film_logs,
  (pg_temp.hb10_as(1, format('SELECT public.get_profile_counts(%L)::text', pg_temp.hb10_m(2)))::jsonb ->> 'logs_count') AS logs_of_2;
SELECT pg_temp.rh_case('before: 1 reads the log, its critique and the card', 'read|read|read',
  pg_temp.hb10_reads(1, 'logs', 'log') || '|' || pg_temp.hb10_reads(1, 'log_comments', 'critique on log') || '|' || pg_temp.hb10_reads(1, 'lounge_messages', 'card'));
SELECT pg_temp.rh_case('before: 1 finds the log by its words', '1',
  pg_temp.hb10_as(1, 'SELECT count(*)::text FROM public.search_logs(''zephyrine words'')'));
SELECT pg_temp.rh_case('before: 1 is told of each of 2''s critiques of their log and filing', '3',
  pg_temp.hb10_as(1, format('SELECT count(*)::text FROM public.notifications WHERE user_id = auth.uid() AND from_user_id = %L AND type = ''comment''', pg_temp.hb10_m(2))));

-- Member 4 removes each.
SELECT pg_temp.hb10_remove('log', 'log', 1) AS done \gset rh_
SELECT pg_temp.hb10_remove('stack', 'list', 1) AS done \gset rh_
SELECT pg_temp.hb10_remove('filing', 'dispatch_post', 1) AS done \gset rh_
SELECT pg_temp.hb10_remove('critique of 2', 'log_comment', 1) AS done \gset rh_
SELECT pg_temp.hb10_remove('second critique of 2', 'log_comment', 1) AS done \gset rh_
SELECT pg_temp.hb10_remove('filing critique of 2', 'dispatch_comment', 1) AS done \gset rh_
SELECT pg_temp.hb10_remove('stack 2', 'list', 1) AS done \gset rh_
SELECT pg_temp.hb10_remove('log 2 deletes', 'log', 1) AS done \gset rh_

-- Withheld: gone to 1, whole to 2.
SELECT pg_temp.rh_case('withheld, not deleted', '1|1|1',
  (SELECT count(*)::text FROM public.logs WHERE id = (SELECT pg_temp.hb10_id('log')) AND withheld_at IS NOT NULL) || '|'
  || (SELECT count(*)::text FROM public.lists WHERE id = (SELECT pg_temp.hb10_id('stack')) AND withheld_at IS NOT NULL) || '|'
  || (SELECT count(*)::text FROM public.dispatch_posts WHERE id = (SELECT pg_temp.hb10_id('filing')) AND withheld_at IS NOT NULL AND ended_at IS NULL));
SELECT pg_temp.rh_case('1 reads none of 2''s withheld pieces', 'unread|unread|unread|unread|unread',
  pg_temp.hb10_reads(1, 'logs', 'log') || '|' || pg_temp.hb10_reads(1, 'lists', 'stack') || '|' || pg_temp.hb10_reads(1, 'dispatch_posts', 'filing')
  || '|' || pg_temp.hb10_reads(1, 'log_comments', 'critique of 2') || '|' || pg_temp.hb10_reads(1, 'dispatch_comments', 'filing critique of 2'));
SELECT pg_temp.rh_case('1 reads neither their own critique on the withheld log nor on the withheld stack', 'unread|unread',
  pg_temp.hb10_reads(1, 'log_comments', 'critique on log') || '|' || pg_temp.hb10_reads(1, 'list_comments', 'critique on stack'));
SELECT pg_temp.rh_case('the card of the withheld log is turned gone, for 1, for 3 who shared it and for 2 whose log it is', 'gone||gone||gone|',
  (SELECT string_agg(coalesce(c ->> 'how', '') || '|' || coalesce(c ->> 'film_title', ''), '|' ORDER BY n)
     FROM (SELECT n, pg_temp.hb10_as(n, format('SELECT jsonb_build_object(''how'', CASE WHEN metadata @> ''{"gone": true}'' THEN ''gone'' ELSE ''standing'' END, ''film_title'', film_title)::text FROM public.lounge_messages WHERE id = %L',
                  pg_temp.hb10_id('card')))::jsonb AS c FROM generate_series(1, 3) n) x));
SELECT pg_temp.rh_case('the second stack''s card is gone, its caption taken, and the reply''s quote of it', 'gone||none',
  (SELECT CASE WHEN metadata @> '{"gone": true, "withheld": true, "caption": true}' AND NOT metadata ? 'title' THEN 'gone' ELSE metadata::text END
          || '|' || content FROM public.lounge_messages WHERE id = (SELECT pg_temp.hb10_id('stack card'))) || '|'
  || coalesce((SELECT reply_to_content FROM public.lounge_messages WHERE id = (SELECT pg_temp.hb10_id('reply to stack card'))), 'none'));
SELECT pg_temp.rh_case('no one shares it again, 2 whose log it is included', 'refused: P0002 LOG_GONE|refused: P0002 LOG_GONE',
  pg_temp.hb10_as(2, format('INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata) VALUES (%L, %L, '''', ''log_share'', %L) RETURNING ''shared''',
    pg_temp.hb10_id('salon'), pg_temp.hb10_m(2), jsonb_build_object('log_id', pg_temp.hb10_id('log')))) || '|'
  || pg_temp.hb10_as(1, format('INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata) VALUES (%L, %L, '''', ''log_share'', %L) RETURNING ''shared''',
    pg_temp.hb10_id('salon'), pg_temp.hb10_m(1), jsonb_build_object('log_id', pg_temp.hb10_id('log')))));
SELECT pg_temp.rh_case('1 reads no mark on it, not even their own; 2 reads it', 'unread|read',
  pg_temp.hb10_reads(1, 'interactions', 'mark on log') || '|' || pg_temp.hb10_reads(2, 'interactions', 'mark on log'));
SELECT pg_temp.rh_case('2 reads every piece of theirs', 'read|read|read|read|read',
  pg_temp.hb10_reads(2, 'logs', 'log') || '|' || pg_temp.hb10_reads(2, 'lists', 'stack') || '|' || pg_temp.hb10_reads(2, 'dispatch_posts', 'filing')
  || '|' || pg_temp.hb10_reads(2, 'log_comments', 'critique of 2') || '|' || pg_temp.hb10_reads(2, 'log_comments', 'critique on log'));
SELECT pg_temp.rh_case('search finds it for no one', '0|0',
  pg_temp.hb10_as(1, 'SELECT count(*)::text FROM public.search_logs(''zephyrine words'')') || '|'
  || pg_temp.hb10_as(1, 'SELECT count(*)::text FROM public.search_stacks(''zephyrine stack'')'));
SELECT pg_temp.rh_case('the following feed and the stacks shelf leave it out', '0|0',
  pg_temp.hb10_as(1, format('SELECT count(*)::text FROM public.get_following_feed_auth_cursor(40) WHERE id = %L', pg_temp.hb10_id('log'))) || '|'
  || pg_temp.hb10_as(1, format('SELECT count(*)::text FROM public.get_filtered_stacks_auth_cursor_v2(''zephyrine'') WHERE id = %L', pg_temp.hb10_id('stack'))));
SELECT pg_temp.rh_case('2''s count of logs, as 1 reads it, leaves the two withheld out; as 2 reads it, keeps them', 'true|true',
  ((pg_temp.hb10_as(1, format('SELECT public.get_profile_counts(%L)::text', pg_temp.hb10_m(2)))::jsonb ->> 'logs_count')::int = (SELECT logs_of_2::int - 2 FROM hb10_before))::text || '|'
  || ((pg_temp.hb10_as(2, format('SELECT public.get_profile_counts(%L)::text', pg_temp.hb10_m(2)))::jsonb ->> 'logs_count')::int = (SELECT logs_of_2::int FROM hb10_before))::text);
SELECT pg_temp.rh_case('the film''s verdict leaves it out', 'true',
  ((SELECT coalesce(log_count, 0) FROM public.films WHERE id = 990001101) = (SELECT film_logs - 1 FROM hb10_before))::text);
SELECT pg_temp.rh_case('the critiques on 1''s log and 1''s filing leave 2''s out', 'true|true',
  ((SELECT critique_count FROM public.log_counts WHERE log_id = (SELECT pg_temp.hb10_id('log of 1'))) = (SELECT critiques_of_1 - 2 FROM hb10_before))::text || '|'
  || ((SELECT comment_count FROM public.dispatch_posts WHERE id = (SELECT pg_temp.hb10_id('filing of 1'))) = (SELECT filing_critiques_of_1 - 1 FROM hb10_before))::text);
SELECT pg_temp.rh_case('1''s notice of 2''s critique is set aside', '0',
  pg_temp.hb10_as(1, format('SELECT count(*)::text FROM public.notifications WHERE user_id = auth.uid() AND from_user_id = %L AND type = ''comment''', pg_temp.hb10_m(2))));
SELECT pg_temp.rh_case('no one critiques the withheld log meanwhile', 'refused',
  left(pg_temp.hb10_as(1, format('INSERT INTO public.log_comments (log_id, user_id, body) VALUES (%L, %L, ''rh more'') RETURNING ''written''', pg_temp.hb10_id('log'), pg_temp.hb10_m(1))), 7));
SELECT pg_temp.rh_case('nor marks it', 'false', pg_temp.hb10_as(1, format('SELECT public.can_endorse_content(%L, ''endorse_log'', %L, NULL)::text', pg_temp.hb10_m(1), pg_temp.hb10_id('log'))));
SELECT pg_temp.rh_case('a second report of it reads as withheld, never destroyed', 'false|true|false',
  (SELECT (e ->> 'found') || '|' || coalesce(e ->> 'withheld', 'none') || '|' || coalesce(e ->> 'appealed', 'none')
     FROM (SELECT pg_temp.hb10_as(4, format('SELECT public.get_report_evidence(public.submit_report(%L, %L, ''log'', ''spam''))::text',
             pg_temp.hb10_m(4), pg_temp.hb10_id('log')))::jsonb AS e) x));
SELECT pg_temp.rh_case('2 finds it in no public place either: search, the community feed', '0|0',
  pg_temp.hb10_as(2, 'SELECT count(*)::text FROM public.search_logs(''zephyrine words'')') || '|'
  || pg_temp.hb10_as(2, format('SELECT count(*)::text FROM public.get_community_feed_auth_cursor(40) WHERE id = %L', pg_temp.hb10_id('log'))));
SELECT pg_temp.rh_case('2 is told which of their pieces are withheld, by which verdict, until when', 'log|true|true|false',
  (SELECT e ->> 'kind' || '|' || ((e ->> 'verdict_id')::uuid = pg_temp.hb10_id('V log'))::text || '|'
          || ((e ->> 'appeal_by')::timestamptz > now() + interval '29 days')::text || '|' || (e ->> 'appealed')
     FROM jsonb_array_elements(pg_temp.hb10_as(2, 'SELECT public.get_my_withheld_pieces()::text')::jsonb) e
    WHERE (e ->> 'piece_id')::uuid = pg_temp.hb10_id('log')));
SELECT pg_temp.rh_case('2 is told of all eight; 1 of none', '8|0',
  (jsonb_array_length(pg_temp.hb10_as(2, 'SELECT public.get_my_withheld_pieces()::text')::jsonb))::text || '|'
  || (jsonb_array_length(pg_temp.hb10_as(1, 'SELECT public.get_my_withheld_pieces()::text')::jsonb))::text);
SELECT pg_temp.rh_case('2''s verdict says it is withheld, kept whole 30 days unappealed, and given back whole if overturned', 'true|true|true',
  (pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log')))::jsonb ->> 'withheld') || '|'
  || ((pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log')))::jsonb ->> 'appeal_by')::timestamptz > now() + interval '29 days')::text || '|'
  || (pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log')))::jsonb ->> 'restorable'));
SELECT pg_temp.rh_case('the notice names the window, true on any build and in any time zone', 'true',
  (pg_temp.hb10_as(2, format('SELECT message FROM public.notifications WHERE user_id = auth.uid() AND metadata ->> ''mod_action_id'' = %L', pg_temp.hb10_id('V log')))
     LIKE '%withheld a piece of your content: no one but you can see it. It is kept whole for 30 days, and until your appeal is heard if you appeal; unappealed, it is deleted then. Open this notice in the current app to %')::text);

-- The log, appealed and overturned: everything returns.
SELECT pg_temp.rh_case('2 appeals the log', 'done', pg_temp.hb10_appeal('log'));
SELECT pg_temp.rh_case('kept until it is heard', 'none',
  coalesce((SELECT delete_after::text FROM public.withheld_pieces WHERE mod_action_id = (SELECT pg_temp.hb10_id('V log'))), 'none'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb10_hear('log', 'overturned'));
SELECT pg_temp.rh_case('1 reads the log, their critique and the card again', 'read|read|read',
  pg_temp.hb10_reads(1, 'logs', 'log') || '|' || pg_temp.hb10_reads(1, 'log_comments', 'critique on log') || '|' || pg_temp.hb10_reads(1, 'lounge_messages', 'card'));
SELECT pg_temp.rh_case('its mark stands, and search, the feed, the counts (the other log still withheld) and the verdict hold it again', 'read|1|1|true|true',
  pg_temp.hb10_reads(1, 'interactions', 'mark on log') || '|'
  || pg_temp.hb10_as(1, 'SELECT count(*)::text FROM public.search_logs(''zephyrine words'')') || '|'
  || pg_temp.hb10_as(1, format('SELECT count(*)::text FROM public.get_following_feed_auth_cursor(40) WHERE id = %L', pg_temp.hb10_id('log'))) || '|'
  || ((pg_temp.hb10_as(1, format('SELECT public.get_profile_counts(%L)::text', pg_temp.hb10_m(2)))::jsonb ->> 'logs_count')::int = (SELECT logs_of_2::int - 1 FROM hb10_before))::text || '|'
  || ((SELECT log_count FROM public.films WHERE id = 990001101) = (SELECT film_logs FROM hb10_before))::text);
SELECT pg_temp.rh_case('2 is told it stands again, whole', 'true',
  (position('stands again where it was, whole' in pg_temp.hb10_as(2, format('SELECT message FROM public.notifications WHERE user_id = auth.uid() AND title = ''Your Appeal Was Heard'' AND metadata ->> ''mod_action_id'' = %L', pg_temp.hb10_id('V log')))) > 0)::text);
SELECT pg_temp.rh_case('and 2''s verdict says it was put back, after the register is gone', 'true|false',
  (pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log')))::jsonb ->> 'put_back') || '|'
  || (pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log')))::jsonb ->> 'withheld'));
SELECT pg_temp.rh_case('the card is made again from the log, as it stood before', 'true',
  ((SELECT (metadata, film_title, film_poster) FROM public.lounge_messages WHERE id = (SELECT pg_temp.hb10_id('card')))
    IS NOT DISTINCT FROM (SELECT (metadata, film_title, film_poster) FROM hb10_cards_before WHERE id = (SELECT pg_temp.hb10_id('card'))))::text);

-- The second stack, appealed and overturned: its card, caption and the reply's quote come back.
SELECT pg_temp.rh_case('2 appeals the second stack', 'done', pg_temp.hb10_appeal('stack 2'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb10_hear('stack 2', 'overturned'));
SELECT pg_temp.rh_case('its card, caption and quote stand again as they were', 'true|true',
  ((SELECT (content, metadata) FROM public.lounge_messages WHERE id = (SELECT pg_temp.hb10_id('stack card')))
    IS NOT DISTINCT FROM (SELECT (content, metadata) FROM hb10_cards_before WHERE id = (SELECT pg_temp.hb10_id('stack card'))))::text || '|'
  || ((SELECT reply_to_content FROM public.lounge_messages WHERE id = (SELECT pg_temp.hb10_id('reply to stack card')))
    IS NOT DISTINCT FROM (SELECT reply_to_content FROM hb10_cards_before WHERE id = (SELECT pg_temp.hb10_id('reply to stack card'))))::text);

-- A log 2 deletes while it is withheld: overturned, nothing comes back, and 2 is told it was their deletion.
DELETE FROM public.logs WHERE id = (SELECT pg_temp.hb10_id('log 2 deletes'));
SELECT pg_temp.rh_case('2 appeals it', 'done', pg_temp.hb10_appeal('log 2 deletes'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb10_hear('log 2 deletes', 'overturned'));
SELECT pg_temp.rh_case('2 is told they deleted it, and the verdict says nothing was put back', 'true|false',
  (position('What it removed is no longer in the house: you deleted it meanwhile.' in pg_temp.hb10_as(2, format('SELECT message FROM public.notifications WHERE user_id = auth.uid() AND title = ''Your Appeal Was Heard'' AND metadata ->> ''mod_action_id'' = %L', pg_temp.hb10_id('V log 2 deletes')))) > 0)::text || '|'
  || (pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log 2 deletes')))::jsonb ->> 'put_back'));

-- A critique, appealed and overturned: its count and its notice come back, the notice already pushed.
SELECT pg_temp.rh_case('2 appeals the critique', 'done', pg_temp.hb10_appeal('critique of 2'));
SELECT pg_temp.rh_case('3 overturns it', 'done', pg_temp.hb10_hear('critique of 2', 'overturned'));
SELECT pg_temp.rh_case('1 reads it again, and its count holds it again', 'read|true',
  pg_temp.hb10_reads(1, 'log_comments', 'critique of 2') || '|'
  || ((SELECT critique_count FROM public.log_counts WHERE log_id = (SELECT pg_temp.hb10_id('log of 1'))) = (SELECT critiques_of_1 - 1 FROM hb10_before))::text);
SELECT pg_temp.rh_case('1''s notice of it is written back, as it was, already pushed', '1|true',
  pg_temp.hb10_as(1, format('SELECT count(*)::text || ''|'' || bool_and(pushed_at IS NOT NULL)::text FROM public.notifications WHERE user_id = auth.uid() AND from_user_id = %L AND type = ''comment''', pg_temp.hb10_m(2))));

-- The stack, appealed and upheld: deleted.
SELECT pg_temp.rh_case('2 appeals the stack', 'done', pg_temp.hb10_appeal('stack'));
SELECT pg_temp.rh_case('3 upholds it', 'done', pg_temp.hb10_hear('stack', 'upheld'));
SELECT pg_temp.rh_case('the stack is deleted, its register with it', '0|0',
  (SELECT count(*)::text FROM public.lists WHERE id = (SELECT pg_temp.hb10_id('stack'))) || '|'
  || (SELECT count(*)::text FROM public.withheld_pieces WHERE mod_action_id = (SELECT pg_temp.hb10_id('V stack'))));
SELECT pg_temp.rh_case('2 is told it is deleted', 'true',
  (position('The piece it withheld is now deleted.' in pg_temp.hb10_as(2, format('SELECT message FROM public.notifications WHERE user_id = auth.uid() AND title = ''Your Appeal Was Heard'' AND metadata ->> ''mod_action_id'' = %L', pg_temp.hb10_id('V stack')))) > 0)::text);

-- The filing and the other critiques, unappealed past their 30 days: the hourly job deletes them.
-- The job read the filing's critique as due, then 2's appeal of it came before the job held it: asked
-- again under its lock, the deadline is gone, and the critique is kept for its hearing.
UPDATE public.withheld_pieces SET delete_after = now() - interval '1 minute' WHERE mod_action_id = (SELECT pg_temp.hb10_id('V filing critique of 2'));
SELECT pg_temp.rh_case('2 appeals the filing''s critique at the last moment', 'done', pg_temp.hb10_appeal('filing critique of 2'));
SELECT pg_temp.rh_case('the job, holding it after the appeal, leaves it withheld', 'false|1',
  public.delete_withheld_piece(pg_temp.hb10_id('V filing critique of 2'), true)::text || '|'
  || (SELECT count(*)::text FROM public.dispatch_comments WHERE id = (SELECT pg_temp.hb10_id('filing critique of 2')) AND withheld_at IS NOT NULL));
SELECT pg_temp.rh_case('3 upholds it', 'done', pg_temp.hb10_hear('filing critique of 2', 'upheld'));
UPDATE public.withheld_pieces SET delete_after = now() - interval '1 minute'
 WHERE mod_action_id IN (pg_temp.hb10_id('V filing'), pg_temp.hb10_id('V second critique of 2'));
SELECT pg_temp.rh_case('the hourly job deletes the two', '2', public.expire_withheld_pieces()::text);
SELECT pg_temp.rh_case('the filing is ended by the house, emptied, as REMOVE CONTENT ended one', 'house||given back',
  (SELECT ended_by || '|' || coalesce(title, '') || '|' || CASE WHEN withheld_at IS NULL THEN 'given back' ELSE 'withheld' END FROM public.dispatch_posts WHERE id = (SELECT pg_temp.hb10_id('filing'))));
SELECT pg_temp.rh_case('the critiques are deleted, and their counts not taken twice', '0|0|true|true',
  (SELECT count(*)::text FROM public.log_comments WHERE id = (SELECT pg_temp.hb10_id('second critique of 2'))) || '|'
  || (SELECT count(*)::text FROM public.dispatch_comments WHERE id = (SELECT pg_temp.hb10_id('filing critique of 2'))) || '|'
  || ((SELECT critique_count FROM public.log_counts WHERE log_id = (SELECT pg_temp.hb10_id('log of 1'))) = (SELECT critiques_of_1 - 1 FROM hb10_before))::text || '|'
  || ((SELECT comment_count FROM public.dispatch_posts WHERE id = (SELECT pg_temp.hb10_id('filing of 1'))) = (SELECT filing_critiques_of_1 - 1 FROM hb10_before))::text);
SELECT pg_temp.rh_case('nothing is left withheld', '0',
  (SELECT count(*)::text FROM public.withheld_pieces WHERE author_id = (SELECT pg_temp.hb10_m(2))));
SELECT pg_temp.rh_case('the job asks no member: no member may run it', 'false|false',
  has_function_privilege('authenticated', 'public.expire_withheld_pieces()', 'EXECUTE')::text || '|'
  || has_function_privilege('authenticated', 'public.withhold_piece(uuid, text, uuid)', 'EXECUTE')::text);

-- The house's only moderator (the owner's decision, 2026-11-19): 3 steps down for a time, and 4 alone rules
-- and alone could hear. 4's removal of 2's log is appealed: 4 is refused, the appeal waits for another
-- moderator and 2 is told so, and the log stays withheld, whole, past its 30 days, until one is appointed.
UPDATE public.profiles SET role = 'free' WHERE id = (SELECT pg_temp.hb10_m(3));
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES (pg_temp.hb10_m(2), 990001104, 'rh film of the sole moderator', '2026-01-01', 'rh words kept whole') RETURNING id)
INSERT INTO hb10_ids SELECT 'log sole', id FROM made;
SELECT pg_temp.hb10_remove('log sole', 'log', 1) AS done \gset rh_
SELECT pg_temp.rh_case('2 appeals it', 'done', pg_temp.hb10_appeal('log sole'));
SELECT pg_temp.rh_case('4, the only moderator, ruled it: refused, and the appeal waits', 'refused: 42501 OWN_VERDICT|pending',
  pg_temp.hb10_as(4, format('SELECT ''done'' FROM public.judge_appeal(%L, ''overturned'', ''rh mine'')', pg_temp.hb10_id('V log sole'))) || '|'
  || (SELECT appeal_status FROM public.mod_actions WHERE id = (SELECT pg_temp.hb10_id('V log sole'))));
SELECT pg_temp.rh_case('2 is told no moderator may hear it yet; 4''s docket says it waits for another', 'true|true',
  (pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log sole')))::jsonb ->> 'no_moderator_yet') || '|'
  || (pg_temp.hb10_as(4, 'SELECT public.get_pending_appeals(NULL, NULL, 50)::text')::jsonb
       @> jsonb_build_array(jsonb_build_object('id', pg_temp.hb10_id('V log sole'), 'refused', 'OWN_VERDICT', 'no_moderator_yet', true)))::text);
UPDATE public.withheld_pieces SET withheld_at = now() - interval '31 days' WHERE mod_action_id = (SELECT pg_temp.hb10_id('V log sole'));
SELECT pg_temp.rh_case('past its 30 days the hourly job leaves it: withheld, whole, while the appeal waits', '0|withheld|rh words kept whole|1',
  public.expire_withheld_pieces()::text || '|'
  || (SELECT CASE WHEN withheld_at IS NULL THEN 'given back' ELSE 'withheld' END || '|' || review FROM public.logs WHERE id = (SELECT pg_temp.hb10_id('log sole'))) || '|'
  || (SELECT count(*)::text FROM public.withheld_pieces WHERE mod_action_id = (SELECT pg_temp.hb10_id('V log sole'))));
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT pg_temp.hb10_m(3));
SELECT pg_temp.rh_case('a second moderator appointed: it may be heard, and 3 hears it', 'false|done',
  (pg_temp.hb10_as(2, format('SELECT public.get_my_verdict(%L)::text', pg_temp.hb10_id('V log sole')))::jsonb ->> 'no_moderator_yet') || '|'
  || pg_temp.hb10_hear('log sole', 'overturned'));

SELECT pg_temp.rh_verdict();
ROLLBACK;
