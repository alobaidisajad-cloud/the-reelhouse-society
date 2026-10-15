/**
 * everyDoorGoesThroughNav.test.ts — the app travels through `nav`, not the raw router.
 * ─────────────────────────────────────────────────────────────────────────────
 * `nav` (typedRouter) keeps one history and breaks a loop: the same page a third
 * time replaces rather than stacks. A raw `router.push` skips both, and needs an
 * `as any` to type. These are counted EXACTLY: a feature's audit moves its calls
 * to `nav` and lowers the count here, and no new raw call can be added unseen.
 */
import { relative, sep } from 'path';
import { MOBILE, readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const RAW = /\brouter\.(push|replace|navigate)\b/;
/** The one file that may drive the router: nav itself. */
const HOME = 'src/utils/typedRouter.ts';
const MOST = 23;

function rawCalls(): Map<string, number> {
  const found = new Map<string, number>();
  for (const p of universe('appCode')) {
    const rel = relative(MOBILE, p).split(sep).join('/');
    if (rel === HOME) continue;
    const n = (readCode(p).match(new RegExp(RAW.source, 'g')) ?? []).length;
    if (n) found.set(rel, n);
  }
  return found;
}

describe('every door goes through nav', () => {
  it('the scan can see a raw call, and nav\'s own file is the one it skips', () => {
    expect(readCode(HOME)).toMatch(RAW);
    expect([...rawCalls().keys()].length).toBeGreaterThan(0);
  });

  it(`raw router calls outside nav are exactly ${MOST}, and only fewer from here`, () => {
    const total = [...rawCalls().values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(MOST);
  });
});
