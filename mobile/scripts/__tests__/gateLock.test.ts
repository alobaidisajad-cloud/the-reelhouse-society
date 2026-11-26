/**
 * gateLock.test.ts — scripts/gate-lock.cjs: while a push gate holds the machine, no other heavy run
 * starts (a mutants run, a wide jest run, a Stryker run, a second gate), but the gate's own children; and
 * the push wrapper's hold takes the lock for the command's whole run and lets it go however it ends.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'gate-lock.cjs');
const lock = require('../gate-lock.cjs') as {
  CHILD: string;
  refusal: (what: string, opts: { file: string; env: Record<string, string | undefined>; running?: (pid: number) => boolean; said?: (s: string) => void }) => string | null;
  lockNow: (file: string, said?: (s: string) => void, running?: (pid: number) => boolean) => { who: string; token: string | null } | null;
};
const sequencer = require('../../test-utils/weightedSequencer.js') as { WIDE: number; wideRefusal: (count: number, opts: object) => string | null };

let dir: string;
let file: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gate-lock-')); file = join(dir, 'push-gate.lock'); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const held = (token: string | null, pid = process.pid) => writeFileSync(file, token === null ? 'integrator I2, by hand\n'
  : JSON.stringify({ who: 'push-head.ps1', since: '2026-11-26T00:20:00Z', pid, token }));

it('refuses a heavy run while a gate holds the machine, and lets the gate\'s own children and a free machine run', () => {
  const quiet = () => undefined;
  expect(lock.refusal('a mutants run', { file, env: {} })).toBeNull();
  held('t0ken');
  const why = lock.refusal('a mutants run', { file, env: {}, said: quiet });
  expect(why).toMatch(/^a mutants run refused: a push gate holds this machine \(.*push-head\.ps1, since 2026-11-26T00:20:00Z\)/);
  expect(why).toContain('until node mobile/scripts/gate-lock.cjs check; do sleep 60; done');
  // A child of another gate, or one that sets the variable by hand to anything else, is refused too.
  expect(lock.refusal('a mutants run', { file, env: { [lock.CHILD]: 'other' }, said: quiet })).not.toBeNull();
  expect(lock.refusal('a mutants run', { file, env: { [lock.CHILD]: 't0ken' }, said: quiet })).toBeNull();
  // A lock written by hand holds no token: every heavy run waits, but one under a gate's variable.
  held(null);
  expect(lock.refusal('a mutants run', { file, env: {}, said: quiet })).toMatch(/integrator I2, by hand/);
  expect(lock.refusal('a mutants run', { file, env: { [lock.CHILD]: 'any' }, said: quiet })).toBeNull();
});

it('takes a lock whose holder no longer runs for gone, removes it, and says so', () => {
  held('t0ken', 999999);
  const said: string[] = [];
  expect(lock.lockNow(file, (s) => said.push(s), () => false)).toBeNull();
  expect([existsSync(file), said[0]]).toEqual([false, expect.stringContaining('process 999999, no longer runs; removed')]);
});

it('refuses a wide jest run beside a gate, and lets a narrow one run', () => {
  held('t0ken');
  const opts = { file, env: {}, said: () => undefined };
  expect(sequencer.wideRefusal(sequencer.WIDE + 1, opts)).toMatch(/^a jest run of 21 test files refused/);
  expect(sequencer.wideRefusal(sequencer.WIDE, opts)).toBeNull();
});

it('holds the lock for the command\'s whole run, its children passing, and lets it go when the command fails', () => {
  const probe = join(dir, 'probe.txt');
  const env = { ...process.env, RH_GATE_LOCK: file };
  // The command itself is a child of the hold: it reads the lock and asks the refusal, as the gate does.
  const body = `const g=require(${JSON.stringify(SCRIPT)});const fs=require('fs');fs.writeFileSync(${JSON.stringify(probe)},JSON.stringify({there:fs.existsSync(${JSON.stringify(file)}),refused:g.refusal('x',{file:${JSON.stringify(file)}})}));process.exit(3)`;
  const r = spawnSync(process.execPath, [SCRIPT, 'hold', '--who', 'the test', '--', process.execPath, '-e', body], { env, encoding: 'utf8' });
  expect(r.status).toBe(3);
  expect(JSON.parse(readFileSync(probe, 'utf8'))).toEqual({ there: true, refused: null });
  expect(existsSync(file)).toBe(false);
  // Outside the hold, the check says who holds it; free, it says so.
  held('t0ken');
  const check = spawnSync(process.execPath, [SCRIPT, 'check'], { env, encoding: 'utf8' });
  expect([check.status, check.stderr]).toEqual([1, expect.stringContaining('push-head.ps1')]);
  // A second gate is refused while the first holds it, and the first's lock is left as it was.
  const second = spawnSync(process.execPath, [SCRIPT, 'hold', '--who', 'second', '--', process.execPath, '-e', '0'], { env, encoding: 'utf8' });
  expect([second.status, second.stderr]).toEqual([3, expect.stringContaining('One gate at a time')]);
  expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('t0ken');
}, 30_000);
