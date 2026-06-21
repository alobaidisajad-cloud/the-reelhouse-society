/**
 * D-01: Constants tests — verifies magic number extraction (B-06)
 * and ensures limits are sensible ranges.
 * Updated to match the restructured nested-object exports in limits.ts.
 */
import { FETCH_LIMITS, CACHE_LIMITS, QUEUE_LIMITS, CIRCUIT_BREAKER, INPUT_LIMITS } from '../../constants/limits';

describe('limits constants', () => {
  it('should have sensible fetch limits', () => {
    expect(FETCH_LIMITS.MESSAGES_PER_PAGE).toBeGreaterThanOrEqual(20);
    expect(FETCH_LIMITS.MESSAGES_PER_PAGE).toBeLessThanOrEqual(200);
    expect(FETCH_LIMITS.LOUNGES_BROWSE_LIMIT).toBeGreaterThan(0);
    expect(FETCH_LIMITS.LOUNGES_BROWSE_LIMIT).toBeLessThanOrEqual(100);
  });

  it('should have sensible hydration page limit', () => {
    expect(FETCH_LIMITS.MAX_HYDRATE_PAGES).toBeGreaterThanOrEqual(5);
    expect(FETCH_LIMITS.MAX_HYDRATE_PAGES).toBeLessThanOrEqual(50);
  });

  it('should have dedup retain less than dedup max', () => {
    expect(CACHE_LIMITS.MESSAGE_DEDUP_SET_RETAIN).toBeLessThan(CACHE_LIMITS.MESSAGE_DEDUP_SET_CAP);
  });

  it('should have positive queue limits', () => {
    expect(QUEUE_LIMITS.MAX_QUEUE_SIZE).toBeGreaterThan(0);
    expect(QUEUE_LIMITS.CHUNK_SIZE).toBeGreaterThan(0);
  });

  it('should have sensible input limits', () => {
    expect(INPUT_LIMITS.MAX_MESSAGE_LENGTH).toBeGreaterThan(0);
    expect(INPUT_LIMITS.MAX_REVIEW_LENGTH).toBeGreaterThan(INPUT_LIMITS.MAX_MESSAGE_LENGTH);
    expect(INPUT_LIMITS.MAX_BIO_LENGTH).toBeGreaterThan(0);
  });

  it('should have positive circuit breaker values', () => {
    expect(CIRCUIT_BREAKER.BACKOFF_BASE_MS).toBeGreaterThan(0);
    expect(CIRCUIT_BREAKER.BACKOFF_MAX_MS).toBeGreaterThan(CIRCUIT_BREAKER.BACKOFF_BASE_MS);
  });

  it('should have stale threshold > 1 day', () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    expect(QUEUE_LIMITS.STALE_THRESHOLD_MS).toBeGreaterThanOrEqual(ONE_DAY_MS);
  });
});
