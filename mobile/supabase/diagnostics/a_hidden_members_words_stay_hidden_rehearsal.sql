-- ════════════════════════════════════════════════════════════════════════════
-- a_hidden_members_words_stay_hidden_rehearsal.sql — 20261120_20. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_hidden_members_words_stay_hidden_rehearsal.sql --with-train
--
-- The train applies 20261120_20 here (with_train), 20261120_00 to 20261120_19 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE hb3_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON hb3_ids TO authenticated;
GRANT INSERT ON hb3_ids TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_20_a_hidden_members_words_stay_hidden.sql
\endif

-- ── H-B3 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B3 rehearsal · a hidden member's words never reach a reader through another's reply or card (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-B3.column and
-- H-B3 applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member 3 keeps an open salon where 1, 2, 3 and 4 sit. Member 2 says a word there and keeps a log, a
-- stack and an essay; member 3, as themselves, answers 2's word, shares 2's log, stack and essay, answers
-- a word with a forged list of whom it carries, and says a plain word. Then:
--   the house names member 2 on each reply and card, whatever 3 sent, and no one on the plain word;
--   member 1 blocks 2: 1 reads 3's plain word alone, and the salon's unread count and last word say so;
--   member 4, who hid no one, reads every one; 3, who mutes 2, still reads their own;
--   2 blocks 4: 4 no longer reads 3's messages carrying 2's words either;
--   a reply laid unnamed, as one written before the house named them, is named by the piece's one pass.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members);

WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The Rehearsal Answering Room', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
INSERT INTO hb3_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM hb3_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT (SELECT id FROM hb3_ids WHERE what = 'salon'), id, 'approved', now() - interval '1 day' FROM rehearsal_members;
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990000401, 'rh film of 2', '2026-01-01', 'rh review of 2') RETURNING id)
INSERT INTO hb3_ids SELECT 'log', id FROM made;
WITH made AS (INSERT INTO public.lists (user_id, title, is_private)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'rh stack of 2', false) RETURNING id)
INSERT INTO hb3_ids SELECT 'stack', id FROM made;
WITH made AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body)
              VALUES ('dossier', (SELECT id FROM rehearsal_members WHERE n = 2), 'rh', 'rh essay of 2', 'rh words of 2') RETURNING id)
INSERT INTO hb3_ids SELECT 'essay', id FROM made;

-- One act as a member, as themselves: what it answers, or the refusal's code and words.
CREATE FUNCTION pg_temp.hb3_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
  RETURN coalesce(nullif(v_got, ''), 'done');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb3_as(bigint, text) TO authenticated;
-- A message sent into the salon as a member sends it, kept under a name for the cases below.
CREATE FUNCTION pg_temp.hb3_send(p_what text, p_member bigint, p_columns text, p_values text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_id text;
BEGIN
  v_id := pg_temp.hb3_as(p_member, format('INSERT INTO public.lounge_messages (lounge_id, user_id, %s) VALUES (%L, %L, %s) RETURNING id::text',
    p_columns, (SELECT id FROM hb3_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = p_member), p_values));
  IF v_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: % was refused: %', p_what, v_id; END IF;
  INSERT INTO hb3_ids VALUES (p_what, v_id::uuid);
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb3_send(text, bigint, text, text) TO authenticated;

SELECT pg_temp.hb3_send('word of 2', 2, 'content', quote_literal('rh the word of 2')) AS done \gset rh_
SELECT pg_temp.hb3_send('reply', 3, 'content, reply_to_id',
  format('%L, %L', 'rh the answer of 3', (SELECT id FROM hb3_ids WHERE what = 'word of 2'))) AS done \gset rh_
SELECT pg_temp.hb3_send('log card', 3, 'content, type, metadata',
  format('%L, %L, %L', '', 'log_share', jsonb_build_object('log_id', (SELECT id FROM hb3_ids WHERE what = 'log'), 'owner_username', 'rh'))) AS done \gset rh_
SELECT pg_temp.hb3_send('stack card', 3, 'content, type, metadata',
  format('%L, %L, %L', '', 'list_share', jsonb_build_object('listId', (SELECT id FROM hb3_ids WHERE what = 'stack'), 'title', 'rh stack of 2', 'curator', 'rh'))) AS done \gset rh_
SELECT pg_temp.hb3_send('essay card', 3, 'content, type, metadata',
  format('%L, %L, %L', '', 'dossier_share', jsonb_build_object('dossier_id', (SELECT id FROM hb3_ids WHERE what = 'essay'), 'author_username', 'rh'))) AS done \gset rh_
SELECT pg_temp.hb3_send('forged', 3, 'content, reply_to_id, carries_words_of',
  format('%L, %L, %L', 'rh a forged answer of 3', (SELECT id FROM hb3_ids WHERE what = 'word of 2'), '{}')) AS done \gset rh_
SELECT pg_temp.hb3_send('plain', 3, 'content', quote_literal('rh the plain word of 3')) AS done \gset rh_
-- Each said in its own moment, the plain word first among 3's: the last word is told apart.
UPDATE public.lounge_messages m SET created_at = now() - (x.ago || ' minutes')::interval
  FROM (VALUES ('word of 2', 9), ('plain', 8), ('reply', 7), ('log card', 6), ('stack card', 5), ('essay card', 4), ('forged', 3)) x(what, ago)
 WHERE m.id = (SELECT id FROM hb3_ids WHERE what = x.what);

-- What a member reads of 3's messages, by name, in the order they were said.
CREATE FUNCTION pg_temp.hb3_reads(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb3_as(p_member, format(
    'SELECT coalesce(string_agg(i.what, '','' ORDER BY m.created_at), ''nothing'') FROM public.lounge_messages m JOIN hb3_ids i ON i.id = m.id WHERE m.lounge_id = %L AND m.user_id = %L',
    (SELECT id FROM hb3_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 3)));
$$;
-- The salon's unread count and last word, as a member is told them.
CREATE FUNCTION pg_temp.hb3_told(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb3_as(p_member, format(
    'SELECT u.unread_count || '' unread, last word '' || coalesce((SELECT i.what FROM hb3_ids i JOIN public.lounge_messages m ON m.id = i.id WHERE m.created_at = u.last_message_at AND m.lounge_id = u.lounge_id LIMIT 1), ''none'') || '', directory '' || coalesce((SELECT i.what FROM public.get_salon_last_words(ARRAY[%L]::uuid[]) w JOIN public.lounge_messages m ON m.lounge_id = w.lounge_id AND m.created_at = w.last_message_at JOIN hb3_ids i ON i.id = m.id LIMIT 1), ''none'') FROM public.get_lounge_unread_counts() u WHERE u.lounge_id = %L',
    (SELECT id FROM hb3_ids WHERE what = 'salon'), (SELECT id FROM hb3_ids WHERE what = 'salon')));
$$;

DO $$ BEGIN
  PERFORM pg_temp.rh_case('the house names 2 on 3''s answer to 2', (SELECT id FROM rehearsal_members WHERE n = 2)::text,
    (SELECT array_to_string(carries_words_of, ',') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'reply')));
  PERFORM pg_temp.rh_case('the house names 2 on 3''s card of 2''s log', (SELECT id FROM rehearsal_members WHERE n = 2)::text,
    (SELECT array_to_string(carries_words_of, ',') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'log card')));
  PERFORM pg_temp.rh_case('the house names 2 on 3''s card of 2''s stack', (SELECT id FROM rehearsal_members WHERE n = 2)::text,
    (SELECT array_to_string(carries_words_of, ',') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'stack card')));
  PERFORM pg_temp.rh_case('the house names 2 on 3''s card of 2''s essay', (SELECT id FROM rehearsal_members WHERE n = 2)::text,
    (SELECT array_to_string(carries_words_of, ',') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'essay card')));
  PERFORM pg_temp.rh_case('an answer sent naming no one is named by the house', (SELECT id FROM rehearsal_members WHERE n = 2)::text,
    (SELECT array_to_string(carries_words_of, ',') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'forged')));
  PERFORM pg_temp.rh_case('a plain word names no one', 'none',
    (SELECT coalesce(array_to_string(carries_words_of, ','), 'none') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'plain')));
  PERFORM pg_temp.rh_case('the answer still quotes 2''s word, as before', 'rh the word of 2',
    (SELECT reply_to_content FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'reply')));
  PERFORM pg_temp.rh_case('before any block, 1 reads every message of 3''s', 'plain,reply,log card,stack card,essay card,forged',
    pg_temp.hb3_reads(1));
END $$;

-- 1 blocks 2, and 3 mutes 2.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'block'),
       ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 2), 'mute');

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a member who blocked 2 reads 3''s plain word alone', 'plain', pg_temp.hb3_reads(1));
  PERFORM pg_temp.rh_case('and is told one unread, the plain word the last, in the salon and the directory alike',
    '1 unread, last word plain, directory plain', pg_temp.hb3_told(1));
  PERFORM pg_temp.rh_case('a member who hid no one reads every one', 'plain,reply,log card,stack card,essay card,forged',
    pg_temp.hb3_reads(4));
  PERFORM pg_temp.rh_case('and is told every one, the last the last', '7 unread, last word forged, directory forged',
    pg_temp.hb3_told(4));
  PERFORM pg_temp.rh_case('3, who muted 2, still reads their own', 'plain,reply,log card,stack card,essay card,forged',
    pg_temp.hb3_reads(3));
END $$;

-- 2 blocks 4: a member blocked by 2 no longer reads 2's words in 3's messages.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 4), 'block');

-- A reply written before the house named them: laid unnamed, then named by the piece's one pass.
UPDATE public.lounge_messages SET carries_words_of = NULL WHERE id = (SELECT id FROM hb3_ids WHERE what = 'reply');
UPDATE public.lounge_messages m
   SET carries_words_of = public.whose_words_a_message_carries(m.user_id, m.type, m.metadata, m.reply_to_id)
 WHERE m.carries_words_of IS NULL
   AND (m.reply_to_id IS NOT NULL OR m.type IN ('log_share', 'list_share', 'dossier_share'))
   AND public.whose_words_a_message_carries(m.user_id, m.type, m.metadata, m.reply_to_id) IS NOT NULL
   AND m.lounge_id = (SELECT id FROM hb3_ids WHERE what = 'salon');

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a member 2 blocked reads 3''s plain word alone', 'plain', pg_temp.hb3_reads(4));
  PERFORM pg_temp.rh_case('a reply written before is named by the one pass', (SELECT id FROM rehearsal_members WHERE n = 2)::text,
    (SELECT array_to_string(carries_words_of, ',') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3_ids WHERE what = 'reply')));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
