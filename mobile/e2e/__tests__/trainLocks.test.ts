/**
 * The lock clock for the train on 100,000 members (e2e/load/train-locks.mjs), run as a process on
 * saved samples: how a lock is timed, and which holds fail the run; and, from the train's own plan,
 * the runs it is measured in, car by car.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'load', 'train-locks.mjs');
const SAMPLE_MS = 100;
const HELD_MS = 1000;
type Hold = { relation: string; mode: string; ms: number; fault: boolean; query: string };

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'train-locks-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const judge = (samples: unknown[]): Hold[] => {
  const file = join(dir, `s${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(samples));
  const r = spawnSync(process.execPath, [SCRIPT, '--holds', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};
const at = (t: number, relation: string, mode: string, extra: Record<string, unknown> = {}) => ({
  t, relation, schema: relation.split('.')[0], mode, granted: true, query: 'ALTER TABLE public.logs …', pid: '42', ...extra,
});
const long = (relation: string, mode: string) => judge([at(0, relation, mode), at(HELD_MS + 50, relation, mode)])[0];

describe('a lock is timed from its first granted sight to its last', () => {
  it('and one seen once is held a sample long', () => {
    expect(judge([at(1000, 'public.logs', 'AccessExclusiveLock')])).toEqual([
      expect.objectContaining({ relation: 'public.logs', ms: SAMPLE_MS, fault: false }),
    ]);
  });

  it('is blamed on the statement running when it appeared, not a later one', () => {
    const [h] = judge([
      at(1000, 'public.logs', 'AccessExclusiveLock', { query: 'ALTER TABLE public.logs …' }),
      at(1600, 'public.logs', 'AccessExclusiveLock', { query: 'SELECT the next case' }),
    ]);
    expect(h).toMatchObject({ query: 'ALTER TABLE public.logs …', ms: 600 + SAMPLE_MS });
  });

  it('counts a lock waited for, not yet granted, as no hold', () => {
    expect(judge([at(1000, 'public.logs', 'AccessExclusiveLock', { granted: false })])).toEqual([]);
  });
});

describe('a hold fails the run', () => {
  it('when it blocks a member on a relation the app reads or writes, for over a second', () => {
    expect(long('public.logs', 'AccessExclusiveLock')).toMatchObject({ fault: true });
    expect(long('public.interactions', 'ShareLock')).toMatchObject({ fault: true });
    expect(long('public.logs', 'ExclusiveLock')).toMatchObject({ fault: true });
    expect(long('storage.objects', 'ShareRowExclusiveLock')).toMatchObject({ fault: true });
  });

  it('never for a lock that lets reads and writes through', () => {
    expect(long('public.logs', 'RowExclusiveLock')).toMatchObject({ fault: false });
    expect(long('public.logs', 'ShareUpdateExclusiveLock')).toMatchObject({ fault: false });
  });

  it('never for a relation no member reaches', () => {
    expect(long('auth.audit_log_entries', 'AccessExclusiveLock')).toMatchObject({ fault: false });
    expect(long('storage.buckets', 'AccessExclusiveLock')).toMatchObject({ fault: false });
  });

  it('and not for one let go within the second', () => {
    expect(judge([at(0, 'public.logs', 'AccessExclusiveLock'), at(HELD_MS - 2 * SAMPLE_MS, 'public.logs', 'AccessExclusiveLock')])[0])
      .toMatchObject({ fault: false });
  });
});

describe('the train is measured as it runs, car by car', () => {
  const SQL = "SET LOCAL lock_timeout = '2s';\nSET LOCAL statement_timeout = '30s';\nCREATE TABLE public.x (id int);\n";
  const INDEX = "SET lock_timeout = '2s';\nSET statement_timeout = '10min';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS x_id ON public.x (id);\n";
  const car = (name: string, sql = SQL) => ({ name, path: `/m/${name}`, sql });
  const reh = (name: string, ...includes: string[]) => ({ name, path: `/d/${name}`, includes });
  const runs = (pending: unknown[], rehearsals: unknown[]) => {
    const file = join(dir, `p${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(file, JSON.stringify({ pending, rehearsals }));
    const r = spawnSync(process.execPath, [SCRIPT, '--runs', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return JSON.parse(r.stdout) as { label: string; args: string[] }[];
  };
  const [A, B, C] = ['20990101_01_a.sql', '20990101_02_b.sql', '20990101_04_c.sql'].map((n) => car(n));
  const idx = car('20990101_03_x_id.sql', INDEX);
  let measured: { label: string; args: string[] }[];
  beforeAll(() => {
    measured = runs([A, B, idx, C], [reh('a_rehearsal.sql', A.name), reh('b_rehearsal.sql', B.name),
      reh('x_id_rehearsal.sql'), reh('c_rehearsal.sql', C.name)]);
  });

  it('the index built first, then each car rehearsed (A) and applied (B) before the next is rehearsed', () => {
    expect(measured.map((r) => r.label)).toEqual([
      `B · build ${idx.name} alone, as members write`,
      `A · rehearse ${A.name} on production as it now is`, `B · apply ${A.name}`,
      `A · rehearse ${B.name} on production as it now is`, `B · apply ${B.name}`,
      `A · rehearse ${C.name} on production as it now is`, `B · apply ${C.name}`,
    ]);
  });

  it('each rehearsal its own file alone: no earlier car held open in its transaction', () => {
    expect(measured.filter((r) => r.label.startsWith('A')).map((r) => r.args.filter((a) => a.endsWith('.sql'))))
      .toEqual([['/d/a_rehearsal.sql'], ['/d/b_rehearsal.sql'], ['/d/c_rehearsal.sql']]);
    expect(measured.find((r) => r.label === `B · apply ${B.name}`)?.args).toEqual(['-X', '-1', '-v', 'ON_ERROR_STOP=1', '-f', `/m/${B.name}`]);
  });
});

describe('each statement is timed', () => {
  // psql's own output, as the run asks for it (-e and its timing switch): a rehearsal's quiet run.
  const PSQL = ['BEGIN;', 'Time: 0.221 ms', 'SELECT pg_sleep(0.2);', '', 'Time: 206.840 ms',
    'SELECT count(*)', '  FROM t;', '0', 'Time: 1.120 ms', 'Timing is on.', 'CREATE TABLE u (id int);', 'CREATE TABLE', 'Time: 3.49 ms'].join('\n');
  const timed = () => {
    const file = join(dir, 'psql.txt');
    writeFileSync(file, PSQL);
    const r = spawnSync(process.execPath, [SCRIPT, '--statements', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return JSON.parse(r.stdout) as { ms: number; text: string }[];
  };

  it('by its own time, named by its first line, slowest first', () => {
    expect(timed()).toEqual([
      { ms: 207, text: 'SELECT pg_sleep(0.2);' },
      { ms: 3, text: 'CREATE TABLE u (id int);' },
      { ms: 1, text: 'SELECT count(*)' },
      { ms: 0, text: 'BEGIN;' },
    ]);
  });
});
