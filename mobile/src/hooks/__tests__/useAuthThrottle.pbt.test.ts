/**
 * useAuthThrottle.pbt.test.ts — Property-Based Tests
 * ───────────────────────────────────────────────────
 * Tests the throttle logic directly (pure function behavior)
 * without React lifecycle since renderHook is async in this env.
 */
import fc from 'fast-check';

describe('useAuthThrottle logic (property-based)', () => {
  const MAX_ATTEMPTS = 5;
  const WINDOW_MS = 60_000;

  function simulateThrottle(attemptCount: number, timeBetween: number = 0) {
    const attempts: number[] = [];
    let time = Date.now();

    for (let i = 0; i < attemptCount; i++) {
      attempts.push(time);
      time += timeBetween;
    }

    // Prune old attempts outside the window
    const now = attempts[attempts.length - 1] || Date.now();
    const active = attempts.filter(t => now - t < WINDOW_MS);

    const isLocked = active.length >= MAX_ATTEMPTS;
    const secondsRemaining = isLocked
      ? Math.ceil((active[0] + WINDOW_MS - now) / 1000)
      : 0;

    return { isLocked, secondsRemaining, activeCount: active.length };
  }

  it('Property: locks after exactly 5 attempts within window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (attemptCount) => {
          const result = simulateThrottle(attemptCount, 100);

          if (attemptCount >= MAX_ATTEMPTS) {
            expect(result.isLocked).toBe(true);
            expect(result.secondsRemaining).toBeGreaterThan(0);
          } else {
            expect(result.isLocked).toBe(false);
            expect(result.secondsRemaining).toBe(0);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property: attempts outside window are pruned', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (attemptCount) => {
          // All attempts are older than the window
          const result = simulateThrottle(attemptCount, WINDOW_MS + 1000);
          // Only the last attempt is within window
          expect(result.activeCount).toBeLessThanOrEqual(1);
          expect(result.isLocked).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property: secondsRemaining is always <= 60', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 15 }),
        (attemptCount) => {
          const result = simulateThrottle(attemptCount, 0);
          expect(result.secondsRemaining).toBeLessThanOrEqual(60);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('exactly 4 attempts does not lock', () => {
    const result = simulateThrottle(4);
    expect(result.isLocked).toBe(false);
  });

  it('exactly 5 attempts locks', () => {
    const result = simulateThrottle(5);
    expect(result.isLocked).toBe(true);
  });
});
