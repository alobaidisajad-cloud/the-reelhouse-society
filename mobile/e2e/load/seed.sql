-- ════════════════════════════════════════════════════════════════════════════
-- e2e/load/seed.sql — a house of 100,000 members, for the load test (load.yml).
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
  FROM generate_series(1, 100000) n;

INSERT INTO public.profiles (id, username, role, tier, email, is_social_private, created_at, preferences, display_name, bio)
SELECT pg_temp.mid(n), 'm' || n,
       CASE WHEN n % 33 = 0 THEN 'auteur' WHEN n % 10 = 0 THEN 'archivist' ELSE 'cinephile' END,
       CASE WHEN n % 33 = 0 THEN 'auteur' WHEN n % 10 = 0 THEN 'archivist' ELSE 'cinephile' END,
       'm' || n || '@load.test', (n % 20 = 7), now() - (n % 1000) * interval '1 day', '{}'::jsonb,
       'Member ' || n, 'A member of the load test.'
  FROM generate_series(1, 100000) n;
-- The whale and the celebrity are Auteurs, public.
UPDATE public.profiles SET role = 'auteur', tier = 'auteur', is_social_private = false WHERE id IN (pg_temp.mid(1), pg_temp.mid(2));

-- ── logs: lopsided; each member's films distinct (logs_user_id_film_id_key) ───
CREATE TEMP TABLE load_counts AS
SELECT n, CASE WHEN n = 1 THEN 10000
               WHEN r < 0.03 THEN 80 + floor(random() * 1500)::int
               WHEN r < 0.25 THEN 15 + floor(random() * 65)::int
               ELSE floor(random() * 15)::int END AS logs
  FROM (SELECT n, random() AS r FROM generate_series(1, 100000) n) x;

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
       LATERAL (SELECT CASE WHEN k = 1 AND c.n % 2 = 0 THEN 1 ELSE ((c.n * 7919 + k * 14729) % 30000) + 1 END AS film) f
ON CONFLICT (user_id, film_id) DO NOTHING;

-- Every log has its first viewing (logs_register_viewings makes it).
INSERT INTO public.viewings (viewing_id, log_id)
SELECT viewing_id, id FROM public.logs;

-- ── follows: ~25 each; a third of the house follows the celebrity ─────────────
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
SELECT pg_temp.mid(n), pg_temp.mid(((n * 31 + j * 7919) % 100000) + 1), 'follow', now() - (j % 500) * interval '1 hour'
  FROM generate_series(1, 100000) n, generate_series(1, 25) j
 WHERE ((n * 31 + j * 7919) % 100000) + 1 <> n
ON CONFLICT DO NOTHING;
INSERT INTO public.interactions (user_id, target_user_id, type)
SELECT pg_temp.mid(n), pg_temp.mid(2), 'follow' FROM generate_series(3, 100000) n WHERE n % 3 = 0
ON CONFLICT DO NOTHING;
-- And one member (4) who follows 2,000: the following feed is timed for them too.
INSERT INTO public.interactions (user_id, target_user_id, type)
SELECT pg_temp.mid(4), pg_temp.mid(n), 'follow' FROM generate_series(10, 2009) n
ON CONFLICT DO NOTHING;

-- ── endorsements: ~2,000,000 on logs with words ───────────────────────────────
INSERT INTO public.interactions (user_id, target_log_id, type, created_at)
SELECT pg_temp.mid(1 + floor(random() * 100000)::int), l.id, 'endorse_log', l.created_at + interval '1 hour'
  FROM (SELECT id, created_at FROM public.logs WHERE review IS NOT NULL) l,
       generate_series(1, 2) e;

-- ── watchlists: ~15 each ──────────────────────────────────────────────────────
-- In bigint: n * 104729 reaches 10.5 billion, past an integer's 2.1.
INSERT INTO public.watchlists (user_id, film_id, film_title, poster_path, year)
SELECT pg_temp.mid(n), ((n::bigint * 104729 + j * 7) % 30000) + 1, 'Film ' || (((n::bigint * 104729 + j * 7) % 30000) + 1), '/p.jpg', 1990
  FROM generate_series(1, 100000) n, generate_series(1, 15) j
ON CONFLICT (user_id, film_id) DO NOTHING;

-- ── stacks: a tenth of the house keeps 1-10; ~15 films each ──────────────────
INSERT INTO public.lists (id, user_id, title, description, is_ranked, created_at)
SELECT gen_random_uuid(), pg_temp.mid(n), 'Stack ' || n || '-' || s, 'A stack for the load test.', (s % 2 = 0),
       now() - ((n + s) % 700) * interval '1 day'
  FROM generate_series(1, 100000) n, generate_series(1, 1 + n % 10) s
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
       pg_temp.mid(((p * 13) % 100000) + 1), 'm' || (((p * 13) % 100000) + 1),
       CASE WHEN p % 3 = 2 THEN 'An essay, number ' || p END,
       'A post for the load test, number ' || p || '.',
       CASE WHEN p % 3 = 2 THEN repeat('The long form, at length. ', 200) END,
       now() - (p % 3000) * interval '1 hour'
  FROM generate_series(1, 40000) p;
INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body, created_at, certify_count)
SELECT ('00000000-0000-4000-9000-' || lpad(to_hex(1 + floor(random() * 40000)::int), 12, '0'))::uuid,
       pg_temp.mid(u), 'm' || u, 'A critique for the load test.', now() - floor(random() * 3000) * interval '1 hour',
       floor(random() * 20)::int
  FROM (SELECT 1 + floor(random() * 100000)::int AS u FROM generate_series(1, 400000)) x;
INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body, created_at, certify_count)
SELECT ('00000000-0000-4000-9000-' || lpad(to_hex(1), 12, '0'))::uuid, pg_temp.mid(u), 'm' || u,
       'On the hot post.', now() - u * interval '1 second', u % 50
  FROM generate_series(3, 20002) u;
INSERT INTO public.dispatch_certifications (user_id, post_id)
SELECT pg_temp.mid(u), ('00000000-0000-4000-9000-' || lpad(to_hex(p), 12, '0'))::uuid
  FROM generate_series(1, 40000) p, LATERAL (SELECT ((p * 7 + k * 15485863) % 100000) + 1 AS u FROM generate_series(1, 20) k) x
ON CONFLICT DO NOTHING;

-- ── the Lounge: 1,500 rooms; one with 200,000 messages ───────────────────────
INSERT INTO public.lounges (id, name, description, creator_id, is_private, member_count, max_members, created_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(r), 12, '0'))::uuid, 'Room ' || r, 'A room for the load test.',
       pg_temp.mid(((r * 61) % 100000) + 1), (r % 5 = 0), 0, 500, now() - r * interval '1 hour'
  FROM generate_series(1, 1500) r;
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(r), 12, '0'))::uuid, pg_temp.mid(((r * 61 + m * 977) % 100000) + 1), 'approved',
       now() - (m % 48) * interval '1 hour'
  FROM generate_series(1, 1500) r, generate_series(0, 39) m
ON CONFLICT DO NOTHING;
-- The whale sits in 200 rooms, so the unread counts have work to do.
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(r), 12, '0'))::uuid, pg_temp.mid(1), 'approved', now() - interval '3 days'
  FROM generate_series(1, 200) r
ON CONFLICT DO NOTHING;
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(1 + floor(random() * 1500)::int), 12, '0'))::uuid,
       pg_temp.mid(1 + floor(random() * 100000)::int), 'A word in the room.', now() - floor(random() * 100000) * interval '1 minute'
  FROM generate_series(1, 1300000);
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
SELECT ('00000000-0000-4000-a000-' || lpad(to_hex(1), 12, '0'))::uuid, pg_temp.mid(((i * 61) % 100000) + 1),
       'The busiest room in the house.', now() - i * interval '10 seconds'
  FROM generate_series(1, 200000) i;

-- ── critiques on logs, and the notices they all make ─────────────────────────
INSERT INTO public.log_comments (log_id, user_id, username, body, created_at)
SELECT l.id, pg_temp.mid(u), 'm' || u, 'A critique of a log.', l.created_at + interval '2 hours'
  FROM (SELECT id, created_at FROM public.logs WHERE review IS NOT NULL ORDER BY id LIMIT 300000) l,
       LATERAL (SELECT 1 + floor(random() * 100000)::int AS u) x;
INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, created_at, is_read, group_key)
SELECT pg_temp.mid(t), (ARRAY['follow','endorse','comment'])[1 + k % 3], 'm' || f, pg_temp.mid(f),
       'm' || f || ' did something.', now() - k * interval '7 minutes', (k % 4 <> 0), 'load:' || (k % 1000)
  FROM generate_series(1, 2500000) k,
       LATERAL (SELECT 1 + floor(random() * 100000)::int AS t, 1 + floor(random() * 100000)::int AS f) x;
INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, created_at, is_read)
SELECT pg_temp.mid(2), 'follow', 'm' || k, pg_temp.mid(k), 'm' || k || ' follows you.', now() - k * interval '1 minute', false
  FROM generate_series(3, 50000) k;

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

-- The Lobby's hourly edition, as the cron job makes it.
SELECT public.lobby_choose_edition() AS lobby_edition_rows;

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
