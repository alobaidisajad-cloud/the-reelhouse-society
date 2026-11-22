-- ════════════════════════════════════════════════════════════════════════════
-- a_card_is_written_by_the_house_rehearsal.sql — 20261120_10. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_card_is_written_by_the_house_rehearsal.sql
--
-- 20261120_10 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE ha4l_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ha4l_ids TO authenticated;
CREATE TEMP TABLE ha4l_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON ha4l_seen TO authenticated;

-- ── H-A4.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A4.locks rehearsal · a card in a salon says what the house holds, written by members (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-A4 and
-- H-A4.locks applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Members 1 and 2 hold the Archivist's rank for the run and sit in a salon of 1's. Member 3 has filed a
-- take, a record and a stack; member 4, a private member 1 does not follow, a record. As themselves:
--   1 shares 3's take as the phone sends it: it comes through as sent; 1 forges its card with 4 as its
--   author and any headline: the card names 3, the take's kind and words; 1 shares 3's record and stack
--   with a forged owner, film, title, count and curator: each card is the piece's; 1 shares a film the
--   house knows under a forged title with a byline: the film's title, no byline;
--   1 shares 4's private record: refused (LOG_GONE); a filing no longer in the house, or withdrawn:
--   refused (PIECE_GONE); 3 blocks 1, and 1 shares 3's take: refused (PIECE_GONE);
--   a message of a kind no app sends, or of none: refused (MESSAGE_KIND); a card naming no piece keeps
--   no words; a plain word goes through, as before; 2 reads each card as it was written.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions
 WHERE type = 'follow' AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT id FROM rehearsal_members WHERE n = 3);
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);

CREATE TEMP TABLE ha4l_who ON COMMIT DROP AS
  SELECT m.n, p.username FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id;
GRANT SELECT ON ha4l_who TO authenticated;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The Rehearsal Card Room', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO ha4l_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM ha4l_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM ha4l_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2);
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, subject_kind, subject_id, subject_title)
  VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 3), (SELECT username FROM ha4l_who WHERE n = 3),
          'rh H-A4L the sled was the whole point.', 'film', 990004411, 'rh Citizen Kane')
  RETURNING id)
INSERT INTO ha4l_ids SELECT 'take', id FROM made;
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
  VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 3), (SELECT username FROM ha4l_who WHERE n = 3), 'rh H-A4L soon withdrawn')
  RETURNING id)
INSERT INTO ha4l_ids SELECT 'withdrawn take', id FROM made;
-- Withdrawn by its author, as the house ends a filing.
SELECT public.dispatch_empty_filing((SELECT id FROM ha4l_ids WHERE what = 'withdrawn take'), 'author') AS done \gset rh_
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, poster_path)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), 990004412, 'rh H-A4L Vertigo', current_date, '/rh-l-vertigo.jpg')
              RETURNING id)
INSERT INTO ha4l_ids SELECT 'record', id FROM made;
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 4), 990004413, 'rh H-A4L a private viewing', current_date)
              RETURNING id)
INSERT INTO ha4l_ids SELECT 'private record', id FROM made;
WITH made AS (INSERT INTO public.lists (user_id, title, is_private)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), 'rh H-A4L the stack', false) RETURNING id)
INSERT INTO ha4l_ids SELECT 'stack', id FROM made;
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position, poster_path)
VALUES ((SELECT id FROM ha4l_ids WHERE what = 'stack'), 990004414, 'rh one reel', 1, '/rh-l-one.jpg');
INSERT INTO public.films (id, title) VALUES (990004415, 'rh H-A4L The Third Man') ON CONFLICT (id) DO NOTHING;
INSERT INTO ha4l_ids VALUES ('gone', gen_random_uuid());

-- One act as a member, as themselves: what it answers, or the refusal's code and words.
CREATE FUNCTION pg_temp.ha4l_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.ha4l_as(bigint, text) TO authenticated;
-- Member 1 writes a message into the salon: its type, title, film and metadata; the card as 2 reads it.
CREATE FUNCTION pg_temp.ha4l_send(p_type text, p_title text, p_film integer, p_meta jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.ha4l_as(1, format(
    'INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, film_title, film_id, metadata) VALUES (%L, %L, ''rh look'', %L, %L, %L, %L) RETURNING id::text',
    (SELECT id FROM ha4l_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 1), p_type, p_title, p_film, coalesce(p_meta, '{}'::jsonb)));
$$;
CREATE FUNCTION pg_temp.ha4l_card(p_id text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.ha4l_as(2, format('SELECT coalesce(film_title, ''(none)'') || ''|'' || coalesce(film_id::text, ''-'') || ''|'' || metadata::text FROM public.lounge_messages WHERE id = %L', p_id));
$$;
CREATE FUNCTION pg_temp.ha4l_id(p_what text) RETURNS text LANGUAGE sql AS $$ SELECT id::text FROM ha4l_ids WHERE what = p_what $$;

INSERT INTO ha4l_seen VALUES ('phone filing', pg_temp.ha4l_card(pg_temp.ha4l_send('dossier_share', 'rh H-A4L the sled was the whole point.', NULL,
  jsonb_build_object('dossier_id', pg_temp.ha4l_id('take'), 'author_username', (SELECT username FROM ha4l_who WHERE n = 3), 'kind', 'take'))));
INSERT INTO ha4l_seen VALUES ('forged filing', pg_temp.ha4l_card(pg_temp.ha4l_send('dossier_share', 'rh THE HOUSE ENDORSES THIS', NULL,
  jsonb_build_object('dossier_id', pg_temp.ha4l_id('take'), 'author_username', (SELECT username FROM ha4l_who WHERE n = 4), 'kind', 'dossier'))));
INSERT INTO ha4l_seen VALUES ('forged record', pg_temp.ha4l_card(pg_temp.ha4l_send('log_share', 'rh FORGED film', 1,
  jsonb_build_object('log_id', pg_temp.ha4l_id('record'), 'owner_username', (SELECT username FROM ha4l_who WHERE n = 4)))));
INSERT INTO ha4l_seen VALUES ('forged stack', pg_temp.ha4l_card(pg_temp.ha4l_send('list_share', 'rh FORGED', NULL,
  jsonb_build_object('listId', pg_temp.ha4l_id('stack'), 'title', 'rh FORGED', 'filmCount', 999, 'curator', (SELECT username FROM ha4l_who WHERE n = 4), 'topPosters', '[]'::jsonb))));
INSERT INTO ha4l_seen VALUES ('forged film', pg_temp.ha4l_card(pg_temp.ha4l_send('film_share', 'rh BY @someone', 990004415,
  jsonb_build_object('kind', 'dossier', 'author_username', (SELECT username FROM ha4l_who WHERE n = 4)))));
INSERT INTO ha4l_seen VALUES ('private record', pg_temp.ha4l_send('log_share', 'rh H-A4L a private viewing', 990004413,
  jsonb_build_object('log_id', pg_temp.ha4l_id('private record'), 'owner_username', (SELECT username FROM ha4l_who WHERE n = 4))));
INSERT INTO ha4l_seen VALUES ('gone filing', pg_temp.ha4l_send('dossier_share', 'rh FORGED', NULL, jsonb_build_object('dossier_id', pg_temp.ha4l_id('gone'))));
INSERT INTO ha4l_seen VALUES ('withdrawn filing', pg_temp.ha4l_send('dossier_share', 'rh FORGED', NULL, jsonb_build_object('dossier_id', pg_temp.ha4l_id('withdrawn take'))));
INSERT INTO ha4l_seen VALUES ('unknown kind', pg_temp.ha4l_send('by_@victim_share', 'rh FORGED', NULL, '{}'::jsonb));
INSERT INTO ha4l_seen VALUES ('no kind', pg_temp.ha4l_send(NULL, 'rh FORGED', NULL, '{}'::jsonb));
INSERT INTO ha4l_seen VALUES ('names nothing', pg_temp.ha4l_card(pg_temp.ha4l_send('dossier_share', 'rh FORGED', NULL,
  jsonb_build_object('author_username', (SELECT username FROM ha4l_who WHERE n = 4)))));
INSERT INTO ha4l_seen VALUES ('plain word', pg_temp.ha4l_card(pg_temp.ha4l_send('text', NULL, NULL, '{}'::jsonb)));
-- 3 blocks 1: 3's take is no longer 1's to show.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 1), 'block');
INSERT INTO ha4l_seen VALUES ('blocked filing', pg_temp.ha4l_send('dossier_share', 'rh H-A4L the sled was the whole point.', NULL,
  jsonb_build_object('dossier_id', pg_temp.ha4l_id('take'), 'author_username', (SELECT username FROM ha4l_who WHERE n = 3), 'kind', 'take')));

DO $$
DECLARE
  v_three text := (SELECT username FROM ha4l_who WHERE n = 3);
BEGIN
  PERFORM pg_temp.rh_case('the phone''s card of a filing comes through as it was sent',
    'rh H-A4L the sled was the whole point.|-|' || jsonb_build_object('kind', 'take', 'title', 'rh H-A4L the sled was the whole point.', 'dossier_id', pg_temp.ha4l_id('take'), 'author_username', v_three)::text,
    (SELECT got FROM ha4l_seen WHERE what = 'phone filing'));
  PERFORM pg_temp.rh_case('a forged card of it names its own author, kind and words',
    'rh H-A4L the sled was the whole point.|-|' || jsonb_build_object('kind', 'take', 'title', 'rh H-A4L the sled was the whole point.', 'dossier_id', pg_temp.ha4l_id('take'), 'author_username', v_three)::text,
    (SELECT got FROM ha4l_seen WHERE what = 'forged filing'));
  PERFORM pg_temp.rh_case('a forged card of a record is the record''s film and owner',
    'rh H-A4L Vertigo|990004412|' || jsonb_build_object('title', 'rh H-A4L Vertigo', 'log_id', pg_temp.ha4l_id('record'), 'poster_path', '/rh-l-vertigo.jpg', 'owner_username', v_three)::text,
    (SELECT got FROM ha4l_seen WHERE what = 'forged record'));
  PERFORM pg_temp.rh_case('a forged card of a stack is the stack''s title, count and curator',
    '(none)|-|' || jsonb_build_object('title', 'rh H-A4L the stack', 'listId', pg_temp.ha4l_id('stack'), 'curator', v_three, 'filmCount', 1,
                                      'topPosters', jsonb_build_array('/rh-l-one.jpg'))::text,
    (SELECT got FROM ha4l_seen WHERE what = 'forged stack'));
  PERFORM pg_temp.rh_case('a film''s card is the film''s title, with no byline or kind', 'rh H-A4L The Third Man|990004415|{}',
    (SELECT got FROM ha4l_seen WHERE what = 'forged film'));
  PERFORM pg_temp.rh_case('a private member''s record is not another''s to show', 'refused: P0002 LOG_GONE',
    (SELECT got FROM ha4l_seen WHERE what = 'private record'));
  PERFORM pg_temp.rh_case('a filing no longer in the house is refused', 'refused: P0002 PIECE_GONE',
    (SELECT got FROM ha4l_seen WHERE what = 'gone filing'));
  PERFORM pg_temp.rh_case('and a withdrawn one', 'refused: P0002 PIECE_GONE',
    (SELECT got FROM ha4l_seen WHERE what = 'withdrawn filing'));
  PERFORM pg_temp.rh_case('a blocked member may not show the blocker''s filing', 'refused: P0002 PIECE_GONE',
    (SELECT got FROM ha4l_seen WHERE what = 'blocked filing'));
  PERFORM pg_temp.rh_case('a message of a kind no app sends is refused', 'refused: 22023 MESSAGE_KIND',
    (SELECT got FROM ha4l_seen WHERE what = 'unknown kind'));
  PERFORM pg_temp.rh_case('and one of no kind', 'refused: 22023 MESSAGE_KIND',
    (SELECT got FROM ha4l_seen WHERE what = 'no kind'));
  PERFORM pg_temp.rh_case('a card that names no piece keeps no words', '(none)|-|{}',
    (SELECT got FROM ha4l_seen WHERE what = 'names nothing'));
  PERFORM pg_temp.rh_case('a plain word goes through, as before', '(none)|-|{}',
    (SELECT got FROM ha4l_seen WHERE what = 'plain word'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
