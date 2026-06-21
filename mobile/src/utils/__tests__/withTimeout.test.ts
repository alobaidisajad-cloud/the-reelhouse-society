/**
 * withTimeout.test.ts — Unit tests for the request timeout utility.
 * Validates timeout behavior, error passthrough, and default values.
 */
import { withTimeout } from '../withTimeout';

// Mock logger to prevent console output during tests
jest.mock('../logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    alert: jest.fn(),
  },
}));

describe('withTimeout', () => {
  it('resolves when fn completes before timeout', async () => {
    const result = await withTimeout(
      async () => 'success',
      5000,
      'test',
    );
    expect(result).toBe('success');
  });

  it('passes AbortSignal to the function', async () => {
    let receivedSignal: AbortSignal | undefined;

    await withTimeout(
      async (signal) => {
        receivedSignal = signal;
        return 'ok';
      },
      5000,
    );

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(false);
  });

  it('re-throws non-timeout errors unchanged', async () => {
    const originalError = new Error('db_connection_failed');
    await expect(
      withTimeout(
        async () => { throw originalError; },
        5000,
        'test',
      ),
    ).rejects.toThrow('db_connection_failed');
  });

  it('uses default 15s timeout when ms not specified', async () => {
    // Should resolve immediately since no actual timeout occurs
    const result = await withTimeout(async () => 42);
    expect(result).toBe(42);
  });

  it('throws AppError with timeout code on AbortError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    await expect(
      withTimeout(
        async () => { throw abortError; },
        5000,
        'slow_op',
      ),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: 'TIMEOUT',
    });
  });

  it('throws AppError with timeout code on TimeoutError', async () => {
    const timeoutError = new Error('signal timed out');
    timeoutError.name = 'TimeoutError';

    await expect(
      withTimeout(
        async () => { throw timeoutError; },
        5000,
        'tmdb_search',
      ),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: 'TIMEOUT',
    });
  });
});
