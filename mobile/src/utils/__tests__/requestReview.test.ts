/**
 * requestReview.test.ts — locks the App Store review gates.
 *
 * These test the REAL exported decision function, not a mirrored copy of it.
 * The prompt is invisible in TestFlight (Apple no-ops SKStoreReviewController
 * there), so this suite is the only pre-release verification that exists.
 *
 * Pattern copied from useInitiation.test.ts: extract the decision, test it
 * directly. renderHook is async in this environment (useAuthThrottle.pbt.test.ts:5).
 */
import {
  shouldRequestReview,
  MIN_LOGS_FOR_REVIEW,
  MIN_DAYS_BETWEEN_PROMPTS,
  MAX_LIFETIME_PROMPTS,
} from '../requestReview';

const NOW = Date.parse('2026-07-30T12:00:00.000Z');
const daysAgo = (d: number) => NOW - d * 86_400_000;

// A member who qualifies on every axis — each test breaks exactly one.
const OK = { logCount: 10, lastPrompt: 0, totalPrompts: 0, now: NOW };

describe('shouldRequestReview — engagement gate', () => {
  it('never fires below the minimum film count', () => {
    for (let n = 0; n < MIN_LOGS_FOR_REVIEW; n++) {
      expect(shouldRequestReview({ ...OK, logCount: n })).toBe(false);
    }
  });

  it('fires exactly at the threshold', () => {
    expect(shouldRequestReview({ ...OK, logCount: MIN_LOGS_FOR_REVIEW })).toBe(true);
  });

  it('the off-by-one that matters: a 5th film qualifies, a 4th does not', () => {
    // useLogFlow passes logs.length + 1 because `logs` is the pre-await
    // snapshot. Filing a 5th film therefore arrives here as 5, not 4.
    expect(shouldRequestReview({ ...OK, logCount: 4 })).toBe(false);
    expect(shouldRequestReview({ ...OK, logCount: 5 })).toBe(true);
  });

  it('refuses corrupt counts rather than trusting them', () => {
    expect(shouldRequestReview({ ...OK, logCount: NaN })).toBe(false);
    expect(shouldRequestReview({ ...OK, logCount: -1 })).toBe(false);
    // Infinity is NOT finite — a corrupt count must not buy a prompt.
    expect(shouldRequestReview({ ...OK, logCount: Infinity })).toBe(false);
  });
});

describe('shouldRequestReview — cooldown', () => {
  it('a never-prompted member is not treated as prompted at the epoch', () => {
    expect(shouldRequestReview({ ...OK, lastPrompt: 0 })).toBe(true);
  });

  it('stays silent inside the cooldown window', () => {
    expect(shouldRequestReview({ ...OK, lastPrompt: daysAgo(1) })).toBe(false);
    expect(shouldRequestReview({ ...OK, lastPrompt: daysAgo(MIN_DAYS_BETWEEN_PROMPTS - 1) })).toBe(false);
  });

  it('the window boundary is exact', () => {
    expect(shouldRequestReview({ ...OK, lastPrompt: daysAgo(MIN_DAYS_BETWEEN_PROMPTS) })).toBe(true);
  });

  it('fires again well after the window', () => {
    expect(shouldRequestReview({ ...OK, lastPrompt: daysAgo(365) })).toBe(true);
  });
});

describe('shouldRequestReview — lifetime cap', () => {
  it('allows prompts up to the cap', () => {
    expect(shouldRequestReview({ ...OK, totalPrompts: MAX_LIFETIME_PROMPTS - 1 })).toBe(true);
  });

  it('never fires once the cap is reached', () => {
    expect(shouldRequestReview({ ...OK, totalPrompts: MAX_LIFETIME_PROMPTS })).toBe(false);
    expect(shouldRequestReview({ ...OK, totalPrompts: 99 })).toBe(false);
  });

  it('the cap holds even for a heavily engaged member long past the cooldown', () => {
    expect(shouldRequestReview({
      logCount: 5000, lastPrompt: daysAgo(1000), totalPrompts: MAX_LIFETIME_PROMPTS, now: NOW,
    })).toBe(false);
  });
});

describe('shouldRequestReview — Apple safety', () => {
  it('stays far under Apple\'s 3-per-365-days with a 90-day cooldown', () => {
    // Walk a year at the fastest cadence the gates permit.
    let fired = 0;
    let lastPrompt = 0;
    let totalPrompts = 0;
    for (let day = 0; day <= 365; day++) {
      const now = NOW + day * 86_400_000;
      if (shouldRequestReview({ logCount: 100, lastPrompt, totalPrompts, now })) {
        fired++; lastPrompt = now; totalPrompts++;
      }
    }
    expect(fired).toBeLessThanOrEqual(5); // 90-day spacing => at most ~5 in a year
    expect(fired).toBeGreaterThan(0);
  });
});
