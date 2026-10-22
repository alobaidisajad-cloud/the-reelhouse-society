/**
 * The lock clock for the train on 100,000 members (e2e/load/train-locks.mjs), run as a process on
 * saved samples: how a lock is timed, and which holds fail the run.
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
