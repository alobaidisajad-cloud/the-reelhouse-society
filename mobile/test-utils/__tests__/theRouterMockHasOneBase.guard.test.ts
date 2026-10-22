/**
 * theRouterMockHasOneBase.guard.test.ts — every mock of expo-router stands on one base.
 *
 * A test's own jest.mock('expo-router', ...) replaces jest.setup.ts's mock whole. Written from
 * scratch, it held only what its screen called the day it was written, and threw when the screen
 * came to call more: the stack page gained its ready mark, which waits on useFocusEffect, and its
 * tests and its generator (God-Tier 39836999393, every width) threw on a hook their mock lacked.
 * So every mock of it spreads test-utils/expoRouterMock.ts first, or the real module, and changes
 * only what it means to. Read from every test file, as each is written.
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { files as universe } from '@/test-utils/universe';
import { MOBILE } from '@/test-utils/readCode';

const BASE = "...require('@/test-utils/expoRouterMock').expoRouterMock(),";
const ACTUAL = "jest.requireActual('expo-router')";

/** Each mock of expo-router in a file, and whether it stands on the base or the real module. */
function mocksIn(src: string): { at: number; based: boolean }[] {
  const out: { at: number; based: boolean }[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf("jest.mock('expo-router'", from);
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

it('reads every test, and finds the mocks of expo-router among them', () => {
  expect(TESTS.length).toBeGreaterThan(400);
  expect(TESTS.filter((t) => mocksIn(t.src).length > 0).length).toBeGreaterThan(50);
});

it('every mock of expo-router spreads the one base, or the real module, first', () => {
  const loose = TESTS.flatMap((t) => mocksIn(t.src).filter((m) => !m.based).map((m) => `${t.rel}:${m.at}`));
  expect(loose).toEqual([]);
  expect(mocksIn("jest.mock('expo-router', () => ({\n  router: { push: jest.fn() },\n}));")).toEqual([{ at: 1, based: false }]);
  expect(mocksIn(`jest.mock('expo-router', () => ({\n  ${BASE}\n  useLocalSearchParams: () => ({}),\n}));`)).toEqual([{ at: 1, based: true }]);
});

it('jest.setup.ts mocks it with the same base', () => {
  expect(readFileSync(path.join(MOBILE, 'jest.setup.ts'), 'utf8'))
    .toContain("jest.mock('expo-router', () => require('./test-utils/expoRouterMock').expoRouterMock());");
});
