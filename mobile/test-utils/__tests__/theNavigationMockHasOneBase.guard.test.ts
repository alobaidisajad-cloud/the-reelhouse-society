/**
 * theNavigationMockHasOneBase.guard.test.ts — every mock of @react-navigation/native stands on one base.
 *
 * A test's own jest.mock('@react-navigation/native', ...) replaces jest.setup.ts's mock whole.
 * Written from scratch, 29 of them held only useIsFocused or useScrollToTop, and every screen with
 * the room's light threw when the light came to read NavigationContext (useScreenSeen, P0.112). So
 * every mock of it spreads test-utils/navigationMock.ts first, or the real module, and changes only
 * what it means to. Read from every test file, as each is written.
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { files as universe } from '@/test-utils/universe';
import { MOBILE } from '@/test-utils/readCode';

const BASE = "...require('@/test-utils/navigationMock').navigationMock(),";
const ACTUAL = "jest.requireActual('@react-navigation/native')";

/** Each mock of the module in a file, and whether it stands on the base or the real module. */
function mocksIn(src: string): { at: number; based: boolean }[] {
  const out: { at: number; based: boolean }[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf("jest.mock('@react-navigation/native'", from);
    if (at < 0) return out;
    // The factory's opening: up to its first property, or its first statements in a block body.
    const head = src.slice(at, at + 400);
    out.push({ at: src.slice(0, at).split('\n').length, based: head.includes(BASE) || head.includes(ACTUAL) });
    from = at + 1;
  }
}

// Not this file: it names the mock to show what it reads.
const TESTS = universe('tests').filter((f) => /\.test\.tsx?$/.test(f) && path.resolve(f) !== path.resolve(__filename))
  .map((f) => ({ rel: path.relative(MOBILE, f).replace(/\\/g, '/'), src: readFileSync(f, 'utf8') }));

it('reads every test, and finds the mocks of @react-navigation/native among them', () => {
  expect(TESTS.length).toBeGreaterThan(400);
  expect(TESTS.filter((t) => mocksIn(t.src).length > 0).length).toBeGreaterThan(30);
});

it('every mock of @react-navigation/native spreads the one base, or the real module, first', () => {
  const loose = TESTS.flatMap((t) => mocksIn(t.src).filter((m) => !m.based).map((m) => `${t.rel}:${m.at}`));
  expect(loose).toEqual([]);
  expect(mocksIn("jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));")).toEqual([{ at: 1, based: false }]);
  expect(mocksIn(`jest.mock('@react-navigation/native', () => ({ ${BASE} useIsFocused: () => true }));`)).toEqual([{ at: 1, based: true }]);
});

it('jest.setup.ts mocks it with the same base', () => {
  expect(readFileSync(path.join(MOBILE, 'jest.setup.ts'), 'utf8'))
    .toContain("jest.mock('@react-navigation/native', () => require('./test-utils/navigationMock').navigationMock());");
});
