/**
 * A house a check reads is laid down as production holds one.
 *
 * Each seed among the scripts that lays a house in SQL (e2e/load/seed.sql for the load test,
 * e2e/db/rehearsal-seed.sql for the rehearsals, e2e/db/lab-seed.mjs for the speed lab) ends
 * analysed, after its last write, as production's tables always hold their statistics: the
 * rehearsals' house is laid after the pending cars were applied to an empty copy, so the cars' own
 * ANALYZE saw empty tables, and a car's new index held no statistics at all.
 *
 * And the load house, on which the train is measured while production's schedule runs, runs once
 * each job the snapshot schedules, as its schedule runs it: left to the schedule, the first run
 * after the seed would meet a backlog production never holds (the seed's 1,800 closed ballots frozen
 * and 45,000 notices written in one transaction, about half a minute at 100,000 members), and the
 * train's indexes built CONCURRENTLY meanwhile wait for that transaction until their lock wait
 * cancels them. The rehearsals' and the lab's houses are a few dozen members: their schedule's first
 * run finds a few rows, in milliseconds.
 *
 * And the regard the Lobby weighs by its day (each table its chooser reads by when a row was given) is
 * dated in the load house as production's is, across the house's life: a row the seed leaves to its
 * column's default is dated at the seed's minute, so the day before the seed held every certification
 * of the house's filings (800,000 at 100,000 members) as one day's regard, a day no house has.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { read } from '@/test-utils/house';
import { files } from '@/test-utils/universe';

const { namedJobs } = require('../../scripts/jobs-that-end-themselves.cjs') as {
  namedJobs: (body: string) => { call: string; name: string | null; statement: string }[];
};

const MOBILE = join(__dirname, '..', '..');
const rel = (f: string) => relative(MOBILE, f).split('\\').join('/');
const LOAD_SEED = 'e2e/load/seed.sql';

/** SQL with its comments taken out and its spaces made one. */
const plain = (sql: string) => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');

/** Each job a file schedules with pg_cron: its name and its command, the command's quotes undone. */
const jobsIn = (sql: string) => [...sql.matchAll(/cron\.schedule(?:_in_database)?\(\s*'((?:[^']|'')*)'\s*,\s*'(?:[^']|'')*'\s*,\s*'((?:[^']|'')*)'/g)]
  .map(([, name = '', command = '']) => ({ name: name.replace(/''/g, "'"), command: command.replace(/''/g, "'") }));

/** The jobs a seed does not run as their schedule runs them (the command itself, its last semicolon aside). */
const jobsNotRun = (schedule: string, seed: string) => {
  const body = plain(seed);
  return jobsIn(schedule).filter((j) => !body.includes(plain(j.command).trim().replace(/;$/, '').trim())).map((j) => j.name);
};

/**
 * Each table a body reads by when its rows were given, from the day's start or a step's last row
 * (`created_at >= v_start` or `>= v_from`), with the kind of row it reads where the table holds others
 * (its `type`).
 */
export const regardSources = (body: string) => [...plain(body).matchAll(
  /\bFROM public\.(\w+) (\w+)\b((?:(?!\bFROM\b)[\s\S])*?)\bWHERE\b((?:(?!\bFROM\b)[\s\S])*?)\b\2\.created_at >= v_(?:start|from)\b/g)]
  .map(([, table = '', , , where = '']) => ({ table, type: /\.type = '(\w+)'/.exec(where)?.[1] }));

/** A seed's inserts into a source of the regard that leave the row's date to the column's default: by table. */
export const undatedRegard = (seed: string, sources: { table: string; type?: string }[]) => [...plain(seed)
  .matchAll(/\bINSERT INTO public\.(\w+) \(([^)]*)\)([^;]*);/g)]
  .filter(([, table, cols = '', rest = '']) => sources.some((r) => r.table === table && (!r.type || rest.includes(`'${r.type}'`)))
    && !/\bcreated_at\b/.test(cols))
  .map(([, table = '']) => table);

/** Whether a seed's last write comes before an ANALYZE of the house. */
const analysedLast = (sql: string) => {
  const body = plain(sql);
  const writes = [...body.matchAll(/\b(?:INSERT INTO|UPDATE|DELETE FROM|SELECT public\.\w+\()/g)].map((m) => m.index ?? 0);
  const analyses = [...body.matchAll(/\bANALYZE\b/g)].map((m) => m.index ?? 0);
  return writes.length > 0 && analyses.length > 0 && Math.max(...analyses) > Math.max(...writes);
};

/** Production's schedule as it stands: every job the snapshot's files schedule. */
const SCHEDULE = files(['snapshot']).map((f) => readFileSync(f, 'utf8')).join('\n');
/**
 * The jobs the house's own functions put on the schedule and take off it (scripts/jobs-that-end-themselves.cjs):
 * each stands only while its work waits, so it is no part of the schedule a seed runs once.
 */
const ENDS_ITSELF = new Set([...read().functions.values()].flatMap((fn) => namedJobs(fn.body)).map((j) => j.name));
/** The seeds among the scripts that lay a house in SQL (one that writes through the API writes no SQL). */
const SEEDS = files(['scripts']).filter((f) => /seed\.(?:sql|mjs)$/.test(f))
  .map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') })).filter((s) => /INSERT INTO public\./.test(s.text));

describe('the load house is as production\'s schedule leaves it', () => {
  it('runs each job production schedules, once, as its schedule runs it', () => {
    expect(jobsIn(SCHEDULE).map((j) => j.name)).toEqual(expect.arrayContaining(['freeze-closed-ballots', 'lobby-edition']));
    const load = SEEDS.find((s) => s.file === LOAD_SEED);
    expect(load).toBeDefined();
    expect([...ENDS_ITSELF]).toEqual(expect.arrayContaining(['the-closed-ballots-are-told', 'the-lobby-edition-is-drafted']));
    expect(jobsNotRun(SCHEDULE, load?.text ?? '').filter((name) => !ENDS_ITSELF.has(name))).toEqual([]);
  });

  it('finds a job the seed leaves to the schedule, and reads a command\'s own quotes', () => {
    const schedule = "SELECT cron.schedule_in_database('a-job', '*/5 * * * *', 'SELECT public.a_job();', 'postgres', 'postgres', 't');\n"
      + "SELECT cron.schedule('trim', '23 4 * * *', 'DELETE FROM t WHERE at < now() - interval ''14 days''');";
    expect(jobsNotRun(schedule, 'SELECT public.another_job();')).toEqual(['a-job', 'trim']);
    expect(jobsNotRun(schedule, "SELECT public.a_job() AS done;\nDELETE FROM t\n  WHERE at < now() - interval '14 days';")).toEqual([]);
    // a command named only in a comment is not run
    expect(jobsNotRun(schedule, "-- SELECT public.a_job();\nDELETE FROM t WHERE at < now() - interval '14 days';")).toEqual(['a-job']);
  });
});

/** The Lobby's sources of regard, as the house production will hold reads them. */
const LOBBY = [...read().functions.values()].filter((fn) => /lobby/.test(fn.name)).flatMap((fn) => regardSources(fn.body));

describe('the regard the Lobby weighs by its day is dated as production dates it', () => {
  it('each insert of the load house into a source of the regard names when its rows were given', () => {
    expect(LOBBY.map((r) => r.table)).toEqual(expect.arrayContaining(['interactions', 'log_comments', 'dispatch_certifications', 'dispatch_comments']));
    expect(undatedRegard(SEEDS.find((x) => x.file === LOAD_SEED)?.text ?? '', LOBBY)).toEqual([]);
  });

  it('reads the sources from the chooser, and finds an insert left to the default date', () => {
    const body = "SELECT 1 FROM public.interactions x JOIN public.logs l ON l.id = x.target_log_id\n WHERE x.type = 'endorse_log' AND x.created_at >= v_start;\n"
      + 'SELECT 1 FROM public.dispatch_certifications c\n WHERE c.post_id IS NOT NULL AND c.created_at >= v_from AND c.created_at < v_end;\n'
      + 'SELECT 1 FROM public.lists s WHERE s.created_at < v_end;';
    const sources = regardSources(body);
    expect(sources).toEqual([{ table: 'interactions', type: 'endorse_log' }, { table: 'dispatch_certifications', type: undefined }]);
    const seed = "INSERT INTO public.dispatch_certifications (user_id, post_id)\nSELECT u, p FROM x;\n"
      + "INSERT INTO public.interactions (user_id, target_user_id, type) SELECT a, b, 'follow' FROM y;\n"
      + "INSERT INTO public.interactions (user_id, target_log_id, type) SELECT a, l, 'endorse_log' FROM z;\n"
      + "INSERT INTO public.interactions (user_id, target_log_id, type, created_at) SELECT a, l, 'endorse_log', t FROM z;\n"
      + '-- INSERT INTO public.dispatch_certifications (user_id, post_id) VALUES (1, 2);\n';
    expect(undatedRegard(seed, sources)).toEqual(['dispatch_certifications', 'interactions']);
  });
});

describe('each house a check reads ends analysed', () => {
  it('after its last write: every seed that lays a house in SQL', () => {
    expect(SEEDS.map((s) => s.file)).toEqual(expect.arrayContaining([LOAD_SEED, 'e2e/db/rehearsal-seed.sql', 'e2e/db/lab-seed.mjs']));
    expect(SEEDS.filter((s) => !analysedLast(s.text)).map((s) => s.file)).toEqual([]);
  });

  it('finds a house left with no ANALYZE, or one written after it', () => {
    expect(analysedLast('INSERT INTO public.x VALUES (1);\nCOMMIT;\n-- ANALYZE\n')).toBe(false);
    expect(analysedLast('INSERT INTO public.x VALUES (1);\nANALYZE;\nSELECT public.make_more();\n')).toBe(false);
    expect(analysedLast('INSERT INTO public.x VALUES (1);\nCOMMIT;\nVACUUM ANALYZE;\nSELECT count(*) FROM public.x;\n')).toBe(true);
  });
});
