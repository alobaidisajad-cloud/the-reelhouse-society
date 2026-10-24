#!/usr/bin/env node
/**
 * lab-seed.mjs — the speed lab's signed-in house (WORKLIST P0.104): enough of every list a member
 * scrolls that a timed scroll never runs off its end. Run after seed.mjs, on the sealed world's
 * local stack only.
 *
 *   node e2e/db/lab-seed.mjs <ids file>      (API_URL, SERVICE_ROLE_KEY and LAB_DB_URL)
 *
 * The seeded member (e2e_member) is given the Archivist rank as production gives one
 * (grant_entitlement), so the salon is theirs to read. Then, as the load test's seed lays rows down
 * (e2e/load/seed.sql: triggers off, then everything they would have made made at the end):
 *   · 60 members, each with eight films logged with words (the Reel), followed by the member;
 *   · a salon the member sits in, with 320 messages;
 *   · the member's own stack of every recorded film (61);
 *   · the member's first log with 60 comments, one from each member (seven screen heights: 25 were three, the scroll judge's edge);
 *   · 30 Dispatch filings;
 *   · the member's own profile: every recorded film logged (its archive room), and a portrait.
 * Every film is one the sealed world holds a recording of, with its real poster, so a scroll
 * decodes the pictures a member's would. The seed's own check counts each and fails below its
 * number, naming it; the ids the lab opens (the salon, the stack, the log) go to <ids file>.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(HERE, '..', 'supabase', 'functions', 'tmdb-proxy', 'fixtures');

/** The least of each list the lab scrolls; the check fails below any. */
export const AT_LEAST = { reel: 300, salon: 300, stack: 60, comments: 50, filings: 20, own_logs: 60, portrait: 1 };
const MEMBERS = 60;

/** Every recorded film with a poster: [id, title, year, poster], in id order. */
export function recordedFilms(dir = FIXTURES) {
  const seen = new Map();
  for (const f of readdirSync(dir).filter((n) => /^(discover|trending)_/.test(n))) {
    const body = JSON.parse(readFileSync(join(dir, f), 'utf8')).body ?? {};
    for (const r of body.results ?? []) {
      if (r.id && r.poster_path && (r.title || r.name)) seen.set(r.id, [r.id, r.title ?? r.name, (r.release_date ?? '').slice(0, 4), r.poster_path]);
    }
  }
  return [...seen.values()].sort((a, b) => a[0] - b[0]);
}

const q = (s) => `'${String(s).split("'").join("''")}'`;

/** The seed's SQL, as one script for psql. */
export function seedSql(films) {
  const values = films.map(([id, title, year, poster]) => `(${id}, ${q(title)}, ${q(year)}, ${q(poster)})`).join(',\n  ');
  return `\\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE lab_films (n serial, id int, title text, year text, poster text) ON COMMIT DROP;
INSERT INTO lab_films (id, title, year, poster) VALUES
  ${values};
CREATE TEMP TABLE lab_me ON COMMIT DROP AS SELECT id FROM public.profiles WHERE username = 'e2e_member';
DO $$ BEGIN IF (SELECT count(*) FROM lab_me) <> 1 THEN RAISE EXCEPTION 'lab seed: no e2e_member (run seed.mjs first)'; END IF; END $$;
CREATE FUNCTION pg_temp.lid(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT ('00000000-0000-4000-b000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
CREATE FUNCTION pg_temp.poster(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'https://image.tmdb.org/t/p/w185' || p $$;

INSERT INTO public.films (id, title, year, poster_path, synced_at)
SELECT id, title, nullif(year, '')::int, poster, now() FROM lab_films ON CONFLICT (id) DO NOTHING;

-- ── the members ──
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT pg_temp.lid(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'lab' || n || '@e2e.test', jsonb_build_object('username', 'lab_' || lpad(n::text, 2, '0')), '{"provider":"email"}'::jsonb,
       now() - n * interval '3 days', now(), now()
  FROM generate_series(1, ${MEMBERS}) n;
INSERT INTO public.profiles (id, username, role, tier, email, is_social_private, created_at, preferences, display_name, bio, avatar_url)
SELECT pg_temp.lid(n), 'lab_' || lpad(n::text, 2, '0'), 'archivist', 'archivist', 'lab' || n || '@e2e.test', false,
       now() - n * interval '3 days', '{}'::jsonb, 'Lab Member ' || n, 'A member of the speed lab.',
       pg_temp.poster((SELECT poster FROM lab_films WHERE lab_films.n = 1 + n % (SELECT count(*) FROM lab_films)))
  FROM generate_series(1, ${MEMBERS}) n;

-- ── the Reel: eight films each, with words ──
INSERT INTO public.logs (user_id, film_id, film_title, rating, review, watched_date, created_at, poster_path, year, status, view_count, viewing_history)
SELECT pg_temp.lid(m), f.id, f.title, (1 + (m + k) % 10) / 2.0,
       'A considered word on ' || f.title || ', from the lab. ' || repeat('The picture holds. ', 1 + (m * k) % 5),
       current_date - (m + k), now() - ((m * 8 + k) * interval '37 minutes'), f.poster, f.year, 'watched', 1, '[]'::jsonb
  FROM generate_series(1, ${MEMBERS}) m, generate_series(1, 8) k,
       LATERAL (SELECT * FROM lab_films WHERE lab_films.n = 1 + (m * 7 + k * 11) % (SELECT count(*) FROM lab_films)) f
ON CONFLICT (user_id, film_id) DO NOTHING;
-- The member's own shelf: every recorded film.
INSERT INTO public.logs (user_id, film_id, film_title, rating, review, watched_date, created_at, poster_path, year, status, view_count, viewing_history)
SELECT (SELECT id FROM lab_me), f.id, f.title, (1 + f.n % 10) / 2.0,
       CASE WHEN f.n % 3 = 0 THEN 'My own word on ' || f.title || '.' END,
       current_date - f.n, now() - f.n * interval '5 hours', f.poster, f.year, 'watched', 1, '[]'::jsonb
  FROM lab_films f
ON CONFLICT (user_id, film_id) DO NOTHING;
INSERT INTO public.viewings (viewing_id, log_id)
SELECT l.viewing_id, l.id FROM public.logs l WHERE NOT EXISTS (SELECT 1 FROM public.viewings v WHERE v.log_id = l.id);
UPDATE public.profiles SET avatar_url = pg_temp.poster((SELECT poster FROM lab_films WHERE n = 1)) WHERE id = (SELECT id FROM lab_me);

-- ── follows: the member follows all, and is followed back ──
INSERT INTO public.interactions (user_id, target_user_id, type)
SELECT (SELECT id FROM lab_me), pg_temp.lid(n), 'follow' FROM generate_series(1, ${MEMBERS}) n
UNION ALL SELECT pg_temp.lid(n), (SELECT id FROM lab_me), 'follow' FROM generate_series(1, ${MEMBERS}) n
ON CONFLICT DO NOTHING;

-- ── the member's long stack: every recorded film, in order ──
INSERT INTO public.lists (id, user_id, title, description, is_ranked)
VALUES ('00000000-0000-4000-b100-000000000001', (SELECT id FROM lab_me), 'The Lab''s Long Stack', 'Every film the house holds a recording of.', true);
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position, poster_path)
SELECT '00000000-0000-4000-b100-000000000001', id, title, n, poster FROM lab_films;

-- ── the salon: the member sits in it, with 320 messages ──
INSERT INTO public.lounges (id, name, description, creator_id, is_private, member_count, max_members)
VALUES ('00000000-0000-4000-b200-000000000001', 'The Lab Salon', 'Where the speed lab talks.', pg_temp.lid(1), false, 0, 500);
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT '00000000-0000-4000-b200-000000000001'::uuid, pg_temp.lid(n), 'approved', now() - interval '1 day' FROM generate_series(1, ${MEMBERS}) n
UNION ALL SELECT '00000000-0000-4000-b200-000000000001'::uuid, (SELECT id FROM lab_me), 'approved', now() - interval '1 day';
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
SELECT '00000000-0000-4000-b200-000000000001', pg_temp.lid(1 + i % ${MEMBERS}),
       'Message ' || i || ' in the salon. ' || repeat('Words about the picture. ', 1 + i % 4), now() - (320 - i) * interval '3 minutes'
  FROM generate_series(1, 320) i;

-- ── the member's first log, with 60 comments ──
CREATE TEMP TABLE lab_log ON COMMIT DROP AS
SELECT id FROM public.logs WHERE user_id = (SELECT id FROM lab_me) AND review IS NOT NULL ORDER BY created_at DESC, id LIMIT 1;
INSERT INTO public.log_comments (log_id, user_id, username, body, created_at)
SELECT (SELECT id FROM lab_log), pg_temp.lid(c), 'lab_' || lpad(c::text, 2, '0'),
       'Comment ' || c || ': ' || repeat('a reply worth reading. ', 1 + c % 3), now() - (60 - c) * interval '11 minutes'
  FROM generate_series(1, 60) c;

-- ── the Dispatch: 30 filings ──
INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, created_at)
SELECT 'take', pg_temp.lid(1 + p % ${MEMBERS}), 'lab_' || lpad((1 + p % ${MEMBERS})::text, 2, '0'),
       'Filing ' || p || ' from the lab: ' || repeat('a take on the week''s pictures. ', 1 + p % 4), now() - p * interval '47 minutes'
  FROM generate_series(1, 30) p;

-- ── what the triggers would have made ──
SET LOCAL session_replication_role = origin;
INSERT INTO public.log_counts (log_id, critique_count)
SELECT log_id, count(*) FROM public.log_comments GROUP BY log_id
ON CONFLICT (log_id) DO UPDATE SET critique_count = EXCLUDED.critique_count;
UPDATE public.profiles p SET followers_count = c.n
  FROM (SELECT target_user_id AS id, count(*) AS n FROM public.interactions WHERE type = 'follow' GROUP BY 1) c WHERE p.id = c.id;
UPDATE public.profiles p SET following_count = c.n
  FROM (SELECT user_id AS id, count(*) AS n FROM public.interactions WHERE type = 'follow' GROUP BY 1) c WHERE p.id = c.id;
UPDATE public.profiles p SET total_logs = c.n, last_log_date = c.last
  FROM (SELECT user_id AS id, count(*) AS n, max(watched_date) AS last FROM public.logs GROUP BY 1) c WHERE p.id = c.id;
UPDATE public.lounges l SET member_count = c.n
  FROM (SELECT lounge_id AS id, count(*) AS n FROM public.lounge_members WHERE status = 'approved' GROUP BY 1) c WHERE l.id = c.id;
UPDATE public.films f SET log_count = c.n, rating_count = c.rated, avg_rating = c.avg
  FROM (SELECT film_id AS id, count(*) AS n, count(*) FILTER (WHERE rating > 0) AS rated,
               round(avg(rating) FILTER (WHERE rating > 0), 2) AS avg FROM public.logs GROUP BY 1) c WHERE f.id = c.id;
COMMIT;
SELECT public.lobby_choose_edition() AS lobby_edition_rows;

-- The seed's own check: each count, and the ids the lab opens.
SELECT json_build_object(
  'reel', (SELECT count(*) FROM public.logs l JOIN public.profiles p ON p.id = l.user_id WHERE p.username LIKE 'lab\\_%' AND l.review <> ''),
  'salon', (SELECT count(*) FROM public.lounge_messages WHERE lounge_id = '00000000-0000-4000-b200-000000000001'),
  'stack', (SELECT count(*) FROM public.list_items WHERE list_id = '00000000-0000-4000-b100-000000000001'),
  'comments', (SELECT max(n) FROM (SELECT count(*) AS n FROM public.log_comments c JOIN public.logs l ON l.id = c.log_id
                 JOIN public.profiles p ON p.id = l.user_id WHERE p.username = 'e2e_member' GROUP BY c.log_id) x),
  'filings', (SELECT count(*) FROM public.dispatch_posts WHERE author_username LIKE 'lab\\_%'),
  'own_logs', (SELECT count(*) FROM public.logs l JOIN public.profiles p ON p.id = l.user_id WHERE p.username = 'e2e_member'),
  'portrait', (SELECT count(*) FROM public.profiles WHERE username = 'e2e_member' AND avatar_url IS NOT NULL),
  'ids', json_build_object(
    'salon', '00000000-0000-4000-b200-000000000001',
    'stack', '00000000-0000-4000-b100-000000000001',
    'log', (SELECT c.log_id FROM public.log_comments c JOIN public.logs l ON l.id = c.log_id JOIN public.profiles p ON p.id = l.user_id
             WHERE p.username = 'e2e_member' GROUP BY c.log_id ORDER BY count(*) DESC LIMIT 1),
    'member', 'e2e_member'))::text AS lab;
`;
}

/** Each count below its least, said by name ([] when all are met). */
export const shortOf = (counts) => Object.entries(AT_LEAST)
  .filter(([what, least]) => !(Number(counts[what]) >= least))
  .map(([what, least]) => `${what}: ${counts[what] ?? 'none'}, at least ${least} needed`);

async function main() {
  const out = process.argv[2];
  const API = process.env.API_URL;
  const SERVICE = process.env.SERVICE_ROLE_KEY;
  const DB = process.env.LAB_DB_URL;
  if (!out || !API || !SERVICE || !DB) {
    console.error('usage: node e2e/db/lab-seed.mjs <ids file>, with API_URL, SERVICE_ROLE_KEY and LAB_DB_URL');
    process.exit(2);
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API) || !/@(127\.0\.0\.1|localhost):/.test(DB)) {
    console.error('Refusing: the lab seed only ever runs against a local stack.');
    process.exit(2);
  }
  // The Archivist rank, as production grants one.
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  const who = await fetch(`${API}/rest/v1/profiles?username=eq.e2e_member&select=id`, { headers }).then((r) => r.json());
  if (!Array.isArray(who) || who.length !== 1) { console.error('lab seed: no e2e_member (run seed.mjs first)'); process.exit(1); }
  const granted = await fetch(`${API}/rest/v1/rpc/grant_entitlement`, {
    method: 'POST', headers, body: JSON.stringify({ p_user_id: who[0].id, p_tier: 'archivist', p_source: 'manual' }),
  });
  const g = await granted.json().catch(() => null);
  const tier = Array.isArray(g) ? g[0]?.out_tier : g?.out_tier;
  if (!granted.ok || tier !== 'archivist') { console.error(`lab seed: the Archivist rank was not given: HTTP ${granted.status} ${JSON.stringify(g).slice(0, 200)}`); process.exit(1); }

  const films = recordedFilms();
  if (films.length < AT_LEAST.stack) { console.error(`lab seed: ${films.length} recorded films, ${AT_LEAST.stack} needed`); process.exit(1); }
  const r = spawnSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: seedSql(films), encoding: 'utf8', maxBuffer: 1e8 });
  // psql's own words, whatever it says: an error names its line.
  process.stderr.write(r.stderr ?? '');
  if (r.status !== 0) { console.error(`lab seed: psql exited ${r.status}`); process.exit(1); }
  const line = (r.stdout ?? '').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{"reel"')).pop();
  if (!line) { console.error(`lab seed: no count came back:\n${r.stdout}`); process.exit(1); }
  const counts = JSON.parse(line);
  const short = shortOf(counts);
  console.log(`lab seed: ${Object.keys(AT_LEAST).map((k) => `${k} ${counts[k]}`).join(', ')}`);
  if (short.length) { console.error(`lab seed: too little to scroll:\n${short.join('\n')}`); process.exit(1); }
  writeFileSync(out, `${JSON.stringify(counts.ids, null, 2)}\n`);
}

// `--films`, or `--short` and counts as JSON: the pool and the judgement alone, nothing run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--films') console.log(JSON.stringify(recordedFilms()));
  else if (process.argv[2] === '--short') console.log(JSON.stringify(shortOf(JSON.parse(process.argv[3]))));
  else await main();
}
