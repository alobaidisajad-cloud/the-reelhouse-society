#!/usr/bin/env node
/**
 * probe.mjs — every busy screen's reads, timed against a house of 100,000
 * members (seed.sql), each against its budget.
 *
 * Each read runs as the app runs it: as a signed-in member (role
 * authenticated, their JWT claims), through the same row rules, for the member
 * it is hardest for — the whale with 10,000 films, the celebrity a third of
 * the house follows, the Lounge with 200,000 messages. One untimed run warms
 * the cache, then five are timed by the database itself (EXPLAIN ANALYZE's
 * execution time, so the runner's process start never counts) and the median
 * is held to the budget. A read over budget fails the run and prints its plan.
 *
 * Writes go to $GITHUB_STEP_SUMMARY when it is set. Run on the CI runner only:
 * it refuses any database but the runner's own.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const DB = process.env.LOAD_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!/@(127\.0\.0\.1|localhost):/.test(DB)) {
  console.error(`Refusing to probe ${DB.replace(/:[^:@/]+@/, ':***@')}: the load test only ever runs against the runner's own database.`);
  process.exit(2);
}

const mid = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const WHALE = mid(1);
const CELEBRITY = mid(2);
const MEMBER = mid(5000);
const HOT_LOUNGE = '00000000-0000-4000-a000-000000000001';
const HOT_POST = '00000000-0000-4000-9000-000000000001';

/** The budget, in milliseconds of database time, for a read a screen waits on. */
const BUDGET = 100;

const PROBES = [
  // The Lobby
  { screen: 'Lobby', what: 'the day\'s wall (get_lobby)', as: MEMBER, sql: 'SELECT public.get_lobby()' },
  // The Reel
  { screen: 'Reel', what: 'the house feed, first page', as: MEMBER, sql: 'SELECT * FROM public.get_community_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'the following feed, first page (follows ~25)', as: MEMBER, sql: 'SELECT * FROM public.get_following_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'the following feed, for a member who follows the celebrity', as: mid(3), sql: 'SELECT * FROM public.get_following_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'the following feed, for a member who follows 2,000', as: mid(4), sql: 'SELECT * FROM public.get_following_feed_auth_cursor(40)' },
  { screen: 'Reel', what: 'stacks, first page', as: MEMBER, sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('', false, 60)" },
  { screen: 'Reel', what: 'stacks, searched', as: MEMBER, sql: "SELECT * FROM public.get_filtered_stacks_auth_cursor_v2('stack 12', false, 60)" },
  // A member's file
  { screen: 'Profile', what: 'the counts, of the whale', as: MEMBER, sql: `SELECT public.get_profile_counts('${WHALE}')` },
  { screen: 'Profile', what: 'the honours and passport, of the whale', as: MEMBER, sql: `SELECT public.get_public_profile_analytics('${WHALE}')` },
  { screen: 'Profile', what: 'the projector room, of the whale', as: WHALE, sql: `SELECT public.get_user_analytics('${WHALE}')` },
  { screen: 'Profile', what: 'the taste profile, of the whale', as: MEMBER, sql: `SELECT public.get_taste_profile('${WHALE}')` },
  { screen: 'Profile', what: 'the Archive, first page, of the whale', as: MEMBER,
    sql: `SELECT id, film_id, film_title, rating, watched_date, status FROM public.logs WHERE user_id = '${WHALE}' ORDER BY watched_date DESC NULLS LAST, id DESC LIMIT 50` },
  { screen: 'Profile', what: 'the Ledger at one rating chip, of the whale', as: MEMBER,
    sql: `SELECT id, film_id, film_title, rating, review FROM public.logs WHERE user_id = '${WHALE}' AND rating >= 3 AND rating < 4 ORDER BY watched_date DESC NULLS LAST, id DESC LIMIT 50` },
  { screen: 'Profile', what: 'HIGHEST RATED over the whole record, of the whale', as: MEMBER,
    sql: `SELECT id, film_id, film_title, rating FROM public.logs WHERE user_id = '${WHALE}' AND rating >= 4 ORDER BY rating DESC, watched_date DESC NULLS LAST, id DESC LIMIT 6` },
  { screen: 'Profile', what: 'the Ledger searched, of the whale', as: MEMBER,
    sql: `SELECT id FROM public.logs WHERE user_id = '${WHALE}' AND (film_title ILIKE '%film 12%' OR review ILIKE '%film 12%') ORDER BY watched_date DESC NULLS LAST, id DESC LIMIT 50` },
  { screen: 'Profile', what: 'the watchlist, first page', as: MEMBER,
    sql: `SELECT id, film_id, film_title FROM public.watchlists WHERE user_id = '${WHALE}' ORDER BY created_at DESC, id DESC LIMIT 60` },
  { screen: 'Profile', what: 'followers of the celebrity, first page', as: MEMBER,
    // as ProfileWriteService.getSocialConnections asks it
    sql: `SELECT user_id, created_at FROM public.interactions WHERE target_user_id = '${CELEBRITY}' AND type = 'follow' ORDER BY created_at DESC, user_id DESC LIMIT 51` },
  // A film
  { screen: 'Film', what: 'the house\'s logs of the hot film, first page', as: MEMBER,
    sql: 'SELECT id, user_id, rating, review, created_at FROM public.logs WHERE film_id = 1 ORDER BY created_at DESC LIMIT 20' },
  { screen: 'Film', what: 'the house verdict of the hot film', as: MEMBER, sql: 'SELECT avg_rating, rating_count, log_count FROM public.films WHERE id = 1' },
  // The Dispatch
  { screen: 'Dispatch', what: 'the door (dispatch_door)', as: MEMBER, sql: 'SELECT public.dispatch_door()' },
  { screen: 'Dispatch', what: 'a member\'s room totals', as: MEMBER, sql: `SELECT public.dispatch_room_totals('${CELEBRITY}')` },
  { screen: 'Dispatch', what: 'the paper, first page', as: MEMBER,
    // as the app's pageQuery asks it: published and not withheld (an ended ballot stays in the paper)
    sql: 'SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 30' },
  // …and in its other orders: most certified, and one section (TAKES) in each.
  { screen: 'Dispatch', what: 'the paper, most certified first', as: MEMBER,
    sql: 'SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL ORDER BY certify_count DESC, id DESC LIMIT 30' },
  { screen: 'Dispatch', what: 'one section of the paper, newest first', as: MEMBER,
    sql: "SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL AND kind = 'take' ORDER BY created_at DESC, id DESC LIMIT 30" },
  { screen: 'Dispatch', what: 'one section of the paper, most certified first', as: MEMBER,
    sql: "SELECT id, kind, author_username, title, body, certify_count, comment_count, created_at FROM public.dispatch_posts WHERE is_published AND withheld_at IS NULL AND kind = 'take' ORDER BY certify_count DESC, id DESC LIMIT 30" },
  { screen: 'Dispatch', what: 'the hot post\'s critiques, newest first', as: MEMBER,
    sql: `SELECT id, author_username, body, certify_count, created_at FROM public.dispatch_comments WHERE post_id = '${HOT_POST}' ORDER BY created_at DESC LIMIT 30` },
  { screen: 'Dispatch', what: 'the hot post\'s critiques, most certified first', as: MEMBER,
    sql: `SELECT id, author_username, body, certify_count, created_at FROM public.dispatch_comments WHERE post_id = '${HOT_POST}' ORDER BY certify_count DESC, created_at DESC LIMIT 30` },
  // The Lounge
  { screen: 'Lounge', what: 'unread counts, for a member in 200 rooms', as: WHALE, sql: 'SELECT * FROM public.get_lounge_unread_counts()' },
  { screen: 'Lounge', what: 'the busiest room\'s last 100 messages', as: mid(((1 * 61) % 100000) + 1),
    sql: `SELECT m.id, m.content, m.created_at, p.username FROM public.lounge_messages m LEFT JOIN public.profiles p ON p.id = m.user_id WHERE m.lounge_id = '${HOT_LOUNGE}' ORDER BY m.created_at DESC LIMIT 100` },
  // Notices
  { screen: 'Notices', what: 'the celebrity\'s first page', as: CELEBRITY,
    sql: `SELECT id, type, message, is_read, created_at FROM public.notifications WHERE user_id = '${CELEBRITY}' ORDER BY created_at DESC, id DESC LIMIT 30` },
  { screen: 'Notices', what: 'the celebrity\'s unread count', as: CELEBRITY,
    sql: `SELECT count(*) FROM public.notifications WHERE user_id = '${CELEBRITY}' AND is_read = false` },
  // Search
  { screen: 'Search', what: 'members by handle', as: MEMBER,
    sql: "SELECT id, username FROM public.profiles WHERE username ILIKE '%m123%' AND NOT coalesce(is_banned, false) ORDER BY followers_count DESC NULLS LAST LIMIT 20" },
];

/** An annotation holds one message; GitHub encodes its line breaks as %0A. */
const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const claims = (sub) => JSON.stringify({ sub, role: 'authenticated' }).replace(/'/g, "''");

/** One probe: a warm-up, then five timed runs, all inside one rolled-back transaction. */
function time(p) {
  const head = `BEGIN; SET LOCAL statement_timeout = '60s'; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${claims(p.as)}', true);`;
  const runs = Array.from({ length: 5 }, () => `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${p.sql};`).join('\n');
  const sql = `${head}\n${p.sql};\n${runs}\nROLLBACK;`;
  const out = execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const times = [...out.matchAll(/"Execution Time": ([\d.]+)/g)].map((m) => Number(m[1]));
  if (times.length !== 5) throw new Error(`expected 5 timings, read ${times.length}`);
  return times.sort((a, b) => a - b);
}

/**
 * The plan of a read over budget. A function's call plans as one "Function
 * Scan", which says nothing; auto_explain (when the role may load it) prints
 * the plan of every statement the function runs, and those come first.
 */
function plan(p) {
  const inner = "LOAD 'auto_explain'; SET auto_explain.log_min_duration = 0; SET auto_explain.log_analyze = on; SET auto_explain.log_buffers = on; SET auto_explain.log_nested_statements = on; SET auto_explain.log_format = 'json'; SET client_min_messages = log;";
  const sql = `${inner}\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${claims(p.as)}', true);\nEXPLAIN (ANALYZE, BUFFERS) ${p.sql};\nROLLBACK;`;
  const r = spawnSync('psql', [DB, '-X', '-q', '-t', '-A', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [slowestInside(r.stderr || ''), `── the call ──\n${r.stdout || ''}`].filter(Boolean).join('\n');
}

/**
 * auto_explain's JSON, one LOG per statement the read ran: the slowest
 * statement inside a function, as a compact tree (an annotation holds about
 * 4,000 characters, and a plan in text with its query beside it does not fit).
 */
function slowestInside(log) {
  const plans = [];
  for (const block of log.split(/^LOG:\s+duration: /m).slice(1)) {
    const at = block.indexOf('{');
    try { plans.push({ ms: parseFloat(block), plan: JSON.parse(block.slice(at, block.lastIndexOf('}') + 1)) }); } catch { /* not a plan */ }
  }
  const inner = plans.filter((x) => !/^\s*(LOAD|BEGIN|EXPLAIN|SELECT set_config)/i.test(x.plan['Query Text'] ?? ''));
  if (!inner.length) return '';
  const worst = inner.reduce((a, b) => (b.ms > a.ms ? b : a));
  const lines = [];
  const walk = (n, depth) => {
    const on = [n['Relation Name'], n['Index Name'] && `using ${n['Index Name']}`].filter(Boolean).join(' ');
    const bufs = (n['Shared Hit Blocks'] ?? 0) + (n['Shared Read Blocks'] ?? 0);
    const cond = n['Index Cond'] ?? n['Filter'] ?? n['Hash Cond'] ?? '';
    lines.push(`${'  '.repeat(depth)}${n['Node Type']}${on ? ` ${on}` : ''} · ${n['Actual Total Time']} ms · rows ${n['Actual Rows']} × ${n['Actual Loops']} · buffers ${bufs}${cond ? ` · ${String(cond).slice(0, 120)}` : ''}`);
    for (const c of n.Plans ?? []) walk(c, depth + 1);
  };
  walk(worst.plan.Plan, 0);
  return `── the slowest statement inside: ${worst.ms} ms ──\n${lines.join('\n')}`;
}

const rows = [];
let over = 0;
for (const p of PROBES) {
  const budget = p.budget ?? BUDGET;
  try {
    const t = time(p);
    const median = t[2];
    const ok = median <= budget;
    if (!ok) over++;
    rows.push(`| ${p.screen} | ${p.what} | ${median.toFixed(1)} | ${t[4].toFixed(1)} | ${budget} | ${ok ? '✓' : '✗ OVER'} |`);
    console.log(`${ok ? '✓' : '✗'} ${p.screen} · ${p.what}: median ${median.toFixed(1)} ms, worst ${t[4].toFixed(1)} ms (budget ${budget})`);
    if (!ok) {
      // the plan rides in the annotation: a run's logs need a signed-in reader, its annotations do not
      const shown = plan(p);
      console.log(shown);
      const head = shown.trim().split('\n').slice(0, 45).join('\n').slice(0, 3800);
      console.log(`::error title=Load — ${p.screen}: ${p.what}::median ${median.toFixed(1)} ms over a budget of ${budget} ms%0A${escape(head)}`);
    }
  } catch (e) {
    over++;
    rows.push(`| ${p.screen} | ${p.what} | — | — | ${budget} | ✗ FAILED |`);
    console.log(`::error title=Load — ${p.screen}: ${p.what}::${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ⏎ ')}`);
  }
}

const table = ['| Screen | Read | Median ms | Worst ms | Budget | |', '|---|---|---|---|---|---|', ...rows].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Load: 100,000 members\n\n${table}\n`);
console.log(`\n${PROBES.length - over} of ${PROBES.length} within budget`);
process.exit(over ? 1 : 0);
