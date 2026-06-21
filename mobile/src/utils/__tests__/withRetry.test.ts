/**
 * withRetry.test.ts — Exponential Backoff Retry Tests
 * ────────────────────────────────────────────────────
 * Tests the resilient retry wrapper used for critical
 * network operations throughout the app.
 */
import { withRetry } from '../withRetry';

describe('withRetry', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('returns result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 }))
      .rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry non-retryable errors (401)', async () => {
    const fn = jest.fn().mockRejectedValue({ status: 401, message: 'Unauthorized' });

    await expect(withRetry(fn, { 
      maxRetries: 3, 
      baseDelay: 10,
      shouldRetry: (err: unknown) => {
        if (err && typeof err === 'object' && 'status' in err) {
          const status = (err as { status: number }).status;
          return status !== 401 && status !== 403 && status !== 404;
        }
        return true;
      }
    })).rejects.toEqual({ status: 401, message: 'Unauthorized' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects maxRetries parameter', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(withRetry(fn, { maxRetries: 0, baseDelay: 10 }))
      .rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
