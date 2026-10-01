-- ════════════════════════════════════════════════════════════════════════════
-- the_lobby_wall_rehearsal.sql — does the Lobby choose, show and keep what it says?
-- ════════════════════════════════════════════════════════════════════════════
-- Runs against LIVE rules as real members, inside one transaction that ROLLS
-- BACK. Nothing is kept: every log, stack, filing, mark, block and notice here
-- is made up (fixed ids) and undone with it, and today's edition is chosen
-- again from the fixtures, then thrown away.
--
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/the_lobby_wall_rehearsal.sql
--
-- `with_fix=1` applies 20261001_01 (the order of honour) first, inside the same
-- transaction; 20260930_03 (the tables, the switch, the job) is already live.
-- Without it, the cases ask the order production runs now.
-- Read each NOTICE as  case | expected | got.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\if :{?with_fix}
\ir ../../../supabase/migrations/20261001_01_the_lobby_turns_daily.sql
\endif

-- Made before anyone is anyone: auth.uid() is null, so no member's gate asks.
SELECT set_config('request.jwt.claims', '', true);

-- The cast: the house's one admin, and five members who are not.
CREATE TEMP TABLE lobby_cast ON COMMIT DROP AS
  SELECT id, 'admin'::text AS part FROM public.profiles WHERE role = 'admin' LIMIT 1;
INSERT INTO lobby_cast
  SELECT id, (ARRAY['author', 'reader', 'critic', 'banned', 'private'])[row_number() OVER (ORDER BY created_at)]
    FROM (SELECT u.id, u.created_at FROM auth.users u JOIN public.profiles p ON p.id = u.id
           WHERE coalesce(p.role, '') <> 'admin' AND NOT coalesce(p.is_banned, false)
             AND NOT coalesce(p.is_social_private, false)
           ORDER BY u.created_at LIMIT 5) m;
GRANT SELECT ON lobby_cast TO authenticated;

-- The edition's moment: today, 00:00 UTC. Everything below was made before it.
CREATE TEMP TABLE lobby_clock ON COMMIT DROP AS
  SELECT (now() AT TIME ZONE 'UTC')::date AS today,
         ((now() AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC' AS moment;
GRANT SELECT ON lobby_clock TO authenticated;

-- The house's own record is set aside (rolled back with the rest): the only
-- honours below are the fixtures', so each rule is asked of pieces we know.
DELETE FROM public.notifications WHERE type = 'featured';
DELETE FROM public.lobby_editions;

-- ── THE FIXTURES ────────────────────────────────────────────────────────────
-- Logs by the author. The minutes before the moment decide which window a mark is in.
INSERT INTO public.logs (id, user_id, film_id, film_title, review, is_spoiler, rating, status, watched_date, created_at)
-- One log per member per film (logs_user_id_film_id_key): each fixture is of its own made-up film.
SELECT v.id::uuid, (SELECT id FROM lobby_cast WHERE part = v.who), 990000 + right(v.id, 2)::int, 'Paris, Texas', v.review, v.spoiler, 4, 'watched',
       ((SELECT moment FROM lobby_clock) - (v.mins || ' minutes')::interval)::date,
       (SELECT moment FROM lobby_clock) - (v.mins || ' minutes')::interval
  FROM (VALUES
    ('10bb1e00-0000-4000-8000-000000000001', 'author',  'Two members certified this.',      false, 600),   -- L1  day 2
    ('10bb1e00-0000-4000-8000-000000000002', 'author',  'Marked a spoiler.',                true,  500),   -- L2  never
    ('10bb1e00-0000-4000-8000-000000000003', 'author',  '   ',                              false, 480),   -- L3  no words: never
    ('10bb1e00-0000-4000-8000-000000000004', 'author',  'Nobody has marked this yet.',      false, 1),     -- L4  the newest, unmarked
    ('10bb1e00-0000-4000-8000-000000000005', 'author',  'Its author certified it.',         false, 2),     -- L5  self only
    ('10bb1e00-0000-4000-8000-000000000006', 'author',  'Certified and critiqued.',         false, 700),   -- L6  day 3
    ('10bb1e00-0000-4000-8000-000000000007', 'author',  'A banned member certified it.',    false, 3),     -- L7  banned only
    ('10bb1e00-0000-4000-8000-000000000008', 'author',  'One mark, the older.',             false, 300),   -- L8  day 1, older
    ('10bb1e00-0000-4000-8000-000000000009', 'author',  'One mark, the newest.',            false, 120),   -- L9  day 1, newest
    ('10bb1e00-0000-4000-8000-000000000010', 'author',  'Two marks, three days ago.',       false, 5000),  -- L10 week 2, day 0
    ('10bb1e00-0000-4000-8000-000000000011', 'author',  'One mark today, nothing more.',    false, 180),   -- L11 day 1 week 1
    ('10bb1e00-0000-4000-8000-000000000012', 'author',  'One mark today, one this week.',   false, 5100),  -- L12 day 1 week 2
    ('10bb1e00-0000-4000-8000-000000000013', 'private', 'A private member''s log.',         false, 650),   -- L13 private author
    ('10bb1e00-0000-4000-8000-000000000014', 'reader',  'A member never honoured, and worth reading.', false, 400),  -- L14 nobody marked it; its writer never hung
    ('10bb1e00-0000-4000-8000-000000000015', 'reader',  'Iconic.',                          false, 1),     -- L15 seven characters, unmarked
    ('10bb1e00-0000-4000-8000-000000000016', 'reader',  'Marked today, and reported, awaiting a moderator.', false, 200), -- L16 reported
    ('10bb1e00-0000-4000-8000-000000000017', 'reader',  'Iconic.',                          false, 210),   -- L17 seven characters, certified today
    ('10bb1e00-0000-4000-8000-000000000018', 'reader',  'Reported, and the report dismissed by a moderator.', false, 220) -- L18
  ) AS v(id, who, review, spoiler, mins);

-- The marks: certifications (interactions) and critiques (log_comments), each at its time.
INSERT INTO public.interactions (user_id, type, target_log_id, created_at)
SELECT (SELECT id FROM lobby_cast WHERE part = v.who), 'endorse_log', v.log::uuid,
       (SELECT moment FROM lobby_clock) - (v.mins || ' minutes')::interval
  FROM (VALUES
    ('reader', '10bb1e00-0000-4000-8000-000000000001', 30),  ('critic', '10bb1e00-0000-4000-8000-000000000001', 40),
    ('author', '10bb1e00-0000-4000-8000-000000000005', 1),
    ('reader', '10bb1e00-0000-4000-8000-000000000006', 20),
    ('banned', '10bb1e00-0000-4000-8000-000000000007', 2),
    ('reader', '10bb1e00-0000-4000-8000-000000000008', 60),  ('reader', '10bb1e00-0000-4000-8000-000000000009', 60),
    ('reader', '10bb1e00-0000-4000-8000-000000000010', 4400), ('critic', '10bb1e00-0000-4000-8000-000000000010', 4500),
    ('reader', '10bb1e00-0000-4000-8000-000000000011', 60),
    ('reader', '10bb1e00-0000-4000-8000-000000000012', 60),  ('critic', '10bb1e00-0000-4000-8000-000000000012', 4500),
    ('reader', '10bb1e00-0000-4000-8000-000000000013', 10),  ('critic', '10bb1e00-0000-4000-8000-000000000013', 11),
    ('critic', '10bb1e00-0000-4000-8000-000000000016', 30),  ('critic', '10bb1e00-0000-4000-8000-000000000017', 30),
    ('critic', '10bb1e00-0000-4000-8000-000000000018', 30)
  ) AS v(who, log, mins);

INSERT INTO public.log_comments (log_id, user_id, username, body, created_at)
SELECT v.log::uuid, (SELECT id FROM lobby_cast WHERE part = v.who), 'rehearsal', 'A critique.',
       (SELECT moment FROM lobby_clock) - (v.mins || ' minutes')::interval
  FROM (VALUES
    ('reader', '10bb1e00-0000-4000-8000-000000000006', 21),   -- the reader certified AND critiqued: 2
    ('critic', '10bb1e00-0000-4000-8000-000000000006', 22),   -- the critic critiqued three times: 1
    ('critic', '10bb1e00-0000-4000-8000-000000000006', 23),
    ('critic', '10bb1e00-0000-4000-8000-000000000006', 24),
    ('author', '10bb1e00-0000-4000-8000-000000000001', 25)    -- the author critiquing their own: 0
  ) AS v(who, log, mins);

-- Stacks: four films (may hang), three films (may not), four films kept private.
INSERT INTO public.lists (id, user_id, title, is_private, created_at)
SELECT v.id::uuid, (SELECT id FROM lobby_cast WHERE part = 'author'), v.title, v.private,
       (SELECT moment FROM lobby_clock) - interval '9 hours'
  FROM (VALUES
    ('10bb1e00-0000-4000-8000-0000000000a1', 'Four films',   false),
    ('10bb1e00-0000-4000-8000-0000000000a2', 'Three films',  false),
    ('10bb1e00-0000-4000-8000-0000000000a3', 'Kept private', true)
  ) AS v(id, title, private);
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position)
SELECT s.id::uuid, 990100 + n, 'Paris, Texas', n
  FROM (VALUES ('10bb1e00-0000-4000-8000-0000000000a1', 4), ('10bb1e00-0000-4000-8000-0000000000a2', 3),
               ('10bb1e00-0000-4000-8000-0000000000a3', 4)) AS s(id, films),
       generate_series(1, 4) n
 WHERE n <= s.films;
INSERT INTO public.interactions (user_id, type, target_list_id, created_at)
SELECT (SELECT id FROM lobby_cast WHERE part = v.who), 'endorse_list', v.list::uuid,
       (SELECT moment FROM lobby_clock) - interval '1 hour'
  FROM (VALUES ('reader', '10bb1e00-0000-4000-8000-0000000000a1'),
               ('reader', '10bb1e00-0000-4000-8000-0000000000a2'), ('critic', '10bb1e00-0000-4000-8000-0000000000a2'),
               ('reader', '10bb1e00-0000-4000-8000-0000000000a3'), ('critic', '10bb1e00-0000-4000-8000-0000000000a3')) AS v(who, list);

-- Filings: an open take (may hang), one behind a spoiler label and one ended (may not).
-- An ended filing is as end_filing leaves it (the ended_whole rule): emptied, and saying who ended it.
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, body, is_published, spoiler_label, ended_at, ended_by, created_at)
SELECT v.id::uuid, 'take', (SELECT id FROM lobby_cast WHERE part = 'author'), 'rehearsal', v.body, true, v.spoiler, v.ended, v.by,
       (SELECT moment FROM lobby_clock) - interval '8 hours'
  FROM (VALUES
    ('10bb1e00-0000-4000-8000-0000000000b1', 'A take.', NULL::text, NULL::timestamptz, NULL::text),
    ('10bb1e00-0000-4000-8000-0000000000b2', 'A take.', 'Ending',   NULL,              NULL),
    ('10bb1e00-0000-4000-8000-0000000000b3', '',        NULL,       now(),             'author')
  ) AS v(id, body, spoiler, ended, by);
INSERT INTO public.dispatch_certifications (user_id, post_id, created_at)
SELECT (SELECT id FROM lobby_cast WHERE part = v.who), v.post::uuid, (SELECT moment FROM lobby_clock) - interval '2 hours'
  FROM (VALUES ('reader', '10bb1e00-0000-4000-8000-0000000000b1'),
               ('reader', '10bb1e00-0000-4000-8000-0000000000b2'), ('critic', '10bb1e00-0000-4000-8000-0000000000b2'),
               ('reader', '10bb1e00-0000-4000-8000-0000000000b3'), ('critic', '10bb1e00-0000-4000-8000-0000000000b3')) AS v(who, post);
INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body, created_at)
SELECT '10bb1e00-0000-4000-8000-0000000000b1', id, 'rehearsal', 'A critique.', (SELECT moment FROM lobby_clock) - interval '90 minutes'
  FROM lobby_cast WHERE part = 'critic';

-- A second member's stack (four films, unmarked) and two more filings: the
-- author's second (certified once) and the reader's (unmarked).
INSERT INTO public.lists (id, user_id, title, is_private, created_at)
VALUES ('10bb1e00-0000-4000-8000-0000000000a4', (SELECT id FROM lobby_cast WHERE part = 'reader'), 'Another member''s four', false,
        (SELECT moment FROM lobby_clock) - interval '10 hours');
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position)
SELECT '10bb1e00-0000-4000-8000-0000000000a4', 990200 + n, 'Paris, Texas', n FROM generate_series(1, 4) n;
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, body, is_published, created_at)
VALUES ('10bb1e00-0000-4000-8000-0000000000b4', 'take', (SELECT id FROM lobby_cast WHERE part = 'author'), 'rehearsal', 'A second take.', true,
        (SELECT moment FROM lobby_clock) - interval '7 hours'),
       ('10bb1e00-0000-4000-8000-0000000000b5', 'take', (SELECT id FROM lobby_cast WHERE part = 'reader'), 'rehearsal', 'Another member''s take, said at some length.', true,
        (SELECT moment FROM lobby_clock) - interval '9 hours'),
       ('10bb1e00-0000-4000-8000-0000000000b6', 'take', (SELECT id FROM lobby_cast WHERE part = 'critic'), 'rehearsal', 'Ok.', true,
        (SELECT moment FROM lobby_clock) - interval '1 hour');
-- S5 and P7: the critic's stack and filing, each certified today, each reported.
INSERT INTO public.lists (id, user_id, title, is_private, created_at)
VALUES ('10bb1e00-0000-4000-8000-0000000000a5', (SELECT id FROM lobby_cast WHERE part = 'critic'), 'A reported four', false,
        (SELECT moment FROM lobby_clock) - interval '5 hours');
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position)
SELECT '10bb1e00-0000-4000-8000-0000000000a5', 990300 + n, 'Paris, Texas', n FROM generate_series(1, 4) n;
INSERT INTO public.interactions (user_id, type, target_list_id, created_at)
VALUES ((SELECT id FROM lobby_cast WHERE part = 'reader'), 'endorse_list', '10bb1e00-0000-4000-8000-0000000000a5',
        (SELECT moment FROM lobby_clock) - interval '1 hour');
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, body, is_published, created_at)
VALUES ('10bb1e00-0000-4000-8000-0000000000b7', 'take', (SELECT id FROM lobby_cast WHERE part = 'critic'), 'rehearsal',
        'A reported take, awaiting a moderator''s word.', true, (SELECT moment FROM lobby_clock) - interval '3 hours');
INSERT INTO public.dispatch_certifications (user_id, post_id, created_at)
VALUES ((SELECT id FROM lobby_cast WHERE part = 'reader'), '10bb1e00-0000-4000-8000-0000000000b7', (SELECT moment FROM lobby_clock) - interval '2 hours');
-- A member reports L16, S5 and P7; no moderator has decided.
INSERT INTO public.reports (reporter_id, content_type, content_id, reason, status, target_user_id)
SELECT (SELECT id FROM lobby_cast WHERE part = v.who), v.kind, v.id, 'spam', 'pending', (SELECT id FROM lobby_cast WHERE part = v.whose)
  FROM (VALUES ('critic', 'log',           '10bb1e00-0000-4000-8000-000000000016', 'reader'),
               ('reader', 'list',          '10bb1e00-0000-4000-8000-0000000000a5', 'critic'),
               ('reader', 'dispatch_post', '10bb1e00-0000-4000-8000-0000000000b7', 'critic')) AS v(who, kind, id, whose);
-- L18 was reported too, and a moderator dismissed it (as bulk_dismiss_reports leaves it).
INSERT INTO public.reports (reporter_id, content_type, content_id, reason, status, resolved_at, resolution_action, target_user_id)
VALUES ((SELECT id FROM lobby_cast WHERE part = 'critic'), 'log', '10bb1e00-0000-4000-8000-000000000018', 'spam', 'resolved', now(), 'dismiss',
        (SELECT id FROM lobby_cast WHERE part = 'reader'));
INSERT INTO public.dispatch_certifications (user_id, post_id, created_at)
VALUES ((SELECT id FROM lobby_cast WHERE part = 'reader'), '10bb1e00-0000-4000-8000-0000000000b4', (SELECT moment FROM lobby_clock) - interval '2 hours');

-- Yesterday's wall: L9 hung first among logs — so L9 has had its day, and its
-- writer (the author) was honoured this week.
INSERT INTO public.lobby_editions (edition, slot, place, target_id, author_id, score)
VALUES ((SELECT today FROM lobby_clock) - 1, 'log', 1, '10bb1e00-0000-4000-8000-000000000009', (SELECT id FROM lobby_cast WHERE part = 'author'), 1);

-- Only now: the banned member is banned, the private member private (their marks were made before).
UPDATE public.profiles SET is_banned = true WHERE id = (SELECT id FROM lobby_cast WHERE part = 'banned');
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT id FROM lobby_cast WHERE part = 'private');

-- ── CHOOSING ────────────────────────────────────────────────────────────────
CREATE TEMP TABLE lobby_pushes ON COMMIT DROP AS SELECT count(*) AS before FROM net.http_request_queue;
DO $$
DECLARE got text;
BEGIN
  BEGIN
    got := public.lobby_choose_edition((SELECT today FROM lobby_clock))::text;
    got := CASE WHEN got::int > 0 THEN 'chosen' ELSE 'nothing' END;
  EXCEPTION WHEN undefined_function OR undefined_table THEN got := 'missing';
  END;
  RAISE NOTICE '%|%|%', 'the day''s edition is chosen', 'chosen', got;
END $$;

-- Where each fixture log landed (0 = not chosen).
CREATE TEMP TABLE lobby_places (fixture text, place int) ON COMMIT DROP;
DO $$
DECLARE r record; p int;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('L1','10bb1e00-0000-4000-8000-000000000001'), ('L2','10bb1e00-0000-4000-8000-000000000002'),
                                 ('L3','10bb1e00-0000-4000-8000-000000000003'), ('L4','10bb1e00-0000-4000-8000-000000000004'),
                                 ('L5','10bb1e00-0000-4000-8000-000000000005'), ('L6','10bb1e00-0000-4000-8000-000000000006'),
                                 ('L7','10bb1e00-0000-4000-8000-000000000007'), ('L8','10bb1e00-0000-4000-8000-000000000008'),
                                 ('L9','10bb1e00-0000-4000-8000-000000000009'), ('L10','10bb1e00-0000-4000-8000-000000000010'),
                                 ('L11','10bb1e00-0000-4000-8000-000000000011'), ('L12','10bb1e00-0000-4000-8000-000000000012'),
                                 ('L13','10bb1e00-0000-4000-8000-000000000013'), ('S1','10bb1e00-0000-4000-8000-0000000000a1'),
                                 ('S2','10bb1e00-0000-4000-8000-0000000000a2'), ('S3','10bb1e00-0000-4000-8000-0000000000a3'),
                                 ('P1','10bb1e00-0000-4000-8000-0000000000b1'), ('P2','10bb1e00-0000-4000-8000-0000000000b2'),
                                 ('P3','10bb1e00-0000-4000-8000-0000000000b3'), ('L14','10bb1e00-0000-4000-8000-000000000014'),
                                 ('S4','10bb1e00-0000-4000-8000-0000000000a4'), ('P4','10bb1e00-0000-4000-8000-0000000000b4'),
                                 ('P5','10bb1e00-0000-4000-8000-0000000000b5'), ('P6','10bb1e00-0000-4000-8000-0000000000b6'),
                                 ('L15','10bb1e00-0000-4000-8000-000000000015'), ('L16','10bb1e00-0000-4000-8000-000000000016'),
                                 ('L17','10bb1e00-0000-4000-8000-000000000017'), ('S5','10bb1e00-0000-4000-8000-0000000000a5'),
                                 ('P7','10bb1e00-0000-4000-8000-0000000000b7'), ('L18','10bb1e00-0000-4000-8000-000000000018')) AS f(fixture, id) LOOP
    BEGIN
      EXECUTE 'SELECT place FROM public.lobby_editions WHERE edition = $1 AND target_id = $2'
        INTO p USING (SELECT today FROM lobby_clock), r.id::uuid;
    EXCEPTION WHEN undefined_table THEN p := NULL;
    END;
    INSERT INTO lobby_places VALUES (r.fixture, coalesce(p, 0));
  END LOOP;
END $$;
GRANT SELECT ON lobby_places TO authenticated;

DO $$
DECLARE
  pl CONSTANT text := 'SELECT place FROM lobby_places WHERE fixture = $1';
  a int; b int;
  FUNCTION_missing boolean := NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'lobby_choose_edition');
  got text;
BEGIN
  IF FUNCTION_missing THEN
    RAISE NOTICE '%|%|%', 'the order of honour', 'as ruled', 'missing';
    RETURN;
  END IF;
  EXECUTE pl INTO a USING 'L6'; EXECUTE pl INTO b USING 'L1';
  RAISE NOTICE '%|%|%', 'certified AND critiqued (3) above certified twice (2)', 'true', (a > 0 AND a < b)::text;
  RAISE NOTICE '%|%|%', 'a member critiquing three times counts once (L6 is 3, not 5): it stays above L1', 'true', (a < b)::text;
  EXECUTE pl INTO a USING 'L11'; EXECUTE pl INTO b USING 'L12';
  RAISE NOTICE '%|%|%', 'only the last day counts: L12 (one today, one this week) ties L11 (one today), and the newer wins', 'true', (a > 0 AND a < b)::text;
  EXECUTE pl INTO a USING 'L11'; EXECUTE pl INTO b USING 'L10';
  -- (0 = not among the twelve: the house's own newer logs may fill them)
  RAISE NOTICE '%|%|%', 'a log marked twice three days ago is below one marked once today', 'true', (a > 0 AND (b = 0 OR a < b))::text;
  EXECUTE pl INTO a USING 'L11'; EXECUTE pl INTO b USING 'L8';
  RAISE NOTICE '%|%|%', 'a tie on the day goes to the newest', 'true', (a > 0 AND a < b)::text;
  EXECUTE pl INTO a USING 'L5'; EXECUTE pl INTO b USING 'L8';
  RAISE NOTICE '%|%|%', 'self-certification counts for nothing (L5 below L8, marked once)', 'true', (b > 0 AND (a = 0 OR a > b))::text;
  EXECUTE pl INTO a USING 'L7';
  RAISE NOTICE '%|%|%', 'a banned member''s mark counts for nothing (L7 below L8)', 'true', (b > 0 AND (a = 0 OR a > b))::text;
  EXECUTE pl INTO a USING 'L14'; EXECUTE pl INTO b USING 'L4';
  RAISE NOTICE '%|%|%', 'on a quiet tie a member honoured this week gives way to one who was not (L14 above the newer L4)', 'true', (a > 0 AND (b = 0 OR a < b))::text;
  EXECUTE pl INTO a USING 'L9'; EXECUTE pl INTO b USING 'L14';
  RAISE NOTICE '%|%|%', 'a log that has had its day gives way to every one that has not (L9, marked today, below unmarked L14)', 'true', (b > 0 AND (a = 0 OR a > b))::text;
  SELECT count(*)::text INTO got FROM public.lobby_editions
   WHERE edition = (SELECT today FROM lobby_clock) AND slot = 'log' AND place < coalesce(nullif(a, 0), 13)
     AND target_id NOT IN (SELECT target_id FROM public.lobby_editions WHERE edition < (SELECT today FROM lobby_clock));
  RAISE NOTICE '%|%|%', 'every log above L9 is one that has not had its day', (coalesce(nullif(a, 0), 13) - 1)::text, got;
  EXECUTE pl INTO a USING 'L15';
  RAISE NOTICE '%|%|%', 'a quiet day never hangs a throwaway review (seven characters, unmarked)', '0', a::text;
  EXECUTE pl INTO a USING 'L17';
  RAISE NOTICE '%|%|%', 'a short review another member certified has earned its place', 'true', (a > 0)::text;
  EXECUTE pl INTO a USING 'L16';
  RAISE NOTICE '%|%|%', 'a log awaiting a moderator''s word on a report never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'P6';
  RAISE NOTICE '%|%|%', 'nor a throwaway filing ("Ok.", unmarked)', '0', a::text;
  EXECUTE pl INTO a USING 'S5';
  RAISE NOTICE '%|%|%', 'a stack awaiting a moderator''s word never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'P7';
  RAISE NOTICE '%|%|%', 'a filing awaiting a moderator''s word never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'L18';
  RAISE NOTICE '%|%|%', 'once a moderator dismisses the report, the log may hang again', 'true', (a > 0)::text;
  EXECUTE pl INTO a USING 'L2';
  RAISE NOTICE '%|%|%', 'a log marked a spoiler never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'L3';
  RAISE NOTICE '%|%|%', 'a log with no words never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'L13';
  RAISE NOTICE '%|%|%', 'a private member''s log never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'L6';
  RAISE NOTICE '%|%|%', 'the most honoured log takes the first place', '1', a::text;
  EXECUTE pl INTO a USING 'S4'; EXECUTE pl INTO b USING 'S1';
  RAISE NOTICE '%|%|%', 'one member, one bill: the first log is the author''s, so the first stack is another member''s', 'true', (a = 1 AND b <> 1)::text;
  EXECUTE pl INTO a USING 'S2';
  RAISE NOTICE '%|%|%', 'a stack of three films never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'S3';
  RAISE NOTICE '%|%|%', 'a private stack never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'P1';
  RAISE NOTICE '%|%|%', 'the open filing certified and critiqued takes the first place', '1', a::text;
  EXECUTE pl INTO a USING 'P5'; EXECUTE pl INTO b USING 'P4';
  RAISE NOTICE '%|%|%', 'three filings, three writers: the reader''s unmarked take before the author''s second', 'true', (a = 2 AND (b = 0 OR b > a))::text;
  SELECT count(*)::text INTO got FROM public.lobby_editions e
   WHERE e.edition = (SELECT today FROM lobby_clock) AND e.slot = 'post' AND e.place <= 3
     AND e.author_id IN (SELECT author_id FROM public.lobby_editions f
                          WHERE f.edition = e.edition AND f.slot = 'post' AND f.place < e.place);
  RAISE NOTICE '%|%|%', 'no writer holds two of the three columns while another writer waits', '0', got;
  EXECUTE pl INTO a USING 'P2';
  RAISE NOTICE '%|%|%', 'a filing behind a spoiler label never hangs', '0', a::text;
  EXECUTE pl INTO a USING 'P3';
  RAISE NOTICE '%|%|%', 'an ended filing never hangs', '0', a::text;

  SELECT count(*)::text INTO got FROM public.lobby_editions WHERE edition = (SELECT today FROM lobby_clock) AND place > 12;
  RAISE NOTICE '%|%|%', 'no slot holds more than twelve', '0', got;

  -- the notices: the first log, the first stack, the first three filings — and nothing buzzed
  SELECT string_agg(group_key, ',' ORDER BY group_key) INTO got FROM public.notifications
   WHERE type = 'featured' AND user_id = (SELECT id FROM lobby_cast WHERE part = 'author');
  RAISE NOTICE '%|%|%', 'the author is told of the log and the filing that hang — not the stack that gave way, nor the second filing',
    'lobby:log:10bb1e00-0000-4000-8000-000000000006,lobby:post:10bb1e00-0000-4000-8000-0000000000b1', got;
  SELECT count(*)::text INTO got FROM public.notifications n
   WHERE n.type = 'featured'
     AND n.group_key NOT IN (SELECT 'lobby:' || e.slot || ':' || e.target_id FROM public.lobby_editions e
                              WHERE e.edition = (SELECT today FROM lobby_clock)
                                AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END);
  RAISE NOTICE '%|%|%', 'nobody is told of a piece the wall does not show', '0', got;
  SELECT string_agg(group_key, ',' ORDER BY group_key) INTO got FROM public.notifications
   WHERE type = 'featured' AND user_id = (SELECT id FROM lobby_cast WHERE part = 'reader');
  RAISE NOTICE '%|%|%', 'the reader is told of their stack and their filing',
    'lobby:list:10bb1e00-0000-4000-8000-0000000000a4,lobby:post:10bb1e00-0000-4000-8000-0000000000b5', got;
  SELECT (count(*) - (SELECT before FROM lobby_pushes))::text INTO got FROM net.http_request_queue;
  RAISE NOTICE '%|%|%', 'a notice of honour is never pushed', '0', got;

  -- chosen once: asking again changes nothing
  got := public.lobby_choose_edition((SELECT today FROM lobby_clock))::text;
  RAISE NOTICE '%|%|%', 'an edition is chosen once (asking again chooses 0)', '0', got;
  SELECT count(*)::text INTO got FROM public.notifications
   WHERE type = 'featured' AND user_id = (SELECT id FROM lobby_cast WHERE part = 'author');
  RAISE NOTICE '%|%|%', 'and tells no one twice', '2', got;
END $$;

-- The push still buzzes for everything else: a critique's notice is queued.
DO $$
DECLARE got text; before bigint := (SELECT count(*) FROM net.http_request_queue);
BEGIN
  INSERT INTO public.notifications (user_id, type, message)
  VALUES ((SELECT id FROM lobby_cast WHERE part = 'author'), 'comment', 'critiqued your log.');
  SELECT (count(*) - before)::text INTO got FROM net.http_request_queue;
  RAISE NOTICE '%|%|%', 'every other notice is still pushed', '1', got;
END $$;

-- A reader who blocks the author, for the wall's own rules below.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
SELECT (SELECT id FROM lobby_cast WHERE part = 'critic'), (SELECT id FROM lobby_cast WHERE part = 'author'), 'block';

-- ── THE WALL, AS MEMBERS READ IT ────────────────────────────────────────────
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
  wall jsonb; got text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_lobby') THEN
    RAISE NOTICE '%|%|%', 'the wall', 'read', 'missing';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'reader')), true);
  wall := public.get_lobby();
  RAISE NOTICE '%|%|%', 'the reader sees the first log', '10bb1e00-0000-4000-8000-000000000006', wall #>> '{log,id}';
  RAISE NOTICE '%|%|%', 'the reader sees the first stack — another member''s than the log''s', '10bb1e00-0000-4000-8000-0000000000a4', wall #>> '{stack,id}';
  RAISE NOTICE '%|%|%', 'and filings from different writers before any writer twice', '0',
    (SELECT (count(*) - count(DISTINCT f #>> '{author,id}'))::text FROM jsonb_array_elements(wall -> 'filings') f);
  RAISE NOTICE '%|%|%', 'the reader''s wall opens with the first filing, then another writer''s', '10bb1e00-0000-4000-8000-0000000000b1,10bb1e00-0000-4000-8000-0000000000b5',
    (SELECT string_agg(f ->> 'id', ',' ORDER BY i) FROM jsonb_array_elements(wall -> 'filings') WITH ORDINALITY AS x(f, i) WHERE i <= 2);
  RAISE NOTICE '%|%|%', 'the stack carries its film count and up to three posters', '4/3', (wall #>> '{stack,films}') || '/' || jsonb_array_length(wall #> '{stack,posters}');
  RAISE NOTICE '%|%|%', 'the reader sees the first filing', '10bb1e00-0000-4000-8000-0000000000b1', wall #>> '{filings,0,id}';
  -- no FIELD anywhere in the wall counts regard (the words members wrote may say anything)
  SELECT coalesce(string_agg(DISTINCT k, ','), 'none') INTO got
    FROM jsonb_array_elements_text(jsonb_path_query_array(wall, '$.** ? (@.type() == "object").keyvalue().key')) k
   WHERE k ~* '(score|certif|critique|count|regard)';
  RAISE NOTICE '%|%|%', 'the wall carries no counts', 'none', got;
  RAISE NOTICE '%|%|%', 'the edition is today''s', (SELECT today FROM lobby_clock)::text, wall ->> 'edition';

  -- the critic blocked the author: none of the author's pieces reaches them
  PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'critic')), true);
  wall := public.get_lobby();
  got := concat_ws(',',
    NULLIF(wall #>> '{log,author,id}' = (SELECT id FROM lobby_cast WHERE part = 'author')::text, false)::text,
    NULLIF(wall #>> '{stack,author,id}' = (SELECT id FROM lobby_cast WHERE part = 'author')::text, false)::text,
    NULLIF(EXISTS (SELECT 1 FROM jsonb_array_elements(wall -> 'filings') f
                    WHERE f #>> '{author,id}' = (SELECT id FROM lobby_cast WHERE part = 'author')::text), false)::text);
  RAISE NOTICE '%|%|%', 'a member who blocked the author sees none of their pieces', '', got;

  -- what a member may not do
  got := 'read';
  BEGIN PERFORM score FROM public.lobby_editions LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused'; END;
  RAISE NOTICE '%|%|%', 'a member reads the score', 'refused', got;
  got := 'read';
  BEGIN PERFORM 1 FROM public.lobby_withheld LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused'; END;
  RAISE NOTICE '%|%|%', 'a member reads what is kept off', 'refused', got;
  got := 'chose';
  BEGIN PERFORM public.lobby_choose_edition((SELECT today FROM lobby_clock) + 1);
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused'; END;
  RAISE NOTICE '%|%|%', 'a member chooses an edition', 'refused', got;
  got := 'kept off';
  BEGIN PERFORM public.set_lobby_withheld('log', '10bb1e00-0000-4000-8000-000000000006', true);
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused'; END;
  RAISE NOTICE '%|%|%', 'a member who is not an admin keeps a piece off', 'refused', got;
END $$;

-- ── WHEN A PIECE GOES, THE NEXT TAKES ITS PLACE ─────────────────────────────
DO $$
DECLARE
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
  wall jsonb; got text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_lobby') THEN RETURN; END IF;

  -- the admin keeps the first log off: it leaves the wall at once, its notice with it
  BEGIN
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'admin')), true);
    PERFORM public.set_lobby_withheld('log', '10bb1e00-0000-4000-8000-000000000006', true);
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'reader')), true);
    wall := public.get_lobby();
    RAISE NOTICE '%|%|%', 'kept off by an admin: the next log takes the wall', '10bb1e00-0000-4000-8000-000000000001', wall #>> '{log,id}';
    RAISE EXCEPTION USING ERRCODE = 'ZZ001';
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;

  -- the author deletes the first log: the next takes the wall
  BEGIN
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'author')), true);
    DELETE FROM public.logs WHERE id = '10bb1e00-0000-4000-8000-000000000006';
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'reader')), true);
    wall := public.get_lobby();
    RAISE NOTICE '%|%|%', 'deleted by its author: the next log takes the wall', '10bb1e00-0000-4000-8000-000000000001', wall #>> '{log,id}';
    RAISE EXCEPTION USING ERRCODE = 'ZZ001';
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;

  -- the author marks it a spoiler after it was chosen: it no longer hangs
  BEGIN
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'author')), true);
    UPDATE public.logs SET is_spoiler = true WHERE id = '10bb1e00-0000-4000-8000-000000000006';
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'reader')), true);
    wall := public.get_lobby();
    RAISE NOTICE '%|%|%', 'marked a spoiler since: the next log takes the wall', '10bb1e00-0000-4000-8000-000000000001', wall #>> '{log,id}';
    RAISE EXCEPTION USING ERRCODE = 'ZZ001';
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
END $$;

RESET ROLE;

-- ── WHAT MAY NO LONGER HANG, EVEN FOR THOSE WHO MAY STILL READ IT ───────────
-- An author always reads their own filings (posts_read_own), and a stack's
-- films are the stack's to change: the wall itself must ask what may hang.
DO $$
DECLARE
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
  wall jsonb; got text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_lobby') THEN
    RAISE NOTICE '%|%|%', 'what may no longer hang', 'gone', 'missing';
    RETURN;
  END IF;

  -- the house withholds the first filing after it was chosen
  BEGIN
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'admin')), true);
    UPDATE public.dispatch_posts SET withheld_at = now() WHERE id = '10bb1e00-0000-4000-8000-0000000000b1';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'author')), true);
    wall := public.get_lobby();
    got := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(wall -> 'filings') f
                              WHERE f ->> 'id' = '10bb1e00-0000-4000-8000-0000000000b1') THEN 'hangs' ELSE 'gone' END;
    RAISE NOTICE '%|%|%', 'withheld since it was chosen: gone even from its author''s wall', 'gone', got;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001';
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;

  -- its author draws the first filing back to a draft
  BEGIN
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'admin')), true);
    UPDATE public.dispatch_posts SET is_published = false WHERE id = '10bb1e00-0000-4000-8000-0000000000b1';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'author')), true);
    wall := public.get_lobby();
    got := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(wall -> 'filings') f
                              WHERE f ->> 'id' = '10bb1e00-0000-4000-8000-0000000000b1') THEN 'hangs' ELSE 'gone' END;
    RAISE NOTICE '%|%|%', 'a draft again since it was chosen: gone even from its author''s wall', 'gone', got;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001';
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;

  -- its author cuts the first stack below four films
  BEGIN
    DELETE FROM public.list_items WHERE list_id = '10bb1e00-0000-4000-8000-0000000000a4' AND rank_position = 4;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'reader')), true);
    wall := public.get_lobby();
    got := CASE WHEN wall #>> '{stack,id}' = '10bb1e00-0000-4000-8000-0000000000a4' THEN 'hangs' ELSE 'gone' END;
    RAISE NOTICE '%|%|%', 'cut below four films since: the next stack takes the wall', 'gone', got;
    RAISE EXCEPTION USING ERRCODE = 'ZZ001';
  EXCEPTION WHEN SQLSTATE 'ZZ001' THEN NULL;
  END;
END $$;

-- ── THE ADMIN'S SWITCH, WHOLE ───────────────────────────────────────────────
DO $$
DECLARE
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
  got text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_lobby_withheld') THEN
    RAISE NOTICE '%|%|%', 'the admin''s switch', 'works', 'missing';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', format(as_member, (SELECT id FROM lobby_cast WHERE part = 'admin')), true);
  PERFORM public.set_lobby_withheld('post', '10bb1e00-0000-4000-8000-0000000000b1', true);
  SELECT count(*)::text INTO got FROM public.lobby_editions WHERE target_id = '10bb1e00-0000-4000-8000-0000000000b1';
  RAISE NOTICE '%|%|%', 'kept off: gone from every edition', '0', got;
  SELECT count(*)::text INTO got FROM public.notifications WHERE group_key = 'lobby:post:10bb1e00-0000-4000-8000-0000000000b1';
  RAISE NOTICE '%|%|%', 'kept off: its notice is taken back', '0', got;
  PERFORM public.lobby_choose_edition((SELECT today FROM lobby_clock) + 1);
  SELECT count(*)::text INTO got FROM public.lobby_editions
   WHERE edition = (SELECT today FROM lobby_clock) + 1 AND target_id = '10bb1e00-0000-4000-8000-0000000000b1';
  RAISE NOTICE '%|%|%', 'kept off: never chosen again', '0', got;
  SELECT (count(*) - count(DISTINCT group_key))::text INTO got FROM public.notifications WHERE type = 'featured';
  RAISE NOTICE '%|%|%', 'the next day tells no piece twice', '0', got;
  SELECT CASE WHEN (SELECT target_id FROM public.lobby_editions WHERE edition = (SELECT today FROM lobby_clock) + 1 AND slot = 'log' AND place = 1)
                IN (SELECT target_id FROM public.lobby_editions WHERE edition <= (SELECT today FROM lobby_clock) AND slot = 'log' AND place = 1)
              THEN 'again' ELSE 'new' END INTO got;
  RAISE NOTICE '%|%|%', 'the next day''s first log is one that has not had its day', 'new', got;
  PERFORM public.set_lobby_withheld('post', '10bb1e00-0000-4000-8000-0000000000b1', false);
  SELECT count(*)::text INTO got FROM public.lobby_withheld WHERE target_id = '10bb1e00-0000-4000-8000-0000000000b1';
  RAISE NOTICE '%|%|%', 'let back: it may be chosen again', '0', got;
END $$;

-- ── THE JOB AND THE DOORS ───────────────────────────────────────────────────
SELECT format('%s|%s|%s', 'the job runs every hour at five past', '5 * * * *',
              coalesce((SELECT schedule FROM cron.job WHERE jobname = 'lobby-edition'), 'missing'));
SELECT format('%s|%s|%s', 'a visitor reads the wall', 'false',
              coalesce((SELECT has_function_privilege('anon', 'public.get_lobby()', 'EXECUTE')::text
                          WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_lobby')), 'missing'));

ROLLBACK;
