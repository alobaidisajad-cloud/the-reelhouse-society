/**
 * criticalPath.test.ts — e2e/critical-path.mjs counts the round trips a screen waited on in a
 * row, and the phone's own time after its last answer, from device logs planted here (WORKLIST
 * P4.53): a page that holds what it draws waited on none, one asked once on one, one asked after
 * another on two, and two asked together on one. Run as CI runs it, a process of its own.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'critical-path.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'critical-path-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** `ms` past 08:32:10, as the device log and the request's own stamp write it. */
const clock = (ms: number) => `08:32:${String(10 + Math.floor(ms / 1000)).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
/** A request begun `at` ms past 08:32:10 and answered `ms` later. */
const request = (path: string, at: number, ms: number) =>
  `11-08 ${clock(at + ms)}  3891  4026 W ReactNativeJS: [e2e] request {"method":"GET","path":"${path}","at":"2026-11-08T${clock(at)}Z","ms":${ms},"status":200}`;
/** A screen ready `end` ms past 08:32:10, after `ms` of opening. */
const ready = (name: string, end: number, ms: number) =>
  `11-08 ${clock(end)}  3891  4026 W ReactNativeJS: [e2e] screen.ready {"name":"${name}","ms":${ms}}`;

function run(lines: string[], ...flags: string[]) {
  writeFileSync(join(dir, 'logcat.txt'), lines.join('\n'));
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'logcat.txt'), ...flags], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
}
const openings = (lines: string[]) =>
  JSON.parse(run(lines, '--json').out) as { name: string; trips: number; paths: string[]; phone: number; stages: Record<string, number> }[];
/** A stage of an opening, `at` ms past 08:32:10: a data mark (`film.data`) or a part drawn. */
const stage = (name: string, at: number) => name.endsWith('.data')
  ? `11-08 ${clock(at)}  3891  4026 W ReactNativeJS: [e2e] ${name} {"id":1}`
  : `11-08 ${clock(at)}  3891  4026 W ReactNativeJS: [e2e] drawn {"name":"${name}"}`;

it("counts none for a page drawn from what it holds, its time all the phone's", () => {
  expect(openings([ready('log', 500, 120)])).toEqual([{ name: 'log', ms: 120, trips: 0, paths: [], phone: 120, stages: {} }]);
});

it("counts one round trip, and the phone's time from its answer to ready", () => {
  expect(openings([request('/rest/v1/dispatch_posts?select=id', 100, 300), ready('dispatch', 450, 400)])[0])
    .toMatchObject({ trips: 1, paths: ['/rest/v1/dispatch_posts'], phone: 50 });
});

it('counts two in a row when one is asked only after another is answered', () => {
  expect(openings([request('/rest/v1/profiles', 100, 200), request('/rest/v1/logs', 320, 200), ready('member', 600, 520)])[0])
    .toMatchObject({ trips: 2, phone: 80 });
});

it('counts one for two asked together, and nothing answered before the screen opened or after it was ready', () => {
  expect(openings([
    request('/rest/v1/early', 0, 50),
    request('/rest/v1/logs', 100, 200), request('/rest/v1/log_comments', 105, 210),
    request('/rest/v1/after', 300, 300),
    ready('log', 400, 320),
  ])[0]).toMatchObject({ trips: 1, paths: ['/rest/v1/logs', '/rest/v1/log_comments'] });
});

it("reports per screen, naming the deepest opening's requests when one waited on more than one", () => {
  const { code, out } = run([
    request('/rest/v1/profiles', 100, 200), request('/rest/v1/logs', 320, 200), ready('member', 600, 520),
    ready('member', 900, 50),
  ]);
  expect(code).toBe(0);
  expect(out).toMatch(/member\s+2\s+2,\s+2/);
  expect(out).toContain('its deepest: profiles | logs');
});

it("says where the phone's time went after the answer: each stage of the opening, its own screen's alone", () => {
  const lines = [
    request('/functions/v1/tmdb-proxy', 100, 300),
    stage('film.data', 420), stage('film.hero', 700), ready('film', 760, 700), stage('film.below', 1200),
    stage('reel.rows', 710),
  ];
  expect(openings(lines)[0].stages).toEqual({ 'film.data': 20, 'film.hero': 300, 'film.below': 800 });
  expect(run(lines).out).toContain('after its answer: film.data +20 ms, film.hero +300 ms, ready +360 ms, film.below +800 ms');
});
