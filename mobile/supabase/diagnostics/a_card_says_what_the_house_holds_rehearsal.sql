-- ════════════════════════════════════════════════════════════════════════════
-- a_card_says_what_the_house_holds_rehearsal.sql — 20261120_09. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_card_says_what_the_house_holds_rehearsal.sql
--
-- 20261120_09 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE ha4_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ha4_ids TO authenticated;

-- ── H-A4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A4 rehearsal · a card says what the house holds: the rule (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). The trigger is H-A4.locks', a car
-- after this one, and the cards already standing are H-A4.pass'; here the rule itself:
--   a card's title is cut where the phone's cardTitle cuts it (the same pairs are run through cardTitle
--   by aCardIsCutAsThePhoneCutsIt.test.ts, which reads them from these lines);
--   asked as the house of forged cards (as the pass asks it): a filing's card naming another author under
--   any headline, or a cut its sharer chose, is written with the filing's author, kind and line, cut as
--   the phone cuts it; a record's card with the record's film, poster and owner; a stack's with the
--   stack's title, count and curator; a film's card loses a byline and a kind and carries the film as the
--   house holds it (title, poster, year, for the website too); a card of a piece no longer in the house
--   is marked gone; a card that names no piece keeps no words;
--   a filing marked SPOILERS has its card's line and its website title veiled together, and withdrawn,
--   both go; no member or visitor may run the rule's functions through the API.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE ha4_who ON COMMIT DROP AS
  SELECT m.n, p.username FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id;
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, subject_kind, subject_id, subject_title)
  VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 3), (SELECT username FROM ha4_who WHERE n = 3),
          'Nolan''s best film? Not even close. The third act collapses under its own weight and the score drowns every line that might have saved it, and the ending is a coin toss pretending to be a revelation it never earned.',
          'film', 990004401, 'rh Tenet')
  RETURNING id)
INSERT INTO ha4_ids SELECT 'take', id FROM made;
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, poster_path)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), 990004402, 'rh H-A4 Vertigo', current_date, '/rh-vertigo.jpg')
              RETURNING id)
INSERT INTO ha4_ids SELECT 'record', id FROM made;
WITH made AS (INSERT INTO public.lists (user_id, title, is_private)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), 'rh H-A4 the stack', false) RETURNING id)
INSERT INTO ha4_ids SELECT 'stack', id FROM made;
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position, poster_path)
VALUES ((SELECT id FROM ha4_ids WHERE what = 'stack'), 990004403, 'rh first reel', 1, '/rh-a4-first.jpg'),
       ((SELECT id FROM ha4_ids WHERE what = 'stack'), 990004404, 'rh second reel', 2, '/rh-a4-second.jpg');
INSERT INTO public.films (id, title, year, poster_path) VALUES (990004405, 'rh H-A4 The Third Man', 1949, '/rh-third-man.jpg')
ON CONFLICT (id) DO NOTHING;

-- A card as the pass reads it, made true by the rule: its title, film, poster and metadata.
CREATE FUNCTION pg_temp.ha4_made(p_type text, p_title text, p_meta jsonb, p_film integer DEFAULT NULL, p_poster text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('title', c.film_title, 'film', c.film_id, 'poster', c.film_poster, 'meta', c.metadata)
    FROM private.a_shared_card(jsonb_populate_record(NULL::public.lounge_messages, jsonb_build_object(
           'id', gen_random_uuid(), 'type', p_type, 'film_title', p_title, 'film_id', p_film, 'film_poster', p_poster,
           'metadata', p_meta)), false) c
$$;
-- A line, cut by the house, beside the phone's cut of it.
CREATE FUNCTION pg_temp.ha4_cut(p_line text, p_phone text) RETURNS void LANGUAGE sql AS $$
  SELECT pg_temp.rh_case('a card''s title is cut where the phone cuts it: ' || left(p_line, 40), p_phone, private.a_card_cut(p_line))
$$;

-- The phone's cuts (cardTitle), one line each.
SELECT pg_temp.ha4_cut('  Rosebud is the sled.  ', 'Rosebud is the sled.') AS done \gset rh_
SELECT pg_temp.ha4_cut('The sled was the whole point, and Welles knew it from the first frame. Then the snow globe falls, and the whole picture turns on a word no one in the room ever hears again, which is the joke and the wound at once. After that, nothing.', 'The sled was the whole point, and Welles knew it from the first frame.…') AS done \gset rh_
SELECT pg_temp.ha4_cut('I met Mr. Ozu once at a screening in Kamakura where the light came through the paper screens like milk and everyone was very quiet and nobody said a word about the film until the tea had gone cold and the cups were empty and the night outside had fallen', 'I met Mr. Ozu once at a screening in Kamakura where the light came through the paper screens like milk and everyone was very quiet and nobody said a word about the film until…') AS done \gset rh_
SELECT pg_temp.ha4_cut('Nolan''s best film? not even close, because the third act collapses under its own weight and the score drowns every line that might have saved it, and the ending is a coin toss pretending to be a revelation that it never earned at all or', 'Nolan''s best film? not even close, because the third act collapses under its own weight and the score drowns every line that might have saved it, and the ending is a coin toss…') AS done \gset rh_
SELECT pg_temp.ha4_cut('She said "It is finished." Then she left the room, and the camera stayed on the empty doorway for a full minute while the rain went on and on outside the window and the clock on the mantel kept time for nobody at all, which is the film.', 'She said "It is finished."…') AS done \gset rh_
SELECT pg_temp.ha4_cut('This is No. 17 in the series and it is the one where everything changes for the family because the father finally comes home from the war and nobody recognises him at the station, not even his own daughter who waited every single day for him', 'This is No. 17 in the series and it is the one where everything changes for the family because the father finally comes home from the war and nobody recognises him at the station…') AS done \gset rh_
SELECT pg_temp.ha4_cut('🎬🎬🎬 The opening shot holds for three minutes on a face 🎞️ and you feel every second of it 👍🏽 because nothing moves except the eyes, and then the eyes stop moving too and the whole theatre leans in at once to hear what comes next and it is silence', '🎬🎬🎬 The opening shot holds for three minutes on a face 🎞️ and you feel every second of it 👍🏽 because nothing moves except the eyes, and then the eyes stop moving too…') AS done \gset rh_
SELECT pg_temp.ha4_cut('Ça commence à Paris, où la pluie tombe sur les pavés et où personne ne sait encore que le café d''en face va brûler avant l''aube; c''est là que tout se décide, entre deux cigarettes et une lettre jamais envoyée à celle qui attendait', 'Ça commence à Paris, où la pluie tombe sur les pavés et où personne ne sait encore que le café d''en face va brûler avant l''aube; c''est là que tout se décide, entre deux cigarettes…') AS done \gset rh_
SELECT pg_temp.ha4_cut('Supercalifragilisticexpialidocious_and_then_some_more_letters_without_any_space_at_all_because_some_people_write_headlines_like_that_on_purpose_to_see_what_happens_when_the_card_runs_out_of_room_entirely_ok', 'Supercalifragilisticexpialidocious_and_then_some_more_letters_without_any_space_at_all_because_some_people_write_headlines_like_that_on_purpose_to_see_what_happens_when_the_card_ru…') AS done \gset rh_
SELECT pg_temp.ha4_cut('A film about grief. A film about what grief leaves behind when the house is sold and the furniture is gone and only the marks on the wallpaper show where the pictures hung for forty years. A film about that.', 'A film about grief.…') AS done \gset rh_
SELECT pg_temp.ha4_cut('The U.S. version cuts eleven minutes from the middle and the film never recovers from it, because those eleven minutes were the only place the two brothers ever speak to each other as brothers rather than as rivals in a business', 'The U.S. version cuts eleven minutes from the middle and the film never recovers from it, because those eleven minutes were the only place the two brothers ever speak to each…') AS done \gset rh_
SELECT pg_temp.ha4_cut('Short and sweet.', 'Short and sweet.') AS done \gset rh_

-- Forged cards, made true by the rule as the pass asks it.
SELECT pg_temp.rh_case('a filing''s card naming another author under any headline: the filing''s author, kind and line, cut as the phone cuts it',
  jsonb_build_object('title', 'Nolan''s best film? Not even close.…', 'film', NULL, 'poster', NULL,
    'meta', jsonb_build_object('dossier_id', (SELECT id FROM ha4_ids WHERE what = 'take')::text, 'title', 'Nolan''s best film? Not even close.…',
      'author_username', (SELECT username FROM ha4_who WHERE n = 3), 'kind', 'take'))::text,
  pg_temp.ha4_made('dossier_share', 'rh FORGED: the house endorses this',
    jsonb_build_object('dossier_id', (SELECT id FROM ha4_ids WHERE what = 'take')::text, 'author_username', (SELECT username FROM ha4_who WHERE n = 4), 'kind', 'dossier'))::text) AS done \gset rh_
SELECT pg_temp.rh_case('a cut its sharer chose is never kept: the house cuts the line', 'Nolan''s best film? Not even close.…',
  pg_temp.ha4_made('dossier_share', 'Nolan''s best film…',
    jsonb_build_object('dossier_id', (SELECT id FROM ha4_ids WHERE what = 'take')::text)) ->> 'title') AS done \gset rh_
SELECT pg_temp.rh_case('a record''s card naming another owner and film: the record''s film, poster and owner',
  jsonb_build_object('title', 'rh H-A4 Vertigo', 'film', 990004402, 'poster', '/rh-vertigo.jpg',
    'meta', jsonb_build_object('log_id', (SELECT id FROM ha4_ids WHERE what = 'record')::text, 'title', 'rh H-A4 Vertigo',
      'poster_path', '/rh-vertigo.jpg', 'owner_username', (SELECT username FROM ha4_who WHERE n = 3)))::text,
  pg_temp.ha4_made('log_share', 'rh FORGED film', jsonb_build_object('log_id', (SELECT id FROM ha4_ids WHERE what = 'record')::text,
    'owner_username', (SELECT username FROM ha4_who WHERE n = 4), 'poster_path', '/rh-forged.jpg'), 1, '/rh-forged.jpg')::text) AS done \gset rh_
SELECT pg_temp.rh_case('a stack''s card with a forged title, count and curator: the stack''s',
  jsonb_build_object('listId', (SELECT id FROM ha4_ids WHERE what = 'stack')::text, 'title', 'rh H-A4 the stack', 'filmCount', 2,
    'curator', (SELECT username FROM ha4_who WHERE n = 3), 'topPosters', jsonb_build_array('/rh-a4-first.jpg', '/rh-a4-second.jpg'))::text,
  (pg_temp.ha4_made('list_share', NULL, jsonb_build_object('listId', (SELECT id FROM ha4_ids WHERE what = 'stack')::text, 'title', 'rh FORGED',
    'filmCount', 999, 'curator', (SELECT username FROM ha4_who WHERE n = 4))) -> 'meta')::text) AS done \gset rh_
SELECT pg_temp.rh_case('a film''s card: no byline or kind, the film''s title, poster and year as the house holds them, for the website too',
  'rh H-A4 The Third Man|/rh-third-man.jpg|' || jsonb_build_object('title', 'rh H-A4 The Third Man', 'filmId', 990004405, 'subtitle', '1949', 'poster_path', '/rh-third-man.jpg')::text,
  (SELECT (c ->> 'title') || '|' || (c ->> 'poster') || '|' || (c -> 'meta')::text
     FROM (SELECT pg_temp.ha4_made('film_share', 'rh BY @someone',
       jsonb_build_object('filmId', 990004405, 'title', 'rh BY @someone', 'kind', 'dossier', 'author_username', 'rh_victim', 'subtitle', 'by @rh_victim',
                          'poster_path', '/rh-forged.jpg'), 990004405, '/rh-forged.jpg') c) x)) AS done \gset rh_
SELECT pg_temp.rh_case('a film the house does not hold keeps its title, and no picture or subtitle its sharer wrote', 'rh A Film Not Yet Synced|{}',
  (SELECT (c ->> 'title') || '|' || (c -> 'meta')::text
     FROM (SELECT pg_temp.ha4_made('film_share', 'rh A Film Not Yet Synced', jsonb_build_object('subtitle', 'by @rh_victim', 'poster_path', '/rh-forged.jpg'), 990004499) c) x)) AS done \gset rh_
SELECT pg_temp.rh_case('a card of a filing no longer in the house is marked gone, with neither line nor byline', 'true||',
  (SELECT (c #>> '{meta,gone}') || '|' || coalesce(c ->> 'title', '') || '|' || coalesce(c #>> '{meta,author_username}', '')
     FROM (SELECT pg_temp.ha4_made('dossier_share', 'rh FORGED', jsonb_build_object('dossier_id', gen_random_uuid()::text, 'author_username', 'rh_victim')) c) x)) AS done \gset rh_
SELECT pg_temp.rh_case('a card of a record no longer in the house is marked gone, its byline gone', 'true|',
  (SELECT (c #>> '{meta,gone}') || '|' || coalesce(c #>> '{meta,owner_username}', '')
     FROM (SELECT pg_temp.ha4_made('log_share', 'rh FORGED', jsonb_build_object('log_id', gen_random_uuid()::text, 'owner_username', 'rh_victim')) c) x)) AS done \gset rh_
SELECT pg_temp.rh_case('a card that names no piece keeps no words', '{}|',
  (SELECT (c -> 'meta')::text || '|' || coalesce(c ->> 'title', '')
     FROM (SELECT pg_temp.ha4_made('dossier_share', 'rh FORGED', jsonb_build_object('author_username', 'rh_victim')) c) x)) AS done \gset rh_
SELECT pg_temp.rh_case('the phone''s card of a record comes through with its film, poster and owner as sent', 'rh H-A4 Vertigo|990004402|/rh-vertigo.jpg|' || (SELECT username FROM ha4_who WHERE n = 3),
  (SELECT (c ->> 'title') || '|' || (c ->> 'film') || '|' || (c ->> 'poster') || '|' || (c #>> '{meta,owner_username}')
     FROM (SELECT pg_temp.ha4_made('log_share', 'rh H-A4 Vertigo',
       jsonb_build_object('log_id', (SELECT id FROM ha4_ids WHERE what = 'record')::text, 'owner_username', (SELECT username FROM ha4_who WHERE n = 3)),
       990004402, '/rh-vertigo.jpg') c) x)) AS done \gset rh_

-- A card of the take standing in a salon (laid by the house, as the trigger writes one), then the take
-- marked SPOILERS, then withdrawn: its line and its website title move together.
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A4 a salon', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
INSERT INTO ha4_ids SELECT 'salon', id FROM made;
WITH made AS (
  INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, film_title, metadata)
  SELECT (SELECT id FROM ha4_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 3), '', c.type, c.film_title, c.metadata
    FROM private.a_shared_card(jsonb_populate_record(NULL::public.lounge_messages, jsonb_build_object(
           'id', gen_random_uuid(), 'type', 'dossier_share',
           'metadata', jsonb_build_object('dossier_id', (SELECT id FROM ha4_ids WHERE what = 'take')::text))), true) c
  RETURNING id)
INSERT INTO ha4_ids SELECT 'card', id FROM made;
UPDATE public.dispatch_posts SET spoiler_label = 'SPOILERS' WHERE id = (SELECT id FROM ha4_ids WHERE what = 'take');
SELECT pg_temp.rh_case('marked SPOILERS, the card''s line and its website title are veiled together', 'TAKE on rh Tenet · SPOILERS|TAKE on rh Tenet · SPOILERS',
  (SELECT film_title || '|' || (metadata ->> 'title') FROM public.lounge_messages WHERE id = (SELECT id FROM ha4_ids WHERE what = 'card'))) AS done \gset rh_
SELECT public.dispatch_empty_filing((SELECT id FROM ha4_ids WHERE what = 'take'), 'author') AS done \gset rh_
SELECT pg_temp.rh_case('withdrawn, the card keeps neither, nor its byline, and reads as gone', '(none)|false|false|true',
  (SELECT coalesce(film_title, '(none)') || '|' || (metadata ? 'title')::text || '|' || (metadata ? 'author_username')::text || '|' || (metadata ->> 'gone')
     FROM public.lounge_messages WHERE id = (SELECT id FROM ha4_ids WHERE what = 'card'))) AS done \gset rh_

SELECT pg_temp.rh_case('no member or visitor may run the card''s functions through the API', '0',
  (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('a_card_cut', 'a_shared_card', 'a_filings_line', 'a_shared_card_is_the_houses', 'a_filings_shared_line')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
