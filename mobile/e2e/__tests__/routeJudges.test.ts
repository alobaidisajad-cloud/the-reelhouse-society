/**
 * routeJudges.test.ts — the route walk's judge (e2e/route-judges.mjs), run as run-flows.sh runs it:
 * it passes a walk that captured every planned route as a picture, and says NO to a route never
 * captured, to an empty capture, to a capture that is no picture, and to a plan of no route at all.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'route-judges.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'route-judges-')); mkdirSync(join(dir, 'routes')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A picture as the walk takes one: PNG's own first bytes, and room enough to hold a screen. */
const picture = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4096, 7)]);
const PLAN = ['app/film/[id].tsx\t/film/129\t01-film-id.png', 'app/settings.tsx\t/settings\t02-settings.png'];
const judge = (plan: string[]) => {
  writeFileSync(join(dir, 'walk.tsv'), plan.map((l) => `${l}\n`).join(''));
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
};

it('passes a walk that captured every route it planned', () => {
  writeFileSync(join(dir, 'routes', '01-film-id.png'), picture());
  writeFileSync(join(dir, 'routes', '02-settings.png'), picture());
  const r = judge(PLAN);
  expect([r.status, r.stdout.trim()]).toEqual([0, 'every route captured: 2']);
});

it('names a route never captured, one captured empty, and one captured as no picture', () => {
  writeFileSync(join(dir, 'routes', '01-film-id.png'), Buffer.alloc(10));
  const r = judge([...PLAN, 'app/log/[id].tsx\t/log/l-1\t03-log-id.png']);
  writeFileSync(join(dir, 'routes', '03-log-id.png'), Buffer.alloc(4096, 1));
  const again = judge([...PLAN, 'app/log/[id].tsx\t/log/l-1\t03-log-id.png']);
  expect([r.status, r.stdout.split('\n').slice(0, 3)]).toEqual([1, [
    '✗ app/film/[id].tsx (/film/129): captured empty',
    '✗ app/settings.tsx (/settings): not captured',
    '✗ app/log/[id].tsx (/log/l-1): not captured',
  ]]);
  expect(again.stdout).toContain('✗ app/log/[id].tsx (/log/l-1): captured as no picture');
});

it('refuses a plan of no route, and no plan at all, as unread', () => {
  expect([judge([]).status, judge([]).stderr.trim()]).toEqual([2, 'the walk planned no route: nothing was walked, so nothing is proven']);
  expect(spawnSync(process.execPath, [SCRIPT, join(dir, 'nowhere')], { encoding: 'utf8' }).status).toBe(2);
});
