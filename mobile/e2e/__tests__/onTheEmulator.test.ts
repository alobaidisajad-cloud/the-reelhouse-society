/**
 * onTheEmulator.test.ts — e2e/on-the-emulator.cjs: the emulator step's script runs, then its emulator
 * is stopped and seen to end before the step does, whatever the emulator does with the ask.
 *
 * Nightly 45951561421: the three-button walk's emulator answered `adb emu kill` with "OK: killing
 * emulator, bye bye" and never stopped, and the action waited on it with no limit until the step's 50
 * minutes ran out. Here the emulator is a fake: its processes, the ask, the signals and the clock.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

const { stopTheEmulator, ASKED_MS, SIGNAL_MS } = require('../on-the-emulator.cjs') as {
  stopTheEmulator: (io: unknown) => { stopped: string; left: number[] };
  ASKED_MS: number;
  SIGNAL_MS: number;
};

type Ends = 'on the ask' | 'on TERM' | 'on KILL' | 'never';

/** An emulator of three processes (qemu, netsimd, crashpad) that ends as `ends` says, `after` ms after it. */
function emulator(ends: Ends, after = 1500) {
  let now = 0;
  let endsAt = Infinity;
  const done: string[] = [];
  const notes: { title: string; text: string }[] = [];
  const io = {
    family: () => [101, 102, 103],
    ask: () => { done.push('ask'); if (ends === 'on the ask') endsAt = now + after; },
    alive: () => now < endsAt,
    signal: (pids: number[], sig: string) => {
      done.push(`${sig} ${pids.join(',')}`);
      if ((ends === 'on TERM' && sig === 'SIGTERM') || (ends === 'on KILL' && sig === 'SIGKILL')) endsAt = now;
    },
    now: () => now,
    sleep: (ms: number) => { now += ms; },
    record: (pids: number[]) => `the threads of ${pids.join(',')}`,
    note: (title: string, text: string) => { notes.push({ title, text }); },
  };
  return { io, done, notes, at: () => now };
}

describe('the emulator, stopped after the script', () => {
  it('asks it to stop, as the action asks, and sends no signal when it ends on the ask', () => {
    const e = emulator('on the ask');
    expect(stopTheEmulator(e.io)).toEqual({ stopped: 'asked', left: [] });
    expect(e.done).toEqual(['ask']);
    expect(e.notes).toEqual([]);
    expect(e.at()).toBeLessThan(ASKED_MS);
  });

  it('gives it its own graceful wait and its kill before anything else is done', () => {
    // The emulator's own watch waits 20 s, then kills itself: one that ends in that time is let be.
    const e = emulator('on the ask', 21000);
    expect(stopTheEmulator(e.io).stopped).toBe('asked');
    expect(e.done).toEqual(['ask']);
  });

  it('writes down one that took the ask and never stopped, raises it as a warning, and ends it', () => {
    const e = emulator('on TERM');
    expect(stopTheEmulator(e.io)).toEqual({ stopped: 'ended', left: [] });
    expect(e.done).toEqual(['ask', 'SIGTERM 101,102,103']);
    expect(e.at()).toBe(ASKED_MS);
    expect(e.notes).toHaveLength(1);
    expect(e.notes[0]!.title).toBe('The emulator did not stop when asked');
    expect(e.notes[0]!.text).toContain('the threads of 101,102,103');
  });

  it('kills one that TERM does not end', () => {
    const e = emulator('on KILL');
    expect(stopTheEmulator(e.io)).toEqual({ stopped: 'ended', left: [] });
    expect(e.done).toEqual(['ask', 'SIGTERM 101,102,103', 'SIGKILL 101,102,103']);
    expect(e.at()).toBe(ASKED_MS + SIGNAL_MS);
  });

  it('says so, and still ends, when nothing ends it: the step is never held', () => {
    const e = emulator('never');
    expect(stopTheEmulator(e.io)).toEqual({ stopped: 'never', left: [101, 102, 103] });
    expect(e.at()).toBe(ASKED_MS + 2 * SIGNAL_MS);
    expect(e.notes[0]!.text).toContain('Still running after TERM and KILL: 101, 102, 103.');
  });

  it('asks nothing when no emulator is running', () => {
    const e = emulator('on the ask');
    expect(stopTheEmulator({ ...e.io, family: () => [] })).toEqual({ stopped: 'none', left: [] });
    expect(e.done).toEqual([]);
  });
});

describe('the step, run through it', () => {
  const run = (code: string) => spawnSync(process.execPath, [join(__dirname, '..', 'on-the-emulator.cjs'), process.execPath, '-e', code], {
    encoding: 'utf8', env: { ...process.env, E2E_EMULATOR_PATH: '/no/emulator/here/' }, timeout: 30000,
  });

  it('ends with its script\'s own exit code, the script\'s words passed through', () => {
    const failed = run('console.log("the flows said no"); process.exit(3)');
    expect({ status: failed.status, out: failed.stdout.trim() }).toEqual({ status: 3, out: 'the flows said no' });
    expect(run('process.exit(0)').status).toBe(0);
  });
});
