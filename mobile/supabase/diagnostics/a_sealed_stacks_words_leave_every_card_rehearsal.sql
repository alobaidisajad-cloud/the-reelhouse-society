-- ════════════════════════════════════════════════════════════════════════════
-- a_sealed_stacks_words_leave_every_card_rehearsal.sql — 20261119_23. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_sealed_stacks_words_leave_every_card_rehearsal.sql --with-train
--
-- The train applies 20261119_23 here (with_train), 20261119_00 to 20261119_22 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 13).
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

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE b7_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON b7_ids TO authenticated;
CREATE TEMP TABLE b7_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON b7_seen TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_23 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── B7 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B7 rehearsal · a sealed stack's words leave every card, the website's caption with them (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B3, B3.locks and
-- B7 applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Over the whole house first: no card of a sealed stack still carries a caption the website wrote
-- (the one-time turn reached every one). Then members 1 and 2 hold the Archivist's rank for the run and
-- sit in a salon of 1's. 1 keeps an open stack of two reels and shares it as the website does (its
-- caption, "<title> · 2 films · by @<curator>", is the message's words); 2 shares it as the phone does,
-- with a word of their own; 2 answers the website's card, quoting it. Then:
--   1 seals it: the website's card loses its caption, the quote of it goes, and the phone's card keeps
--   its sharer's own word; neither keeps a word of the stack;
--   1 renames it and opens it again: the website's caption is written back from the stack as it stands
--   (its new title), the quote with it; the phone's card keeps its word and gains no caption.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('no card of a sealed stack still carries the website''s caption of it', '0',
    (SELECT count(*)::text
       FROM public.lists l
       JOIN public.lounge_messages m
         ON m.type = 'list_share' AND m.metadata <> '{}'::jsonb
        AND m.metadata @> jsonb_build_object('listId', l.id::text)
      WHERE l.is_private
        AND m.content <> ''
        AND (m.content = l.title OR left(m.content, char_length(l.title) + 3) = l.title || ' · '
             OR m.content ~ ' · [0-9]+ films · by @[^ ]+$')));
END $$;

DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));

WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The Rehearsal Projection Room', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO b7_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM b7_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM b7_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2);
WITH made AS (INSERT INTO public.lists (user_id, title, is_private)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh the captioned stack', false) RETURNING id)
INSERT INTO b7_ids SELECT 'stack', id FROM made;
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position, poster_path)
VALUES ((SELECT id FROM b7_ids WHERE what = 'stack'), 990000701, 'rh first reel', 1, '/rh-b7-first.jpg'),
       ((SELECT id FROM b7_ids WHERE what = 'stack'), 990000702, 'rh second reel', 2, '/rh-b7-second.jpg');

-- One act as a member, as themselves: what it answers, or the refusal's code.
CREATE FUNCTION pg_temp.b7_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.b7_as(bigint, text) TO authenticated;
CREATE FUNCTION pg_temp.b7_handle(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;
-- A card, as the website or the phone sends one, from a member into the salon, with these words.
CREATE FUNCTION pg_temp.b7_share(p_member bigint, p_words text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b7_as(p_member, format(
    'INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata) VALUES (%L, %L, %L, ''list_share'', %L) RETURNING id::text',
    (SELECT id FROM b7_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = p_member), p_words,
    jsonb_build_object('listId', (SELECT id FROM b7_ids WHERE what = 'stack')::text, 'title', 'rh the captioned stack', 'filmCount', 2,
                       'curator', pg_temp.b7_handle(1), 'topPosters', jsonb_build_array('/rh-b7-first.jpg', '/rh-b7-second.jpg'))));
$$;
-- What member 2 reads of a message: its words, and whether its metadata says it had a caption.
CREATE FUNCTION pg_temp.b7_read(p_id text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b7_as(2, format('SELECT content || ''|'' || coalesce(metadata ->> ''title'', ''-'') || ''|'' || (metadata ? ''caption'')::text FROM public.lounge_messages WHERE id = %L', p_id));
$$;
CREATE FUNCTION pg_temp.b7_quote(p_id text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b7_as(2, format('SELECT coalesce(reply_to_content, ''(none)'') FROM public.lounge_messages WHERE id = %L', p_id));
$$;

INSERT INTO b7_seen VALUES ('the website''s card', pg_temp.b7_share(1, 'rh the captioned stack · 2 films · by @' || pg_temp.b7_handle(1)));
INSERT INTO b7_seen VALUES ('the phone''s card', pg_temp.b7_share(2, 'rh worth a night'));
INSERT INTO b7_seen VALUES ('the answer', pg_temp.b7_as(2, format(
  'INSERT INTO public.lounge_messages (lounge_id, user_id, content, reply_to_id) VALUES (%L, %L, ''rh agreed'', %L) RETURNING id::text',
  (SELECT id FROM b7_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 2), (SELECT got FROM b7_seen WHERE what = 'the website''s card'))));
INSERT INTO b7_seen VALUES ('the quote while open', pg_temp.b7_quote((SELECT got FROM b7_seen WHERE what = 'the answer')));

INSERT INTO b7_seen VALUES ('sealed', pg_temp.b7_as(1, format('UPDATE public.lists SET is_private = true WHERE id = %L RETURNING is_private::text', (SELECT id FROM b7_ids WHERE what = 'stack'))));
INSERT INTO b7_seen VALUES ('the website''s card sealed', pg_temp.b7_read((SELECT got FROM b7_seen WHERE what = 'the website''s card')));
INSERT INTO b7_seen VALUES ('the phone''s card sealed', pg_temp.b7_read((SELECT got FROM b7_seen WHERE what = 'the phone''s card')));
INSERT INTO b7_seen VALUES ('the quote sealed', pg_temp.b7_quote((SELECT got FROM b7_seen WHERE what = 'the answer')));

INSERT INTO b7_seen VALUES ('renamed', pg_temp.b7_as(1, format('UPDATE public.lists SET title = ''rh the stack renamed'' WHERE id = %L RETURNING title', (SELECT id FROM b7_ids WHERE what = 'stack'))));
INSERT INTO b7_seen VALUES ('opened', pg_temp.b7_as(1, format('UPDATE public.lists SET is_private = false WHERE id = %L RETURNING is_private::text', (SELECT id FROM b7_ids WHERE what = 'stack'))));
INSERT INTO b7_seen VALUES ('the website''s card opened', pg_temp.b7_read((SELECT got FROM b7_seen WHERE what = 'the website''s card')));
INSERT INTO b7_seen VALUES ('the phone''s card opened', pg_temp.b7_read((SELECT got FROM b7_seen WHERE what = 'the phone''s card')));
INSERT INTO b7_seen VALUES ('the quote opened', pg_temp.b7_quote((SELECT got FROM b7_seen WHERE what = 'the answer')));

DO $$
DECLARE v_by text := '@' || pg_temp.b7_handle(1);
BEGIN
  PERFORM pg_temp.rh_case('the website''s card is shared with its caption, and answered quoting it', 'rh the captioned stack · 2 films · by ' || v_by,
    (SELECT got FROM b7_seen WHERE what = 'the quote while open'));
  PERFORM pg_temp.rh_case('the curator seals the stack', 'true', (SELECT got FROM b7_seen WHERE what = 'sealed'));
  PERFORM pg_temp.rh_case('sealed, the website''s card keeps no word of it, and remembers it had a caption', '|-|true',
    (SELECT got FROM b7_seen WHERE what = 'the website''s card sealed'));
  PERFORM pg_temp.rh_case('the quote of the caption goes with it', '(none)', (SELECT got FROM b7_seen WHERE what = 'the quote sealed'));
  PERFORM pg_temp.rh_case('the phone''s card keeps its sharer''s own word and no word of the stack', 'rh worth a night|-|false',
    (SELECT got FROM b7_seen WHERE what = 'the phone''s card sealed'));
  PERFORM pg_temp.rh_case('the curator renames it and opens it again', 'false', (SELECT got FROM b7_seen WHERE what = 'opened'));
  PERFORM pg_temp.rh_case('opened, the website''s caption is written back from the stack as it stands',
    'rh the stack renamed · 2 films · by ' || v_by || '|rh the stack renamed|false', (SELECT got FROM b7_seen WHERE what = 'the website''s card opened'));
  PERFORM pg_temp.rh_case('and the quote of it with it', 'rh the stack renamed · 2 films · by ' || v_by, (SELECT got FROM b7_seen WHERE what = 'the quote opened'));
  PERFORM pg_temp.rh_case('the phone''s card keeps its word and gains no caption', 'rh worth a night|rh the stack renamed|false',
    (SELECT got FROM b7_seen WHERE what = 'the phone''s card opened'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
