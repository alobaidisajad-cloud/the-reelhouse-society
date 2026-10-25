/**
 * runtimeDump.test.ts — the phone's runtime, as the E2E build writes it in
 * parts, is joined per launch and held to the committed copy; and it says no
 * to a part lost, a name changed, and a copy never committed.
 *
 * runtime-dump.mjs is run as run-flows.sh runs it, on lines in logcat's
 * threadtime shape, written the way src/utils/e2eRuntime.ts writes them.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runtimeLines } from '@/src/utils/e2eRuntime';

const SCRIPT = join(__dirname, '..', 'runtime-dump.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'runtime-dump-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A launch's lines, from the app's own writer: many globals, so several parts. */
const GLOBALS = Array.from({ length: 400 }, (_, i) => `name${String(i).padStart(3, '0')}`);
const launch = (pid: number, dump: Record<string, string[] | null>) => Object.entries(dump)
  .flatMap(([of, names]) => runtimeLines(of, names))
  .map((l) => `10-02 18:01:02.345  ${pid}  ${pid + 20} W ReactNativeJS: [e2e] runtime ${JSON.stringify(l)}`);
const PHONE = { globalThis: GLOBALS, 'AbortSignal': ['prototype', 'abort'], 'Intl': null };

function run(log: string[], copy?: unknown) {
  writeFileSync(join(dir, 'logcat.txt'), log.join('\n'));
  if (copy !== undefined) writeFileSync(join(dir, 'copy.json'), JSON.stringify(copy));
  else rmSync(join(dir, 'copy.json'), { force: true });
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'logcat.txt'), '--copy', join(dir, 'copy.json'),
    '--write', join(dir, 'phone-runtime.json')], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
}

it('the app writes a long list in parts, each well inside a log line', () => {
  const lines = launch(100, PHONE);
  expect(lines.filter((l) => l.includes('"of":"globalThis"')).length).toBeGreaterThan(1);
  for (const l of lines) expect(Buffer.byteLength(l)).toBeLessThan(3200);
});

it('joins each launch\'s parts, passes a runtime equal to the copy, and keeps it for the logs', () => {
  const { code, out } = run([...launch(100, PHONE), ...launch(200, PHONE)], PHONE);
  expect(out).toContain("The phone's runtime, written by 2 launches, is the committed copy");
  expect(code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'phone-runtime.json'), 'utf8'))).toEqual({ ...PHONE, AbortSignal: ['abort', 'prototype'] });
});

it('says NO to a runtime that is not the copy, naming what each side has', () => {
  const { code, out } = run(launch(100, { ...PHONE, AbortSignal: ['prototype', 'abort', 'timeout'] }), PHONE);
  expect(code).toBe(1);
  expect(out).toContain('AbortSignal: the phone has timeout, the copy does not');
});

it('holds a global a native module installs late to no moment, and only that one, only on globalThis', () => {
  // One launch has it, another not, the copy neither: none of them is a difference.
  const late = { ...PHONE, globalThis: [...GLOBALS, 'isViewFlatteningDisabled'] };
  const passed = run([...launch(100, late), ...launch(200, PHONE)], PHONE);
  expect(passed.code).toBe(0);
  // Any other new global still fails, and the late name is not excused on a built-in.
  const other = run(launch(100, { ...late, globalThis: [...late.globalThis, 'somethingNew'] }), PHONE);
  expect(other.code).toBe(1);
  expect(other.out).toContain('globalThis: the phone has somethingNew, the copy does not');
  expect(other.out).not.toContain('isViewFlatteningDisabled');
  const onABuiltIn = run(launch(100, { ...PHONE, AbortSignal: ['prototype', 'abort', 'isViewFlatteningDisabled'] }), PHONE);
  expect(onABuiltIn.out).toContain('AbortSignal: the phone has isViewFlatteningDisabled, the copy does not');
});

it('says NO to a part that never reached the log', () => {
  const lines = launch(100, PHONE);
  const cut = lines.filter((l) => !l.includes('"part":2,'));
  expect(cut.length).toBeLessThan(lines.length);
  const { code, out } = run(cut, PHONE);
  expect(code).toBe(1);
  expect(out).toMatch(/launch 100 wrote its runtime incompletely: globalThis part 2 of \d/);
});

it('says NO to a run in which no launch wrote one, and to a copy never committed — naming the file to commit', () => {
  expect(run(['10-02 18:01:02.345  100  120 W ReactNativeJS: [e2e] screen.ready {"name":"lobby","ms":1}'], PHONE).out)
    .toContain('no launch wrote a whole runtime');
  const { code, out } = run(launch(100, PHONE));
  expect(code).toBe(1);
  expect(out).toContain("there is no committed copy of the phone's runtime");
  expect(out).toContain('commit this run\'s phone-runtime.json (in its e2e-logs)');
  expect(existsSync(join(dir, 'phone-runtime.json'))).toBe(true);
});
