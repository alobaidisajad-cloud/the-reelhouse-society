-- rehearsal-seed.sql — a small made-up house for the production rehearsals.
--
-- Run once by rehearsals.mjs as supabase_admin, on the sealed database
-- bootstrap.mjs builds, before every mobile/supabase/diagnostics/*_rehearsal.sql
-- is run against it. Every member, log and room here is invented; the ids all
-- carry -0000-4000-8000-, a shape no real id has. Each row is written the way
-- the house writes it, with every trigger on: members through auth.users (the
-- profile is the house's own), ranks through grant_entitlement, a seat through
-- claim_founding_seat, rewatches through log_viewing_add as their member.
-- What it holds is what the rehearsals pick by query:
--   ten members: an admin, two Auteurs (one holding a founding seat), two
--     Archivists, five free members, one of them private
--   an Auteur with five logs, each rewatched once, and every other member with
--     at least one log; films with genres, years, and a sync not yet read
--   follows, certifications, critiques, a stack of four films, a public salon
--     with a host and two seated members who have spoken, and filings by four
--     writers, a ballot among them
-- Everything is dated weeks ago, so nothing here is marked "today" or "this
-- week" on the Lobby's clock.
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL request.jwt.claims = '';

-- ── members ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
                        created_at, updated_at, email_confirmed_at)
SELECT ('5eed0000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', name || '@rehearsal.test', jsonb_build_object('username', 'rh_' || name),
       '{"provider":"email"}'::jsonb, '2026-01-01'::timestamptz + n * interval '1 day',
       '2026-01-01'::timestamptz + n * interval '1 day', '2026-01-01'::timestamptz + n * interval '1 day'
  FROM (VALUES (1, 'ada'), (2, 'ben'), (3, 'cleo'), (4, 'dov'), (5, 'eve'),
               (6, 'finn'), (7, 'gus'), (8, 'hana'), (9, 'ivo'), (10, 'jun')) AS m(n, name);

-- The profile the house made for each, dated as the member was.
UPDATE public.profiles p SET created_at = u.created_at, display_name = initcap(substr(p.username, 4))
  FROM auth.users u WHERE u.id = p.id AND u.email LIKE '%@rehearsal.test';

CREATE TEMP TABLE m ON COMMIT DROP AS
SELECT substr(username, 4) AS name, id FROM public.profiles WHERE email LIKE '%@rehearsal.test';
CREATE FUNCTION pg_temp.m(who text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM m WHERE name = who $$;
GRANT SELECT ON m TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.m(text) TO authenticated;

UPDATE public.profiles SET role = 'admin' WHERE id = pg_temp.m('ada');
UPDATE public.profiles SET is_social_private = true WHERE id = pg_temp.m('hana');
INSERT INTO public.founding_seat_counter (id, seats_claimed) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  PERFORM public.grant_entitlement(pg_temp.m('ada'), 'auteur', 'manual');
  PERFORM public.grant_entitlement(pg_temp.m('ben'), 'auteur', 'manual');
  PERFORM public.grant_entitlement(pg_temp.m('cleo'), 'archivist', 'revenuecat');
  PERFORM public.grant_entitlement(pg_temp.m('eve'), 'archivist', 'paytabs');
  PERFORM public.claim_founding_seat(pg_temp.m('ivo'));
  PERFORM public.grant_entitlement(pg_temp.m('ivo'), 'founding', 'revenuecat');
END $$;

-- ── films ───────────────────────────────────────────────────────────────────
INSERT INTO public.films (id, title, year, genres, synced_at, popularity)
VALUES (5101, 'Sunrise', 1927, '{Drama,Romance}', '2026-02-01', 12.5),
       (5102, 'Greed', 1924, '{Drama}', '2026-02-01', 3.1),
       (5103, 'Metropolis', 1927, '{Drama,"Science Fiction"}', '2026-02-01', 30.2),
       (5104, 'Nosferatu', 1922, '{Horror}', '2026-02-01', 21.7),
       (5105, 'The Crowd', 1928, '{Drama}', '2026-02-01', NULL),
       (5106, 'Pandora''s Box', 1929, '{Drama,Crime}', NULL, NULL),
       (5107, 'Sherlock Jr.', 1924, '{Comedy}', '2026-02-01', 8.4),
       (5108, 'The General', 1926, '{Comedy,Action}', NULL, NULL);

-- ── logs ────────────────────────────────────────────────────────────────────
INSERT INTO public.logs (user_id, film_id, film_title, rating, review, watched_date, year, status, created_at)
SELECT pg_temp.m(v.who), v.film, f.title, v.rating, v.review, '2026-02-10'::date + v.day, f.year::text, 'watched',
       '2026-02-10'::timestamptz + v.day * interval '1 day'
  FROM (VALUES
    ('ben',  5101, 4.5,  'A morning that will not end, and the lake at its centre.', 0),
    ('ben',  5102, 4,    'Every coin weighs more than the man who counts it.',      1),
    ('ben',  5103, 3.5,  'The machine is the most human face in the film.',         2),
    ('ben',  5104, 5,    'A shadow climbs the stair before its owner does.',        3),
    ('ben',  5105, NULL, 'The crowd swallows him, and we are the crowd.',           4),
    ('cleo', 5101, 3,    'Lovely, and long.',                                       5),
    ('dov',  5106, 4,    'Louise Brooks looks straight through the camera.',        6),
    ('eve',  5103, 4,    'Every frame a poster; every poster a warning.',           7),
    ('eve',  5107, 4.5,  'The projectionist dreams himself into the picture.',      8),
    ('eve',  5108, NULL, NULL,                                                      9),
    ('finn', 5104, 3,    'Fine.',                                                  10),
    ('finn', 5108, 4,    'The train chase still outruns everything since.',        11),
    ('gus',  5102, 2,    'Too long by half, but the desert is real.',              12),
    ('hana', 5101, 5,    'Seen alone, in the dark, as it should be.',              13),
    ('ivo',  5103, 4,    'The city below the city is the one that works.',         14),
    ('jun',  5107, 3.5,  'A short, perfect joke about the movies.',                15)
  ) AS v(who, film, rating, review, day)
  JOIN public.films f ON f.id = v.film;

-- Each of the Auteur's logs rewatched once, by the Auteur, as the app does it.
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.m('ben'), 'role', 'authenticated')::text, true);
  PERFORM public.log_viewing_add(l.id, gen_random_uuid(), jsonb_build_object('rating', 4, 'review', 'Seen again: it holds.'))
     FROM public.logs l WHERE l.user_id = pg_temp.m('ben');
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
RESET ROLE;

-- ── follows, certifications and critiques ───────────────────────────────────
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
VALUES (pg_temp.m('cleo'), pg_temp.m('ben'),  'follow', '2026-03-01'),
       (pg_temp.m('eve'),  pg_temp.m('ben'),  'follow', '2026-03-01'),
       (pg_temp.m('ben'),  pg_temp.m('cleo'), 'follow', '2026-03-01'),
       (pg_temp.m('jun'),  pg_temp.m('gus'),  'follow', '2026-03-01'),
       (pg_temp.m('finn'), pg_temp.m('gus'),  'follow', '2026-03-02'),
       (pg_temp.m('dov'),  pg_temp.m('gus'),  'follow', '2026-03-03');
INSERT INTO public.interactions (user_id, target_log_id, type, created_at)
SELECT pg_temp.m(v.who), l.id, 'endorse_log', v.at::timestamptz
  FROM (VALUES ('cleo', 'ben', 5101, '2026-03-04'), ('eve', 'ben', 5101, '2026-03-05'),
               ('eve', 'ben', 5104, '2026-03-06'), ('gus', 'eve', 5107, '2026-03-04'),
               ('eve', 'gus', 5102, '2026-03-07')) AS v(who, whose, film, at)
  JOIN public.logs l ON l.user_id = pg_temp.m(v.whose) AND l.film_id = v.film;
INSERT INTO public.log_comments (log_id, user_id, username, body, created_at)
SELECT l.id, pg_temp.m(v.who), 'rh_' || v.who, v.body, '2026-03-08'
  FROM (VALUES ('eve', 'ben', 5101, 'The lake scene is the whole film.'),
               ('cleo', 'gus', 5102, 'The desert earns every minute.')) AS v(who, whose, film, body)
  JOIN public.logs l ON l.user_id = pg_temp.m(v.whose) AND l.film_id = v.film;

-- ── stacks ──────────────────────────────────────────────────────────────────
INSERT INTO public.lists (id, user_id, title, description, is_private, created_at)
VALUES ('5eed0000-0000-4000-8000-0000000005a1', pg_temp.m('ben'), 'Silents', 'Before sound.', false, '2026-03-10'),
       ('5eed0000-0000-4000-8000-0000000005a2', pg_temp.m('eve'), 'Two to start', NULL, false, '2026-03-11');
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position)
SELECT '5eed0000-0000-4000-8000-0000000005a1', f, (SELECT title FROM public.films WHERE id = f), n
  FROM unnest(ARRAY[5101, 5102, 5103, 5104]) WITH ORDINALITY AS x(f, n);
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position)
SELECT '5eed0000-0000-4000-8000-0000000005a2', f, (SELECT title FROM public.films WHERE id = f), n
  FROM unnest(ARRAY[5107, 5108]) WITH ORDINALITY AS x(f, n);
INSERT INTO public.interactions (user_id, target_list_id, type, created_at)
VALUES (pg_temp.m('eve'), '5eed0000-0000-4000-8000-0000000005a1', 'endorse_list', '2026-03-12');

-- ── a salon: the host, two seated members, and what they said ───────────────
INSERT INTO public.lounges (id, name, description, creator_id, is_private, created_at)
VALUES ('5eed0000-0000-4000-8000-0000000001a1', 'The Silent Room', 'For films without a word.', pg_temp.m('ben'), false, '2026-03-13');
INSERT INTO public.lounge_members (lounge_id, user_id, status, joined_at, last_read_at)
VALUES ('5eed0000-0000-4000-8000-0000000001a1', pg_temp.m('ben'),  'approved', '2026-03-13', '2026-03-13'),
       ('5eed0000-0000-4000-8000-0000000001a1', pg_temp.m('cleo'), 'approved', '2026-03-14', '2026-03-14'),
       ('5eed0000-0000-4000-8000-0000000001a1', pg_temp.m('eve'),  'approved', '2026-03-14', '2026-03-14');
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
VALUES ('5eed0000-0000-4000-8000-0000000001a1', pg_temp.m('cleo'), 'Sunrise on Friday?', '2026-03-15'),
       ('5eed0000-0000-4000-8000-0000000001a1', pg_temp.m('eve'),  'Yes, and Greed after.', '2026-03-15 01:00'),
       ('5eed0000-0000-4000-8000-0000000001a1', pg_temp.m('ben'),  'I will bring the score.', '2026-03-15 02:00');

-- ── filings ─────────────────────────────────────────────────────────────────
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, options, closes_at, created_at)
VALUES ('5eed0000-0000-4000-8000-0000000002b1', 'take',   pg_temp.m('ben'),  'rh_ben',  NULL, 'Silence was never empty.', NULL, NULL, '2026-03-16'),
       ('5eed0000-0000-4000-8000-0000000002b2', 'take',   pg_temp.m('cleo'), 'rh_cleo', NULL, 'Intertitles are poetry.', NULL, NULL, '2026-03-17'),
       ('5eed0000-0000-4000-8000-0000000002b4', 'take',   pg_temp.m('ivo'),  'rh_ivo',  NULL, 'A city of machines still needs a heart.', NULL, NULL, '2026-03-17'),
       ('5eed0000-0000-4000-8000-0000000002b5', 'take',   pg_temp.m('jun'),  'rh_jun',  NULL, 'Keaton never smiles, and never needs to.', NULL, NULL, '2026-03-18'),
       ('5eed0000-0000-4000-8000-0000000002b3', 'ballot', pg_temp.m('ben'),  'rh_ben',  'Which silent first?', 'Pick one.',
        '[{"id":1,"title":"Sunrise"},{"id":2,"title":"Greed"}]', '2999-01-01', '2026-03-18');
INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body, created_at)
VALUES ('5eed0000-0000-4000-8000-0000000002b2', pg_temp.m('eve'), 'rh_eve', 'And the music is the voice.', '2026-03-19');

-- ── a notice from the house, and a report no moderator has read ─────────────
INSERT INTO public.notifications (user_id, type, message, created_at)
VALUES (pg_temp.m('dov'), 'system', 'Welcome to the Society.', '2026-03-20');
INSERT INTO public.reports (reporter_id, content_type, content_id, reason, status, target_user_id, created_at)
SELECT pg_temp.m('finn'), 'log', l.id::text, 'spam', 'pending', pg_temp.m('gus'), '2026-03-21'
  FROM public.logs l WHERE l.user_id = pg_temp.m('gus');

COMMIT;
