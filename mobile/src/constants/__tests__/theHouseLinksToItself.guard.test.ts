/**
 * theHouseLinksToItself.guard.test.ts — a link sent out of the app goes to the
 * house.
 *
 * A shared essay carried https://reelhouse.app/dispatch and a shared film
 * https://reelhouse.app/film/<id>. That domain is another company's film app,
 * and its /dispatch is a 404: every stranger the member shared with was sent to
 * someone else's product. The house is HOUSE_WEB, said once in support.ts.
 */
import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { MOBILE, readCode } from '@/test-utils/readCode';
import { HOUSE_WEB } from '@/src/constants/support';

// In any case: the share card printed it as REELHOUSE.APP, and a check that
// read only lower case passed it.
const ELSEWHERE = /reelhouse\.app\b/i;

/** Files the last sweep read: a sweep that read none would find nothing, and pass. */
let scanned = 0;

function naming(): string[] {
  const found: string[] = [];
  scanned = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p); continue; }
      if (!/\.tsx?$/.test(name) || /\.test\./.test(name)) continue;
      scanned++;
      if (ELSEWHERE.test(readCode(p))) found.push(relative(MOBILE, p).split(sep).join('/'));
    }
  };
  walk(join(MOBILE, 'app'));
  walk(join(MOBILE, 'src'));
  return found;
}

it('the house is its own domain', () => {
  expect(HOUSE_WEB).toBe('https://www.thereelhousesociety.com');
});

it('no code sends anyone to reelhouse.app', () => {
  expect(naming()).toEqual([]);
  expect(scanned).toBeGreaterThan(300);
});
