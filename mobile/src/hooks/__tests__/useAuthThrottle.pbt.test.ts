/**
 * useAuthThrottle.pbt.test.ts — property tests against the REAL throttle rule.
 *
 * The previous version re-declared MAX_ATTEMPTS and WINDOW_MS locally and
 * property-tested its own copy of the logic — so it would have passed even if
 * the hook's rule changed underneath it. This is a brute-force control, where
 * "we think it locks out" is not good enough.
 *
 * evaluateAuthThrottle is now the rule the hook itself calls, so these tests
 * bind to what actually runs.
 */
import fc from 'fast-check';
import { evaluateAuthThrottle, MAX_ATTEMPTS, WINDOW_MS } from '../useAuthThrottle';

jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

const NOW = Date.parse('2026-07-30T12:00:00.000Z');
const agoMs = (ms: number) => NOW - ms;

describe('evaluateAuthThrottle — the lockout rule', () => {
  it('allows attempts below the cap', () => {
    for (let n = 0; n < MAX_ATTEMPTS; n++) {
      const attempts = Array.from({ length: n }, () => agoMs(1000));
      expect(evaluateAuthThrottle(attempts, NOW).locked).toBe(false);
    }
  });

  it('locks exactly AT the cap, not one past it', () => {
    const attempts = Array.from({ length: MAX_ATTEMPTS }, () => agoMs(1000));
    expect(evaluateAuthThrottle(attempts, NOW).locked).toBe(true);
  });

  it('prunes attempts that have aged out of the window', () => {
    const stale = Array.from({ length: MAX_ATTEMPTS }, () => agoMs(WINDOW_MS + 1));
    const r = evaluateAuthThrottle(stale, NOW);
    expect(r.pruned).toHaveLength(0);
    expect(r.locked).toBe(false);
  });

  it('an attempt exactly at the window edge has expired', () => {
    const edge = Array.from({ length: MAX_ATTEMPTS }, () => agoMs(WINDOW_MS));
    expect(evaluateAuthThrottle(edge, NOW).locked).toBe(false);
  });

  it('counts down from the OLDEST attempt — a rolling window, not a fixed penalty', () => {
    // A later attempt must not extend an existing lockout, or a bot hammering
    // the endpoint would keep a legitimate member locked out indefinitely.
    const attempts = [agoMs(50_000), agoMs(1000), agoMs(900), agoMs(800), agoMs(700)];
    const r = evaluateAuthThrottle(attempts, NOW);
    expect(r.locked).toBe(true);
    expect(r.secondsRemaining).toBe(10);   // oldest expires 10s from now
  });

  it('the lockout clears once the oldest attempt expires', () => {
    const attempts = Array.from({ length: MAX_ATTEMPTS }, () => agoMs(30_000));
    expect(evaluateAuthThrottle(attempts, NOW).locked).toBe(true);
    expect(evaluateAuthThrottle(attempts, NOW + 30_001).locked).toBe(false);
  });

  it('drops corrupt timestamps instead of trusting them', () => {
    // A NaN survives every comparison; left in, it would wedge the lockout
    // permanently and lock a member out of their own account for good.
    const attempts = [NaN, Infinity, agoMs(1000)];
    const r = evaluateAuthThrottle(attempts, NOW);
    expect(r.pruned).toEqual([agoMs(1000)]);
    expect(r.locked).toBe(false);
  });
});

describe('evaluateAuthThrottle — properties', () => {
  it('PROPERTY: never reports a negative countdown', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: NOW - 200_000, max: NOW }), { maxLength: 20 }), (attempts) => {
        expect(evaluateAuthThrottle(attempts, NOW).secondsRemaining).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 400 },
    );
  });

  it('PROPERTY: locked implies at least MAX_ATTEMPTS live attempts', () => {
    // The control must never lock someone out without the attempts to justify it.
    fc.assert(
      fc.property(fc.array(fc.integer({ min: NOW - 200_000, max: NOW }), { maxLength: 20 }), (attempts) => {
        const r = evaluateAuthThrottle(attempts, NOW);
        if (r.locked) expect(r.pruned.length).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
      }),
      { numRuns: 400 },
    );
  });

  it('PROPERTY: pruning only ever removes, never invents an attempt', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: NOW - 200_000, max: NOW }), { maxLength: 20 }), (attempts) => {
        const { pruned } = evaluateAuthThrottle(attempts, NOW);
        expect(pruned.length).toBeLessThanOrEqual(attempts.length);
        for (const t of pruned) expect(attempts).toContain(t);
      }),
      { numRuns: 400 },
    );
  });

  it('PROPERTY: enough attempts inside the window ALWAYS locks', () => {
    // The security guarantee itself — no arrangement of timestamps may evade it.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: WINDOW_MS - 1000 }), { minLength: MAX_ATTEMPTS, maxLength: 15 }),
        (offsets) => {
          const attempts = offsets.map(o => NOW - o);
          expect(evaluateAuthThrottle(attempts, NOW).locked).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('PROPERTY: never throws, whatever it is handed', () => {
    fc.assert(
      fc.property(fc.array(fc.double(), { maxLength: 20 }), (attempts) => {
        expect(() => evaluateAuthThrottle(attempts, NOW)).not.toThrow();
      }),
      { numRuns: 400 },
    );
  });
});
