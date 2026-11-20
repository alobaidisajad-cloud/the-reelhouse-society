/**
 * speedRecord.test.ts — e2e/speed-record.mjs holds each screen to its floor from device logs planted
 * here: a page that holds what it draws has a floor of one frame, one that asks once a floor of its
 * answer and a frame, and one that asks after another is OVER by a round trip, named with its
 * requests and failing the record. The app's own measures say why when they were not measured, and
 * read the measured launch when they were. Run as CI runs it, a process of its own.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'speed-record.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'speed-record-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const clock = (ms: number) => `08:32:${String(10 + Math.floor(ms / 1000)).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
const request = (path: string, at: number, ms: number) =>
  `11-08 ${clock(at + ms)}  3891  4026 W ReactNativeJS: [e2e] request {"method":"GET","path":"${path}","at":"2026-11-08T${clock(at)}Z","ms":${ms},"status":200}`;
const ready = (name: string, end: number, ms: number) =>
  `11-08 ${clock(end)}  3891  4026 W ReactNativeJS: [e2e] screen.ready {"name":"${name}","ms":${ms}}`;

type Screen = { name: string; trips: number; trip: number; floor: number; now: number; gap: number };
function run(lines: string[], ...flags: string[]) {
  writeFileSync(join(dir, 'logcat.txt'), lines.join('\n'));
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'logcat.txt'), '--json', join(dir, 'rec.json'), ...flags], { encoding: 'utf8' });
  const rec = JSON.parse(readFileSync(join(dir, 'rec.json'), 'utf8')) as { screens: Screen[]; over: string[]; whole: Record<string, { value: number | null; why?: string }> };
  return { code: r.status, err: r.stderr, rec, screen: (n: string) => rec.screens.find((s) => s.name === n) };
}

it('gives a page that holds what it draws a floor of one frame, and its gap past it', () => {
  const { code, screen } = run([ready('log', 500, 120)]);
  expect(code).toBe(0);
  expect(screen('log')).toMatchObject({ trips: 0, trip: 0, floor: 17, now: 120, gap: 103 });
});

it('gives a page that asks once a floor of its own answer and a frame', () => {
  const { code, screen } = run([request('/rest/v1/dispatch_posts', 100, 300), ready('dispatch', 450, 400)]);
  expect(code).toBe(0);
  expect(screen('dispatch')).toMatchObject({ trips: 1, trip: 300, floor: 317, now: 400, gap: 83 });
});

it('fails a page that waits on a round trip after another, naming its requests', () => {
  const { code, err, rec } = run([request('/rest/v1/profiles', 100, 200), request('/rest/v1/logs', 320, 200), ready('member', 600, 520)]);
  expect(code).toBe(1);
  expect(rec.over).toEqual(['member: 2 round trips in a row, its floor allows 1 (/rest/v1/profiles | /rest/v1/logs)']);
  expect(err).toContain('Over the floor');
});

it('says why each of the app\'s own measures has no value, and reads the measured launch when there is one', () => {
  expect(run([ready('log', 500, 120)]).rec.whole).toMatchObject({
    coldStart: { value: null, why: 'not measured: no --cold dir given' },
    download: { value: null, why: expect.stringMatching(/^not measured: no --size record/) },
  });
  const cold = join(dir, 'cold');
  mkdirSync(cold);
  writeFileSync(join(cold, 'cold-from.txt'), '1');
  writeFileSync(join(cold, 'cold-am.txt'), 'Status: ok\nTotalTime: 1234\n');
  writeFileSync(join(cold, 'cold-meminfo.txt'), '  Native Heap:    40960\n');
  writeFileSync(join(dir, 'size.json'), JSON.stringify({ total: 9, parts: { 'apk:dex': 9 }, from: 'app.apk' }));
  expect(run([ready('log', 500, 120)], '--cold', cold, '--size', join(dir, 'size.json')).rec.whole).toMatchObject({
    coldStart: { value: 1234 }, memory: { value: 40 }, download: { value: 9 },
  });
});

it('refuses logs where no screen opened: nothing held to a floor is never a pass', () => {
  expect(run(['11-08 08:32:10.000  1  1 I nothing: here']).code).toBe(1);
});
