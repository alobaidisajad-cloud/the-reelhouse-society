/**
 * A job that ends itself is state, not schema.
 *
 * A job the house's own functions put on the schedule and take off it (the members' lists filled, a
 * closed ballot's voters told, the Lobby's edition drafted: each every second while its work lasts)
 * stands while its work waits and is gone once it is done. up-down-up.mjs read every job as schema,
 * before and after each car: the members' lists finished filling between car 64's two readings, and car
 * 64's undo, which touches no job, was refused (DB security and Sealed E2E on 79700ada).
 *
 * The readers that compare the schedule leave those jobs out by one rule, read from the house's own
 * code (scripts/jobs-that-end-themselves.cjs): a job named in quotes by a statement of a function's body
 * that calls pg_cron. This finder holds the rule to the house as production will hold it (the snapshot,
 * then every pending car): each such call names its job in quotes, so the rule sees it; each job a
 * function puts on the schedule a function also takes off, so it ends; and each script that reads the
 * schedule takes the rule, or is judged here with its reason.
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

/** Each function's pg_cron calls, by the function: those that name no job, and the jobs put on and taken off. */
const callsIn = (functions: Iterable<{ name: string; body: string }>) => {
  const calls = [...functions].flatMap((fn) => namedJobs(fn.body).map((c) => ({ ...c, fn: fn.name })));
  const named = (kind: RegExp) => new Set(calls.filter((c) => kind.test(c.call) && c.name !== null).map((c) => c.name));
  return {
    unnamed: calls.filter((c) => c.name === null).map((c) => `${c.fn}: ${c.statement.replace(/\s+/g, ' ')}`),
    put: named(/^schedule/),
    taken: named(/^unschedule$/),
  };
};

/** The jobs put on the schedule by a function that no function takes off. */
const neverEnding = (c: ReturnType<typeof callsIn>) => [...c.put].filter((name) => !c.taken.has(name));

/**
 * Each query of a script that reads the schedule (a statement reading cron.job, not its run history),
 * where it does not leave out the jobs that end themselves: by file.
 */
const readsEveryJob = (text: string) => [...text.matchAll(/\bFROM cron\.job\b(?!_)([^`"]*)/g)]
  .filter(([, rest = '']) => !/\$\{steady\(/.test(rest)).length;

/** Scripts that read the schedule as state, by design, each with its reason. */
const JUDGED: Record<string, string> = {
  'e2e/load/train-locks.mjs': 'it watches each job a car puts on the schedule until it ends: whether the job stands is what it reads, as state, and it compares no schedule with another',
  'supabase/diagnostics/pretrain.cjs': 'its stand-in for pg_cron makes the schedule\'s table and the calls that keep it, so a copy of production restores whole; it reads no job and compares no schedule',
};

const HOUSE = read();

describe('a job that ends itself is state, in the house as production will hold it', () => {
  const calls = callsIn(HOUSE.functions.values());

  it('names its job in quotes at each call of pg_cron in a function, so the readers\' rule sees it', () => {
    // The members' lists' job is put on by its car and taken off by its function; the others both, by functions.
    expect([...calls.taken]).toEqual(expect.arrayContaining(['the-members-pieces-are-listed', 'the-closed-ballots-are-told', 'the-lobby-edition-is-drafted']));
    expect([...calls.put]).toEqual(expect.arrayContaining(['the-closed-ballots-are-told', 'the-lobby-edition-is-drafted']));
    expect(calls.unnamed).toEqual([]);
  });

  it('takes off the schedule, in a function, each job a function puts on it', () => {
    expect(neverEnding(calls)).toEqual([]);
  });

  it('finds a call that names no job, and a job put on that nothing takes off', () => {
    const planted = read([
      "CREATE FUNCTION private.a() RETURNS void LANGUAGE plpgsql AS $$ DECLARE v bigint; BEGIN\n  SELECT jobid INTO v FROM cron.job LIMIT 1;\n  PERFORM cron.unschedule(v);\nEND $$;",
      "CREATE FUNCTION private.b() RETURNS void LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM cron.schedule('b-runs', '1 seconds', 'SELECT private.b();');\nEND $$;",
      "CREATE FUNCTION private.c() RETURNS void LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM cron.schedule_in_database('c-runs', '1 seconds', 'SELECT private.c();', 'postgres');\n  -- cron.unschedule('b-runs') is only words here\nEND $$;",
      "CREATE FUNCTION private.d() RETURNS void LANGUAGE plpgsql AS $$ BEGIN\n  PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'c-runs';\n  PERFORM cron.unschedule('it''s-done');\nEND $$;",
    ].join('\n'));
    const c = callsIn(planted.functions.values());
    expect(c.unnamed).toEqual(['private.a: PERFORM cron.unschedule(v)']);
    expect([...c.put]).toEqual(['b-runs', 'c-runs']);
    expect([...c.taken]).toEqual(['c-runs', "it's-done"]);
    expect(neverEnding(c)).toEqual(['b-runs']);
  });
});

describe('each reader of the schedule leaves out the jobs that end themselves', () => {
  const readers = files(['scripts']).filter((f) => /\.[cm]?[jt]s$/.test(f))
    .map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') })).filter((r) => /\bFROM cron\.job\b(?!_)/.test(r.text));

  it('each script that compares the schedule takes the rule; the others are judged', () => {
    expect(readers.map((r) => r.file)).toEqual(expect.arrayContaining(['e2e/db/up-down-up.mjs', 'scripts/schema-snapshot.mjs']));
    expect(readers.filter((r) => !JUDGED[r.file] && readsEveryJob(r.text) > 0).map((r) => r.file)).toEqual([]);
    expect(Object.keys(JUDGED).filter((f) => !readers.some((r) => r.file === f))).toEqual([]);
  });

  it('finds a query of the schedule that reads every job', () => {
    expect(readsEveryJob("psqlRows(url, \"SELECT jobname FROM cron.job ORDER BY jobname\")")).toBe(1);
    expect(readsEveryJob('q(`SELECT jobname FROM cron.job j WHERE ${steady(\'j\')} ORDER BY 1`)')).toBe(0);
    expect(readsEveryJob('q(`SELECT start_time FROM cron.job_run_details`)')).toBe(0);
  });
});
