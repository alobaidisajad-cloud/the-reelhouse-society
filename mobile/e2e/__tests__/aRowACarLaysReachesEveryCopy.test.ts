/**
 * What a car lays beyond the schema reaches every copy built from the snapshot.
 *
 * The snapshot is schema only: it carries no row. While a car is pending, CI applies it to each copy and
 * what it laid is there; once it is recorded, a copy holds only what the snapshot and the seeds lay. The
 * train of 2026-11-24 was recorded and every copy lost 20261122_62's one row (the fill of the members'
 * pieces, and whether it is complete): the car's rehearsal failed on the sealed copy, and the Load's member
 * search read the house instead of the lists. The Load's ballot tally read no counts too: 20261122_27
 * counted the votes already cast, and the load house's votes, laid with its triggers off, were never counted.
 *
 * So each table a car's own statements (never a function's or a DO block's) insert into, the car's own
 * scratch tables aside, is one of:
 *   carried  the snapshot lays its row (live-outside-public.sql, as schema-snapshot.mjs writes it);
 *   kept     made from other tables, and kept from them by the house as they are written: every seed that
 *            lays a source with its triggers off makes it again;
 *   planted  a public singleton the attack matrix plants as its specimen, and the rehearsals' seed lays;
 *   moved    a move, once, of rows production held then: no copy holds those rows.
 * And each job a car's own DO block puts on the schedule stands in the snapshot's schedule, or is the
 * work of a kept entry. A copy's statistics are its seed's: each seed ends analysed
 * (aSeededHouseIsAsProductionHoldsIt.test.ts).
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { mask } from '@/test-utils/house';
import { files } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..');
const rel = (f: string) => relative(MOBILE, f).split('\\').join('/');
const name = (raw: string) => {
  const parts = raw.split('"').join('').split('.');
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : `public.${parts[0]}`;
};

/** Each table a car's own statements insert into, and each job its own DO blocks schedule. */
export const laidBy = (sql: string) => {
  const { text, bodies } = mask(sql);
  const tables = [...text.matchAll(/\bINSERT\s+INTO\s+([\w."]+)/gi)].map(([, t = '']) => name(t));
  const jobs = bodies.filter((b) => /\bDO\s*$/i.test(text.slice(0, b.from)))
    .flatMap((b) => [...sql.slice(b.start, b.end).matchAll(/cron\.schedule\(\s*'([^']+)'/g)].map(([, j = '']) => j));
  return { tables, jobs };
};

/** Each table a text makes to keep (never a temporary one). */
export const made = (sql: string) => [...mask(sql).text.matchAll(/\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi)]
  .map(([, t = '']) => name(t));

/** Each table a text inserts a row into, by name. */
const insertsInto = (sql: string) => new Set([...mask(sql).text.matchAll(/\bINSERT\s+INTO\s+([\w."]+)/gi)].map(([, t = '']) => name(t)));

type Kept = { from: string[]; made: RegExp; job?: string };
/** Made from other tables and kept from them: what a seed laying a source with its triggers off makes again. */
export const KEPT: Record<string, Kept> = {
  'public.films': { from: ['public.logs', 'public.watchlists'], made: /\b(?:INSERT INTO|UPDATE) public\.films\b/ },
  'public.viewings': { from: ['public.logs'], made: /\bINSERT INTO public\.viewings\b/ },
  'public.log_counts': { from: ['public.interactions', 'public.log_comments'], made: /\bINSERT INTO public\.log_counts\b/ },
  'private.ballot_counts': { from: ['public.dispatch_votes'], made: /\bINSERT INTO private\.ballot_counts\b/ },
  // Its row is carried; its lists are the job's work, from every member as they stand.
  'private.member_grams_filled': { from: ['public.profiles'], made: /\bprivate\.member_grams_fill\(/, job: 'the-members-pieces-are-listed' },
};
/** A public singleton the attack matrix plants as its specimen and the rehearsals' seed lays. */
export const PLANTED = ['public.house_settings', 'public.founding_seat_counter'];
/** Moved once from rows production held then (each written since by the house as it happens). */
export const MOVED: Record<string, string> = {
  'public.lounge_sanctions': "20261003_07: the salons' mutes and bans of the day, out of their seats",
  'public.rank_grants': '20261003_08 and _09: each rank held then, by the source that gave it',
  'public.lounge_members': '20261116_01: each ban of the day given its seat back, as banned',
  'public.certifications_pushed': '20261117_01 and 20261118_01: each push already sent, so none is sent twice',
  'public.log_private_notes': '20260731_03: the private notes, out of the logs',
  'public.dispatch_posts': "20260902_01: the old Dispatch's filings",
  'public.dispatch_comments': "20260902_01: the old Dispatch's critiques",
  'public.dispatch_certifications': "20260902_01: the old Dispatch's certifications",
};

/** Each table pg_dump's text makes, by its name (each of a dump's statements begins a line). */
const dumped = (schema: string) => [...schema.matchAll(/^CREATE (?:UNLOGGED )?TABLE ([\w."]+) \(/gm)].map(([, t = '']) => name(t));

/**
 * The tables laid, each not carried, kept, planted or moved; and the jobs scheduled, each not standing or
 * kept. outside: live-outside-public.sql (its rows and its schedule); schema: live-schema.sql.
 */
export const unjudged = (cars: { file: string; sql: string }[], kept: string[], outside: string, schema = '') => {
  const ours = new Set([...cars.flatMap((c) => made(c.sql)), ...dumped(schema)]);
  const carried = insertsInto(outside);
  const judged = new Set([...carried, ...kept, ...PLANTED, ...Object.keys(MOVED)]);
  const standing = new Set([...outside.matchAll(/cron\.schedule(?:_in_database)?\(\s*'([^']+)'/g)].map(([, j = '']) => j));
  const keptJobs = new Set(Object.values(KEPT).map((k) => k.job));
  return cars.flatMap((c) => {
    const laid = laidBy(c.sql);
    return [
      ...laid.tables.filter((t) => ours.has(t) && !judged.has(t)).map((t) => `${c.file}: a row of ${t}`),
      ...laid.jobs.filter((j) => !standing.has(j) && !keptJobs.has(j)).map((j) => `${c.file}: the job ${j}`),
    ];
  });
};

/** Each seed that lays a source of a kept table with its triggers off, and does not make it again. */
export const notMadeAgain = (seeds: { file: string; text: string }[], kept: Record<string, Kept>) => seeds
  .map((s) => ({ file: s.file, sql: s.text.replace(/--[^\n]*/g, '') }))
  .filter((s) => /session_replication_role\s*=\s*replica/.test(s.sql))
  .flatMap((s) => {
    // A seed in a script holds its SQL in a string: read as text, its comments taken out.
    const into = new Set([...s.sql.matchAll(/\bINSERT\s+INTO\s+([\w."]+)/gi)].map(([, t = '']) => name(t)));
    return Object.entries(kept).filter(([, k]) => k.from.some((t) => into.has(t)) && !k.made.test(s.sql)).map(([t]) => `${s.file}: ${t}`);
  });

const CARS = files(['migrations']).map((f) => ({ file: rel(f), sql: readFileSync(f, 'utf8') }));
const snapshot = (file: string) => files(['snapshot']).filter((f) => f.endsWith(file)).map((f) => readFileSync(f, 'utf8')).join('\n');
const OUTSIDE = snapshot('live-outside-public.sql');
const SCHEMA = snapshot('live-schema.sql');
const SEEDS = files(['scripts']).filter((f) => /seed\.(?:sql|mjs)$/.test(f)).map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') }));

describe('what a car lays beyond the schema reaches every copy', () => {
  it('each row a car lays is carried by the snapshot, kept, planted or moved; each job it schedules stands or is kept', () => {
    expect(insertsInto(OUTSIDE)).toContain('private.member_grams_filled');
    expect(dumped(SCHEMA)).toEqual(expect.arrayContaining(['private.member_grams_filled', 'public.house_settings']));
    expect(unjudged(CARS, Object.keys(KEPT), OUTSIDE, SCHEMA)).toEqual([]);
  });

  it('each judgement is of a row a car lays, and each job judged is one a car schedules', () => {
    const laid = CARS.map((c) => laidBy(c.sql));
    const tables = new Set(laid.flatMap((l) => l.tables));
    const jobs = new Set(laid.flatMap((l) => l.jobs));
    expect([...Object.keys(KEPT), ...PLANTED, ...Object.keys(MOVED)].filter((t) => !tables.has(t))).toEqual([]);
    expect(Object.values(KEPT).flatMap((k) => (k.job ? [k.job] : [])).filter((j) => !jobs.has(j))).toEqual([]);
  });

  it('each seed laying a source with its triggers off makes every kept table of it again', () => {
    expect(SEEDS.map((s) => s.file)).toEqual(expect.arrayContaining(['e2e/load/seed.sql', 'e2e/db/lab-seed.mjs']));
    expect(notMadeAgain(SEEDS, KEPT)).toEqual([]);
  });

  it('each planted singleton is the attack matrix\'s specimen and the rehearsals\' seed lays it', () => {
    const matrix = JSON.parse(readFileSync(join(MOBILE, 'e2e', 'db', 'attack', 'matrix.json'), 'utf8')) as { tables: Record<string, { specimen?: unknown }> };
    const seed = insertsInto(readFileSync(join(MOBILE, 'e2e', 'db', 'rehearsal-seed.sql'), 'utf8'));
    expect(PLANTED.filter((t) => !matrix.tables[t.replace(/^public\./, '')]?.specimen || !seed.has(t))).toEqual([]);
  });

  it('finds a row and a job a recorded car laid that no copy holds, and a seed that never makes a kept table again', () => {
    const car = "CREATE TABLE IF NOT EXISTS private.fill (one boolean PRIMARY KEY);\nINSERT INTO private.fill (one) VALUES (true);\n"
      + "CREATE TEMP TABLE scratch (x int) ON COMMIT DROP;\nINSERT INTO scratch VALUES (1);\n"
      + "CREATE FUNCTION private.f() RETURNS void LANGUAGE sql AS $$ INSERT INTO private.fill VALUES (true) $$;\n"
      + "DO $$ BEGIN PERFORM cron.schedule('the-fill', '1 seconds', 'SELECT 1'); END $$;\n"
      + "-- INSERT INTO private.fill VALUES (true);\n";
    expect(laidBy(car)).toEqual({ tables: ['private.fill', 'public.scratch'], jobs: ['the-fill'] });
    expect(unjudged([{ file: 'car.sql', sql: car }], [], '')).toEqual(['car.sql: a row of private.fill', 'car.sql: the job the-fill']);
    const outside = "INSERT INTO private.fill (one) VALUES (true) ON CONFLICT (one) DO NOTHING;\n"
      + "SELECT cron.schedule_in_database('the-fill', '1 seconds', 'SELECT 1', 'postgres', 'postgres', 't');";
    expect(unjudged([{ file: 'car.sql', sql: car }], [], outside)).toEqual([]);
    // a table no car makes, which the dump holds, is the house's too
    const old = 'INSERT INTO public.seats (id) VALUES (1);\n';
    expect(unjudged([{ file: 'old.sql', sql: old }], [], '', 'CREATE TABLE public.seats (\n    id integer\n);\n')).toEqual(['old.sql: a row of public.seats']);
    const kept = { 'private.counts': { from: ['public.votes'], made: /\bINSERT INTO private\.counts\b/ } };
    const seeds = [
      { file: 'off.sql', text: 'SET session_replication_role = replica;\nINSERT INTO public.votes VALUES (1);\nSET session_replication_role = origin;' },
      { file: 'on.sql', text: 'INSERT INTO public.votes VALUES (1);' },
      { file: 'made.sql', text: 'SET session_replication_role = replica;\nINSERT INTO public.votes VALUES (1);\nINSERT INTO private.counts SELECT 1;' },
      { file: 'said.sql', text: 'SET session_replication_role = replica;\nINSERT INTO public.votes VALUES (1);\n-- INSERT INTO private.counts SELECT 1;' },
    ];
    expect(notMadeAgain(seeds, kept)).toEqual(['off.sql: private.counts', 'said.sql: private.counts']);
  });
});
