-- ════════════════════════════════════════════════════════════════════════════
-- e2e/load/seed.sql — a house of 100,000 members (or :members), for the load test (load.yml).
-- ════════════════════════════════════════════════════════════════════════════
-- Runs ONLY on the CI runner's throwaway copy of production's shape (built by
-- e2e/db/bootstrap.mjs, sealed off from production as the E2E world is), as
-- supabase_admin. Never against a real database: probe.mjs refuses any host
-- but the runner's own.
--
-- The house it makes is lopsided on purpose, as real ones are:
--   · 100,000 members; most log a few films, a few log hundreds, and one
--     "whale" (member 1) has logged 10,000 — every busy screen is timed for
--     the heaviest member it will ever meet, not the average one;
--   · one celebrity (member 2) whom a third of the house follows;
--   · one hot film (film 1) half the house has logged, one hot Dispatch post
--     with 20,000 critiques, one Lounge with 200,000 messages.
--
-- Triggers are switched off while rows are laid down (session_replication_role
-- = replica: millions of rows in minutes, not hours), so everything a trigger
-- would have made — profiles' counts, films' verdicts, viewings, comment
-- counts — is made at the end, the way the triggers make it.
--
-- Deterministic: setseed, and ids built from each row's number, so two runs
-- build the same house and a timing that moves means the code moved.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
\timing on
-- The house's size: 100,000 members unless the run names another, a whole number of hundreds of
-- thousands (psql -v members=500000, the owner's scale: audit A-SCALE-PLAN). :scale is that number
-- of hundreds of thousands, by which what a house holds in proportion grows.
\if :{?members}
\else
\set members 100000
\endif
SELECT :members / 100000 AS scale \gset
SET session_replication_role = replica;
SET synchronous_commit = off;
SELECT setseed(0.4242);

-- A member's id from their number: member 1 is ...000000000001.
CREATE OR REPLACE FUNCTION pg_temp.mid(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;

-- ── films: 30,000, read as sync-films reads them ──────────────────────────────
INSERT INTO public.films (id, title, year, runtime, poster_path, genres, director, synced_at, rating_count, log_count)
SELECT f, 'Film ' || f, 1920 + (f % 106), 80 + (f % 90), '/poster' || f || '.jpg',
       ARRAY[(ARRAY['Drama','Comedy','Thriller','Horror','Romance','Crime','Documentary','Animation','Western','Science Fiction'])[1 + f % 10],
             (ARRAY['Mystery','History','War','Music','Fantasy','Family'])[1 + f % 6]],
       'Director ' || (f % 3000), now(), 0, 0
  FROM generate_series(1, 30000) f
ON CONFLICT (id) DO NOTHING;

-- ── members ───────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT pg_temp.mid(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'm' || n || '@load.test', jsonb_build_object('username', 'm' || n), '{"provider":"email"}'::jsonb,
       now() - (n % 1000) * interval '1 day', now(), now()
  FROM generate_series(1, :members) n;

INSERT INTO public.profiles (id, username, role, tier, email, is_social_private, created_at, preferences, display_name, bio)
SELECT pg_temp.mid(n), 'm' || n,
       CASE WHEN n % 33 = 0 THEN 'auteur' WHEN n % 10 = 0 THEN 'archivist' ELSE 'cinephile' END,
       CASE WHEN n % 33 = 0 THEN 'auteur' WHEN n % 10 = 0 THEN 'archivist' ELSE 'cinephile' END,
       'm' || n || '@load.test', (n % 20 = 7), now() - (n % 1000) * interval '1 day', '{}'::jsonb,
       'Member ' || n, 'A member of the load test.'
  FROM generate_series(1, :members) n;
-- The whale and the celebrity are Auteurs, public.
UPDATE public.profiles SET role = 'auteur', tier = 'auteur', is_social_private = false WHERE id IN (pg_temp.mid(1), pg_temp.mid(2));

-- ── logs: lopsided; each member's films distinct (logs_user_id_film_id_key) ───
CREATE TEMP TABLE load_counts AS
SELECT n, CASE WHEN n = 1 THEN 10000
               WHEN r < 0.03 THEN 80 + floor(random() * 1500)::int
               WHEN r < 0.25 THEN 15 + floor(random() * 65)::int
               ELSE floor(random() * 15)::int END AS logs
  FROM (SELECT n, random() AS r FROM generate_series(1, :members) n) x;

INSERT INTO public.logs (id, user_id, film_id, film_title, rating, review, watched_date, created_at, poster_path, year, status, view_count, viewing_history)
SELECT gen_random_uuid(), pg_temp.mid(c.n), film,
       'Film ' || film,
       CASE WHEN random() < 0.2 THEN 0 ELSE (1 + floor(random() * 10)::int) / 2.0 END,
       CASE WHEN random() < 0.3 THEN repeat('A considered word on this film. ', 1 + floor(random() * 8)::int) END,
       (date '2026-10-01' - (k * 3 + floor(random() * 3)::int) % 2000),
       now() - ((k * 3) % 2000) * interval '1 day',
       '/poster' || film || '.jpg', (1920 + film % 106)::text,
       CASE WHEN random() < 0.05 THEN 'rewatched' WHEN random() < 0.02 THEN 'abandoned' ELSE 'watched' END,
       1, '[]'::jsonb
  FROM load_counts c,
       LATERAL generate_series(1, c.logs) k,
       -- In bigint: past 271,000 members, n * 7919 is past an integer's 2.1 billion (load 42902610279, 500,000).
       LATERAL (SELECT CASE WHEN k = 1 AND c.n % 2 = 0 THEN 1 ELSE ((c.n::bigint * 7919 + k * 14729) % 30000) + 1 END AS film) f
ON CONFLICT (user_id, film_id) DO NOTHING;

-- Every log has its first viewing (logs_register_viewings makes it).
INSERT INTO public.viewings (viewing_id, log_id)
SELECT viewing_id, id FROM public.logs;

-- The whale has seen a fifth of its films more than once: each such log holds one or two earlier
-- viewings (viewing_history), a year apart and before its last, each on its own day, as
-- log_viewing_add leaves them. The calendar and the Year in Cinema count each as a night of its own.
UPDATE public.logs l
   SET viewing_history = h.history, view_count = jsonb_array_length(h.history) + 1
  FROM (SELECT x.id, jsonb_agg(jsonb_build_object('viewingId', gen_random_uuid(),
                                                  'date', to_char(x.watched_date - j * 365 - x.film_id % 90, 'YYYY-MM-DD'),
                                                  'rating', 3.5) ORDER BY j) AS history
          FROM public.logs x, generate_series(1, 1 + x.film_id % 2) j
         WHERE x.user_id = pg_temp.mid(1) AND x.film_id % 5 = 0
         GROUP BY x.id) h
 WHERE l.id = h.id;
INSERT INTO public.viewings (viewing_id, log_id)
SELECT (e->>'viewingId')::uuid, l.id
  FROM public.logs l, jsonb_array_elements(l.viewing_history) e
 WHERE l.user_id = pg_temp.mid(1) AND l.viewing_history <> '[]'::jsonb;

-- ── follows: ~25 each; a third of the house follows the celebrity ─────────────
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
SELECT pg_temp.mid(n), pg_temp.mid(((n * 31 + j * 7919) % :members) + 1), 'follow', now() - (j % 500) * interval '1 hour'
  FROM generate_series(1, :members) n, generate_series(1, 25) j
 WHERE ((n * 31 + j * 7919) % :members) + 1 <> n
ON CONFLICT DO NOTHING;
INSERT INTO public.interactions (user_id, target_user_id, type)
SELECT pg_temp.mid(n), pg_temp.mid(2), 'follow' FROM generate_series(3, :members) n WHERE n % 3 = 0
ON CONFLICT DO NOTHING;
-- And one member (4) who follows 2,000: the following feed is timed for them too.
INSERT INTO public.interactions (user_id, target_user_id, type)
SELECT pg_temp.mid(4), pg_temp.mid(n), 'follow' FROM generate_series(10, 2009) n
ON CONFLICT DO NOTHING;

-- ── endorsements: ~2,000,000 on logs with words ───────────────────────────────
-- Two members each, never the same one twice: the house holds a member's certification of a
-- log once (20261023_01), so two drawn at random, which met now and then, made a house
-- production cannot be, and its key could not be built over it.
INSERT INTO public.interactions (user_id, target_log_id, type, created_at)
SELECT pg_temp.mid(1 + (l.first + e * 7919) % :members), l.id, 'endorse_log', l.created_at + interval '1 hour'
  FROM (SELECT id, created_at, floor(random() * :members)::int AS first FROM public.logs WHERE review IS NOT NULL) l,
       generate_series(1, 2) e;

-- ── watchlists: ~15 each ──────────────────────────────────────────────────────
-- In bigint: n * 104729 reaches 10.5 billion, past an integer's 2.1.
INSERT INTO public.watchlists (user_id, film_id, film_title, poster_path, year)
SELECT pg_temp.mid(n), ((n::bigint * 104729 + j * 7) % 30000) + 1, 'Film ' || (((n::bigint * 104729 + j * 7) % 30000) + 1), '/p.jpg', 1990
  FROM generate_series(1, :members) n, generate_series(1, 15) j
ON CONFLICT (user_id, film_id) DO NOTHING;

-- ── stacks: a tenth of the house keeps 1-10; ~15 films each ──────────────────
INSERT INTO public.lists (id, user_id, title, description, is_ranked, created_at)
SELECT gen_random_uuid(), pg_temp.mid(n), 'Stack ' || n || '-' || s, 'A stack for the load test.', (s % 2 = 0),
       now() - ((n + s) % 700) * interval '1 day'
  FROM generate_series(1, :members) n, generate_series(1, 1 + n % 10) s
 WHERE n % 10 = 1;
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position, poster_path)
-- In bigint: hashtext() spans the whole integer range, so adding to it (or
-- abs() of its lowest value) would overflow.
SELECT l.id, ((i * 4099 + abs(hashtext(l.id::text)::bigint)) % 30000) + 1, 'Film', i, '/p.jpg'
  FROM public.lists l, generate_series(1, 15) i
ON CONFLICT (list_id, film_id) DO NOTHING;

-- ── the Dispatch: 40,000 posts; one hot post with 20,000 critiques ───────────
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, full_content, created_at)
SELECT ('00000000-0000-4000-9000-' || lpad(to_hex(p), 12, '0'))::uuid,
       (ARRAY['take','seeking','dossier'])[1 + p % 3],
       pg_temp.mid(((p * 13) % :members) + 1), 'm' || (((p * 13) % :members) + 1),
       CASE WHEN p % 3 = 2 THEN 'An essay, number ' || p END,
       'A post for the load test, number ' || p || '.',
       CASE WHEN p % 3 = 2 THEN repeat('The long form, at length. ', 200) END,
       now() - (p % 3000) * interval '1 hour'
  FROM generate_series(1, 40000 * :scale) p;
INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body, created_at, certify_count)
SELECT ('00000000-0000-4000-9000-' || lpad(to_hex(1 + floor(random() * 40000 * :scale)::int), 12, '0'))::uuid,
       pg_temp.mid(u), 'm' || u, 'A critique for the load test.', now() - floor(random() * 3000) * interval '1 hour',
       floor(random() * 20)::int
  FROM (SELECT 1 + floor(random() * :members)::int AS u FROM generate_series(1, 400000 * :scale)) x;
INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body, created_at, certify_count)
SELECT ('00000000-0000-4000-9000-' || lpad(to_hex(1), 12, '0'))::uuid, pg_temp.mid(u), 'm' || u,
       'On the hot post.', now() - u * interval '1 second', u % 50
  FROM generate_series(3, 20002) u;
-- Twenty certifications a post, its k-th given k hours after the post was filed (never after now), as
-- production's are given across a post's life: dated all at the seed's minute, the day before the seed
-- would hold every certification the house ever gave, 800,000 at 100,000 members, as one day's regard.
INSERT INTO public.dispatch_certifications (user_id, post_id, created_at)
SELECT pg_temp.mid(u), ('00000000-0000-4000-9000-' || lpad(to_hex(p), 12, '0'))::uuid,
       LEAST(now(), now() - (p % 3000) * interval '1 hour' + k * interval '1 hour')
  FROM generate_series(1, 40000 * :scale) p,
       LATERAL (SELECT k, ((p * 7 + k * 15485863) % :members) + 1 AS u FROM generate_series(1, 20) k) x
ON CONFLICT DO NOTHING;
-- One series at the ceiling: 24 parts (MOST_PARTS) of 25,000 characters (essay_ceiling), its words
-- parted by every kind of space the app counts by, Arabic among them (the series page's read times).
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, full_content, series_id, series_title, part_number, created_at)
SELECT ('00000000-0000-4000-9100-' || lpad(to_hex(n), 12, '0'))::uuid, 'dossier', pg_temp.mid(7), 'm7',
       'Part ' || n, 'A part of the long series.',
       left(repeat('The long form, at' || chr(160) || 'length.' || chr(9) || 'مقال طويل' || chr(12288) || 'and on  ' || chr(10), 2000), 25000),
       '00000000-0000-4000-9200-000000000001'::uuid, 'The long series', n, now() - n * interval '1 day'
  FROM generate_series(1, 24) n;

-- ── the Lounge: 1,500 rooms; one with 200,000 messages ───────────────────────
INSERT INTO public.lounges (id, name, description, creator_id, is_private, member_count, max_members, created_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(r), 12, '0'))::uuid, 'Room ' || r, 'A room for the load test.',
       pg_temp.mid(((r * 61) % :members) + 1), (r % 5 = 0), 0, 500, now() - r * interval '1 hour'
  FROM generate_series(1, 1500 * :scale) r;
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(r), 12, '0'))::uuid, pg_temp.mid(((r * 61 + m * 977) % :members) + 1), 'approved',
       now() - (m % 48) * interval '1 hour'
  FROM generate_series(1, 1500 * :scale) r, generate_series(0, 39) m
ON CONFLICT DO NOTHING;
-- The whale sits in 200 rooms, so the unread counts have work to do.
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(r), 12, '0'))::uuid, pg_temp.mid(1), 'approved', now() - interval '3 days'
  FROM generate_series(1, 200) r
ON CONFLICT DO NOTHING;
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(1 + floor(random() * 1500 * :scale)::int), 12, '0'))::uuid,
       pg_temp.mid(1 + floor(random() * :members)::int), 'A word in the room.', now() - floor(random() * 100000) * interval '1 minute'
  FROM generate_series(1, 1300000 * :scale);
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(1), 12, '0'))::uuid, pg_temp.mid(((i * 61) % :members) + 1),
       'The busiest room in the house.', now() - i * interval '10 seconds'
  FROM generate_series(1, 200000) i;

-- ── critiques on logs, and the notices they all make ─────────────────────────
-- Each row draws its own member in the subquery's own list: a LATERAL that names nothing outside
-- it is run once, and would give every critique one author and every notice one reader and one
-- sender (e2e/__tests__/loadSeed.test.ts refuses a draw inside a LATERAL).
INSERT INTO public.log_comments (log_id, user_id, username, body, created_at)
SELECT l.id, pg_temp.mid(l.u), 'm' || l.u, 'A critique of a log.', l.created_at + interval '2 hours'
  FROM (SELECT id, created_at, 1 + floor(random() * :members)::int AS u
          FROM public.logs WHERE review IS NOT NULL ORDER BY id LIMIT 300000) l;
-- Never from the reader themselves: a sender drawn as the reader is the next member.
INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, created_at, is_read, group_key)
SELECT pg_temp.mid(t), (ARRAY['follow','endorse','comment'])[1 + k % 3], 'm' || f, pg_temp.mid(f),
       'm' || f || ' did something.', now() - k * interval '7 minutes', (k % 4 <> 0), 'load:' || (k % 1000)
  FROM (SELECT k, t, CASE WHEN d = t THEN d % :members + 1 ELSE d END AS f
          FROM (SELECT k, 1 + floor(random() * :members)::int AS t, 1 + floor(random() * :members)::int AS d
                  FROM generate_series(1, 2500000 * :scale) k) r) x;
INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, created_at, is_read)
SELECT pg_temp.mid(2), 'follow', 'm' || k, pg_temp.mid(k), 'm' || k || ' follows you.', now() - k * interval '1 minute', false
  FROM generate_series(3, 50000) k;

-- ── blocks and ballots ───────────────────────────────────────────────────────
-- One member in fifty blocks or mutes three others; the whale keeps 500 (the list a member reads whole).
INSERT INTO public.user_blocks (blocker_id, blocked_id, type, created_at)
SELECT pg_temp.mid(n), pg_temp.mid(((n * 37 + j * 7919) % :members) + 1), CASE WHEN j = 1 THEN 'mute' ELSE 'block' END,
       now() - (n % 400) * interval '1 hour'
  FROM generate_series(50, :members, 50) n, generate_series(1, 3) j
 WHERE ((n * 37 + j * 7919) % :members) + 1 <> n
ON CONFLICT DO NOTHING;
INSERT INTO public.user_blocks (blocker_id, blocked_id, type, created_at)
SELECT pg_temp.mid(1), pg_temp.mid(50000 + j), 'block', now() - j * interval '1 minute'
  FROM generate_series(1, 500) j
ON CONFLICT DO NOTHING;
-- 2,000 ballots of four choices (a tenth still open); the first, open, is the house's hot ballot: one
-- member in five has voted in it.
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, options, closes_at, created_at)
SELECT ('00000000-0000-4000-9300-' || lpad(to_hex(b), 12, '0'))::uuid, 'ballot',
       pg_temp.mid(((b * 17) % :members) + 1), 'm' || (((b * 17) % :members) + 1),
       'A ballot, number ' || b, 'Which of the four, number ' || b || '?',
       '["The first", "The second", "The third", "The fourth"]'::jsonb,
       CASE WHEN b % 10 = 1 THEN now() + interval '3 days' ELSE now() - (b % 300) * interval '1 hour' END,
       now() - (b % 3000) * interval '1 hour'
  FROM generate_series(1, 2000 * :scale) b;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index, created_at)
SELECT '00000000-0000-4000-9300-000000000001'::uuid, pg_temp.mid(n), n % 4, now() - (n % 3000) * interval '1 minute'
  FROM generate_series(5, :members, 5) n;
INSERT INTO public.dispatch_votes (post_id, user_id, option_index, created_at)
SELECT ('00000000-0000-4000-9300-' || lpad(to_hex(b), 12, '0'))::uuid, pg_temp.mid(((b * 101 + v * 7919) % :members) + 1), v % 4,
       now() - (b % 3000) * interval '1 hour'
  FROM generate_series(2, 2000 * :scale) b, generate_series(1, 25) v
ON CONFLICT DO NOTHING;

-- ── the Tribunal: two moderators, reports, verdicts, appeals, withheld pieces, sanctions ──
-- Members 3 and 6 are moderators. Reports in proportion to the house: 1,000 waiting and 9,000 settled
-- per 100,000 members, on members' logs; one log, the hot case, reported by 300.
UPDATE public.profiles SET role = 'admin' WHERE id IN (pg_temp.mid(3), pg_temp.mid(6));
INSERT INTO public.reports (id, reporter_id, content_type, content_id, reason, details, status, created_at, target_user_id)
SELECT ('00000000-0000-4000-b000-' || lpad(to_hex(r), 12, '0'))::uuid, pg_temp.mid(((r * 53) % :members) + 1), 'log', l.id::text,
       (ARRAY['spoiler_unmarked', 'harassment', 'spam', 'inappropriate', 'other'])[1 + r % 5], 'Reported for the load test.',
       CASE WHEN r % 10 = 0 THEN 'pending' ELSE 'resolved' END, now() - (r % 2000) * interval '1 hour', l.user_id
  FROM generate_series(1, 10000 * :scale) r
 CROSS JOIN LATERAL (SELECT x.id, x.user_id FROM public.logs x WHERE x.user_id = pg_temp.mid(((r * 29) % :members) + 1) ORDER BY x.id LIMIT 1) l;
INSERT INTO public.reports (id, reporter_id, content_type, content_id, reason, details, status, created_at, target_user_id)
SELECT ('00000000-0000-4000-b300-' || lpad(to_hex(k), 12, '0'))::uuid, pg_temp.mid(1000 + k), 'log', (SELECT id::text FROM public.logs WHERE user_id = pg_temp.mid(2) ORDER BY id LIMIT 1), 'harassment',
       'The hot case.', 'pending', now() - k * interval '1 minute', pg_temp.mid(2)
  FROM generate_series(1, 300) k;
-- A verdict on each settled report but one in nine, by member 6; a fifth of them appealed and waiting.
-- The whale is the target of 40, each on a log of its own withheld while the verdict stands: one every
-- seventeen hours, so all 40 are inside their thirty days, as the hourly expiry leaves a house.
INSERT INTO public.mod_actions (id, report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at, created_at,
                                appeal, appeal_filed_at, appeal_status)
SELECT ('00000000-0000-4000-b100-' || lpad(to_hex(r), 12, '0'))::uuid, ('00000000-0000-4000-b000-' || lpad(to_hex(r), 12, '0'))::uuid,
       pg_temp.mid(((r * 29) % :members) + 1), pg_temp.mid(6),
       (ARRAY['warn', 'delete_content', 'mute_user', 'suspend'])[1 + r % 4], 'A verdict for the load test.',
       CASE WHEN r % 4 IN (2, 3) THEN 72 END, CASE WHEN r % 4 IN (2, 3) THEN now() + interval '3 days' END,
       now() - (r % 2000) * interval '1 hour' + interval '1 hour',
       CASE WHEN r % 5 = 1 THEN 'I ask the Tribunal to hear me.' END,
       CASE WHEN r % 5 = 1 THEN now() - (r % 2000) * interval '1 minute' END,
       CASE WHEN r % 5 = 1 THEN 'pending' END
  FROM generate_series(1, 10000 * :scale) r
 WHERE r % 10 <> 0 AND r % 9 <> 0;
INSERT INTO public.mod_actions (id, target_user_id, admin_id, action, reason, created_at)
SELECT ('00000000-0000-4000-b200-' || lpad(to_hex(k), 12, '0'))::uuid, pg_temp.mid(1), pg_temp.mid(6), 'delete_content',
       'A verdict on the whale, number ' || k || '.', now() - k * interval '17 hours'
  FROM generate_series(1, 40) k;
INSERT INTO public.withheld_pieces (mod_action_id, kind, piece_id, author_id, withheld_at, delete_after)
SELECT ('00000000-0000-4000-b200-' || lpad(to_hex(w.k), 12, '0'))::uuid, 'log', w.id, pg_temp.mid(1), now() - w.k * interval '17 hours',
       now() + interval '30 days' - w.k * interval '17 hours'
  FROM (SELECT x.id, row_number() OVER (ORDER BY x.id) AS k FROM public.logs x WHERE x.user_id = pg_temp.mid(1) ORDER BY x.id LIMIT 40) w;
UPDATE public.logs SET withheld_at = w.withheld_at FROM public.withheld_pieces w WHERE w.kind = 'log' AND public.logs.id = w.piece_id;
-- Sanctions: one member in 200 suspended for a week, one in 1,000 banned (never a member a probe reads as).
UPDATE public.profiles SET suspended_until = now() + interval '7 days', suspension_reason = 'Suspended for the load test.'
 WHERE id IN (SELECT pg_temp.mid(n) FROM generate_series(207, :members, 200) n);
UPDATE public.profiles SET is_banned = true, banned_at = now(), ban_reason = 'Banned for the load test.'
 WHERE id IN (SELECT pg_temp.mid(n) FROM generate_series(1013, :members, 1000) n);

-- ── what the triggers would have made ────────────────────────────────────────
SET session_replication_role = origin;

UPDATE public.profiles p SET followers_count = c.n
  FROM (SELECT target_user_id AS id, count(*) AS n FROM public.interactions WHERE type = 'follow' GROUP BY 1) c
 WHERE p.id = c.id;
UPDATE public.profiles p SET following_count = c.n
  FROM (SELECT user_id AS id, count(*) AS n FROM public.interactions WHERE type = 'follow' GROUP BY 1) c
 WHERE p.id = c.id;
UPDATE public.profiles p SET total_logs = c.n, last_log_date = c.last
  FROM (SELECT user_id AS id, count(*) AS n, max(watched_date) AS last FROM public.logs GROUP BY 1) c
 WHERE p.id = c.id;
UPDATE public.films f SET log_count = c.n, rating_count = c.rated, avg_rating = c.avg
  FROM (SELECT film_id AS id, count(*) AS n, count(*) FILTER (WHERE rating > 0) AS rated,
               round(avg(rating) FILTER (WHERE rating > 0), 2) AS avg
          FROM public.logs GROUP BY 1) c
 WHERE f.id = c.id;
UPDATE public.dispatch_posts d SET comment_count = c.n
  FROM (SELECT post_id AS id, count(*) AS n FROM public.dispatch_comments GROUP BY 1) c WHERE d.id = c.id;
UPDATE public.dispatch_posts d SET certify_count = c.n
  FROM (SELECT post_id AS id, count(*) AS n FROM public.dispatch_certifications WHERE post_id IS NOT NULL GROUP BY 1) c WHERE d.id = c.id;
UPDATE public.lounges l SET member_count = c.n
  FROM (SELECT lounge_id AS id, count(*) AS n FROM public.lounge_members WHERE status = 'approved' GROUP BY 1) c WHERE l.id = c.id;
-- Each log's certifications and critiques, as 20261003_03 counted them and its triggers keep them.
INSERT INTO public.log_counts (log_id, certify_count, critique_count)
SELECT x.log_id, sum(x.certify)::integer, sum(x.critique)::integer FROM (
  SELECT i.target_log_id AS log_id, 1 AS certify, 0 AS critique
    FROM public.interactions i WHERE i.type = 'endorse_log' AND i.target_log_id IS NOT NULL
  UNION ALL
  SELECT c.log_id, 0, 1 FROM public.log_comments c
) x
GROUP BY x.log_id
ON CONFLICT (log_id) DO UPDATE SET certify_count = EXCLUDED.certify_count, critique_count = EXCLUDED.critique_count;
-- Each ballot's votes by option, as 20261122_27 counted them and its trigger keeps them (the closing
-- below freezes the totals from these counts).
INSERT INTO private.ballot_counts (post_id, option_index, n)
SELECT v.post_id, v.option_index, count(*) FROM public.dispatch_votes v GROUP BY v.post_id, v.option_index
ON CONFLICT (post_id, option_index) DO UPDATE SET n = EXCLUDED.n;
-- The members' pieces of three listed as 20261122_62's job lists them: the copy was built with the
-- fill complete over no member, and the members laid since were never queued; so the lists start
-- again from the first member and the job's runs are made until it marks them complete.
UPDATE private.member_grams_filled SET after = NULL, members = 0, complete = false, ended = NULL;
DELETE FROM private.member_grams;
DELETE FROM private.member_gram_heads;
DELETE FROM private.member_grams_waiting;
DO $$
BEGIN
  WHILE private.member_grams_fill(5000) <> 'complete' LOOP
  END LOOP;
END $$;

-- ── what the house's schedule would have done ───────────────────────────────
-- Each job production schedules (supabase/schema/live-outside-public.sql), run once as its schedule runs
-- it, so the house is as production holds it between two runs: the Lobby's edition chosen, every closed
-- ballot frozen and its voters told, every withheld piece past its thirty days gone, the job history
-- trimmed. Left to the schedule, its first run after the seed would do all of it in one transaction
-- (1,800 ballots frozen and, where closing a ballot tells its voters in the same write, 45,000 notices
-- written at 100,000 members, about half a minute), a backlog
-- production never holds; an index built CONCURRENTLY waits for every transaction older than it, so the
-- train's builds would be cancelled at their lock wait while that run lasts.
SELECT public.lobby_choose_edition() AS lobby_edition_rows;
-- Where the schedule draws the edition up a step at a time (private.lobby_edition_begun, every hour, and
-- its job private.lobby_edition_drafted every second while a draft waits), the hourly job run as the
-- schedule runs it, then its steps to the end.
DO $$
BEGIN
  IF to_regprocedure('private.lobby_edition_begun()') IS NOT NULL THEN
    EXECUTE 'SELECT private.lobby_edition_begun();';
    WHILE EXISTS (SELECT 1 FROM private.lobby_drafts) LOOP
      PERFORM private.lobby_edition_drafted(1000000);
    END LOOP;
  END IF;
END $$;
SELECT public.freeze_closed_ballots() AS ballots_frozen;
-- Where the house tells a closed ballot's voters by a job of its own (private.closed_ballots_told, every
-- second while a ballot waits), every voter of the ballots just closed told now, as its runs would tell
-- them within minutes.
DO $$
BEGIN
  IF to_regprocedure('private.closed_ballots_told(integer)') IS NOT NULL THEN
    WHILE EXISTS (SELECT 1 FROM private.ballot_notices_waiting) LOOP
      PERFORM private.closed_ballots_told(100000);
    END LOOP;
  END IF;
END $$;
SELECT public.expire_withheld_pieces() AS withheld_pieces_expired;
DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days';
-- The pushes those notices queued were sent long ago on production, whose queue is drained as it fills:
-- left here, pg_net would work through tens of thousands of them while the rehearsals count the pushes
-- their own cases queue.
DELETE FROM net.http_request_queue;

VACUUM ANALYZE;

SELECT 'members' AS what, count(*) FROM public.profiles
UNION ALL SELECT 'logs', count(*) FROM public.logs
UNION ALL SELECT 'follows', count(*) FROM public.interactions WHERE type = 'follow'
UNION ALL SELECT 'endorsements', count(*) FROM public.interactions WHERE type = 'endorse_log'
UNION ALL SELECT 'watchlist rows', count(*) FROM public.watchlists
UNION ALL SELECT 'stacks', count(*) FROM public.lists
UNION ALL SELECT 'stack films', count(*) FROM public.list_items
UNION ALL SELECT 'dispatch posts', count(*) FROM public.dispatch_posts
UNION ALL SELECT 'critiques', count(*) FROM public.dispatch_comments
UNION ALL SELECT 'lounge messages', count(*) FROM public.lounge_messages
UNION ALL SELECT 'notifications', count(*) FROM public.notifications;
