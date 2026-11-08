/**
 * waits.test.ts — a wait is never held by a phone's clock set back (src/lib/waits.ts).
 *
 * monotonicNow counts forward whatever the phone's clock does; agedSince reads a stamp in the future
 * (the clock set back since it was stamped) as long past, so a cached answer is old, never fresh.
 */
import { agedSince, monotonicNow } from '../waits';

afterEach(() => jest.restoreAllMocks());

it("counts forward on its own clock, whatever the phone's clock is set to", () => {
  const before = monotonicNow();
  jest.spyOn(Date, 'now').mockReturnValue(0);
  expect(monotonicNow()).toBeGreaterThanOrEqual(before);
});

it('reads how long ago a stamp was on the phone\'s clock', () => {
  expect(agedSince(1_000, 61_000)).toBe(60_000);
  expect(agedSince(61_000, 61_000)).toBe(0);
});

it('reads a stamp in the future as long past: a clock set back makes it old, never fresh', () => {
  expect(agedSince(61_000, 1_000)).toBe(Infinity);
  jest.spyOn(Date, 'now').mockReturnValue(1_000);
  expect(agedSince(61_000)).toBe(Infinity);
});
