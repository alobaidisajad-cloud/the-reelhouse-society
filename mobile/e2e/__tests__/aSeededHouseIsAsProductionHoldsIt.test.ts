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
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files } from '@/test-utils/universe';

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

/** Whether a seed's last write comes before an ANALYZE of the house. */
const analysedLast = (sql: string) => {
  const body = plain(sql);
  const writes = [...body.matchAll(/\b(?:INSERT INTO|UPDATE|DELETE FROM|SELECT public\.\w+\()/g)].map((m) => m.index ?? 0);
  const analyses = [...body.matchAll(/\bANALYZE\b/g)].map((m) => m.index ?? 0);
  return writes.length > 0 && analyses.length > 0 && Math.max(...analyses) > Math.max(...writes);
};

/** Production's schedule as it stands: every job the snapshot's files schedule. */
const SCHEDULE = files(['snapshot']).map((f) => readFileSync(f, 'utf8')).join('\n');
/** The seeds among the scripts that lay a house in SQL (one that writes through the API writes no SQL). */
const SEEDS = files(['scripts']).filter((f) => /seed\.(?:sql|mjs)$/.test(f))
  .map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') })).filter((s) => /INSERT INTO public\./.test(s.text));

describe('the load house is as production\'s schedule leaves it', () => {
  it('runs each job production schedules, once, as its schedule runs it', () => {
    expect(jobsIn(SCHEDULE).map((j) => j.name)).toEqual(expect.arrayContaining(['freeze-closed-ballots', 'lobby-edition']));
    const load = SEEDS.find((s) => s.file === LOAD_SEED);
    expect(load).toBeDefined();
    expect(jobsNotRun(SCHEDULE, load?.text ?? '')).toEqual([]);
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
