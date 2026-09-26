/**
 * markCounts — one number per log, the same on every screen that draws it.
 * ─────────────────────────────────────────────────────────────────────────────
 *   shown = what the server last said + the member's taps it had not seen yet
 *
 * These pin the rule's edges: the race a naive "count − mine-then + mine-now"
 * gets wrong on every cold start, an answer that arrives out of order, a tap
 * still in flight, a write that fails, and a sign-out.
 */
import {
  useMarkCounts, tellMarkCounts, beginTap, settleTap, withdrawTap,
  selectMarkCount, resetMarkCounts,
} from '../markCounts';
import { resetAllStores } from '../resetAllStores';
import { markCount } from '@/src/schemas/feed.schema';

const shown = (id: string, fallback?: number | null, kind: 'certify' | 'critique' = 'certify') =>
  selectMarkCount(useMarkCounts.getState(), kind, id, fallback);

let now = 1_000;
beforeEach(() => {
  resetMarkCounts();
  now = 1_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

describe('what the server said', () => {
  it('is what a bar shows', () => {
    tellMarkCounts([{ id: 'a', certify: 12, critique: 3 }], now);
    expect(shown('a')).toBe(12);
    expect(shown('a', null, 'critique')).toBe(3);
  });

  it('nothing known is null, never a zero', () => {
    expect(shown('nobody-asked')).toBeNull();
    tellMarkCounts([{ id: 'a', certify: null, critique: undefined }], now);
    expect(shown('a')).toBeNull();
  });

  it('an answer without a count leaves the last count standing', () => {
    tellMarkCounts([{ id: 'a', certify: 7 }], now);
    tellMarkCounts([{ id: 'a', certify: null }], now + 10);
    expect(shown('a')).toBe(7);
  });

  it('an older answer arriving late never overwrites a newer one', () => {
    tellMarkCounts([{ id: 'a', certify: 9 }], 2_000);
    tellMarkCounts([{ id: 'a', certify: 4 }], 1_500);
    expect(shown('a')).toBe(9);
  });

  it('a cached page stands in until an answer arrives, and then gives way', () => {
    expect(shown('a', 5)).toBe(5);
    tellMarkCounts([{ id: 'a', certify: 8 }], now);
    expect(shown('a', 5)).toBe(8);
  });
});

describe('the member’s own taps', () => {
  it('move the number the moment they are made', () => {
    tellMarkCounts([{ id: 'a', certify: 12 }], now);
    beginTap('certify', 'a', 1);
    expect(shown('a')).toBe(13);
  });

  it('THE COLD-START RACE: an answer that lands after a confirmed tap already counts it', () => {
    // The tap is sent and confirmed at t=1000; the feed is ASKED at t=1200 and
    // arrives holding the certification. Counting "mine" from the heart's index
    // would add it a second time whenever the index loaded late.
    const tap = beginTap('certify', 'a', 1);
    now = 1_000; settleTap('certify', 'a', tap);
    tellMarkCounts([{ id: 'a', certify: 13 }], 1_200);
    expect(shown('a')).toBe(13);
  });

  it('an answer asked BEFORE the tap was confirmed keeps the tap on top', () => {
    tellMarkCounts([{ id: 'a', certify: 12 }], 500);
    const tap = beginTap('certify', 'a', 1);
    now = 1_000; settleTap('certify', 'a', tap);
    tellMarkCounts([{ id: 'a', certify: 12 }], 900); // asked at 900, before the confirmation
    expect(shown('a')).toBe(13);
  });

  it('a tap still in flight is never dropped, whatever arrives', () => {
    beginTap('certify', 'a', 1);
    tellMarkCounts([{ id: 'a', certify: 12 }], 99_999);
    expect(shown('a')).toBe(13);
  });

  it('a write that failed takes its tap back', () => {
    tellMarkCounts([{ id: 'a', certify: 12 }], now);
    const tap = beginTap('certify', 'a', 1);
    withdrawTap('certify', 'a', tap);
    expect(shown('a')).toBe(12);
    expect(useMarkCounts.getState().taps.certify.a).toBeUndefined();
  });

  it('on a cached page, every tap of this session counts', () => {
    const tap = beginTap('critique', 'a', 1);
    settleTap('critique', 'a', tap);
    expect(shown('a', 2, 'critique')).toBe(3);
  });

  it('never draws below zero', () => {
    tellMarkCounts([{ id: 'a', certify: 0 }], now);
    beginTap('certify', 'a', -1);
    expect(shown('a')).toBe(0);
  });

  it('keeps the two counts, and two logs, apart', () => {
    tellMarkCounts([{ id: 'a', certify: 1, critique: 1 }, { id: 'b', certify: 1, critique: 1 }], now);
    beginTap('critique', 'a', 1);
    expect([shown('a'), shown('a', null, 'critique'), shown('b'), shown('b', null, 'critique')]).toEqual([1, 2, 1, 1]);
  });
});

describe('a count belongs to the viewer who fetched it', () => {
  it('sign-out empties the store', async () => {
    tellMarkCounts([{ id: 'a', certify: 12 }], now);
    beginTap('certify', 'a', 1);
    await resetAllStores('u1');
    expect(shown('a')).toBeNull();
    expect(useMarkCounts.getState().taps.certify).toEqual({});
  });
});

describe('markCount — however a count travelled', () => {
  it.each([
    [12, 12],
    [[{ count: 12 }], 12],
    ['12', 12],
    [0, 0],
    [[{ count: 0 }], 0],
    [undefined, null],
    [null, null],
    [[], null],
    [-1, null],
    ['twelve', null],
  ])('%j → %j', (input, want) => {
    expect(markCount.parse(input)).toBe(want);
  });
});
