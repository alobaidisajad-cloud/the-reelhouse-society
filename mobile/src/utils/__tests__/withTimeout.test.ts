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
    const clock = jest.spyOn(global, 'setTimeout');
    try {
      const result = await withTimeout(async () => 42);
      expect(result).toBe(42);
      expect(clock).toHaveBeenCalledWith(expect.any(Function), 15_000);
    } finally {
      clock.mockRestore();
    }
  });

  it('runs where AbortSignal has no timeout, as build 41\'s phone had none', async () => {
    // The old line called AbortSignal.timeout, which React Native 0.81's runtime lacked, and threw
    // there. The SDK 57 phone has it; withTimeout still needs it nowhere, so here it is taken away.
    const signal = AbortSignal as unknown as { timeout?: unknown };
    const own = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
    delete signal.timeout;
    try {
      expect(typeof signal.timeout).toBe('undefined');
      await expect(withTimeout(async () => 'read', 5000, 'dispatch')).resolves.toBe('read');
    } finally {
      if (own) Object.defineProperty(AbortSignal, 'timeout', own);
    }
  });

  it('clears its timer once the request settles, so nothing is left waiting', async () => {
    const cleared = jest.spyOn(global, 'clearTimeout');
    try {
      await withTimeout(async () => 'done', 5000);
      await expect(withTimeout(async () => { throw new Error('no'); }, 5000)).rejects.toThrow('no');
      expect(cleared).toHaveBeenCalledTimes(2);
    } finally {
      cleared.mockRestore();
    }
  });

  it('throws AppError TIMEOUT when OUR timeout fires (AbortError + signal aborted)', async () => {
    // UTIL-2: a real timeout — withTimeout's own timer fires and aborts the signal,
    // so the AbortError is ours and is mapped to TIMEOUT.
    await expect(
      withTimeout(
        (signal) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const e = new Error('The operation was aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }),
        20,
        'slow_op',
      ),
    ).rejects.toMatchObject({ name: 'AppError', code: 'TIMEOUT' });
  });

  it('re-throws an EXTERNAL AbortError unchanged (not our timeout)', async () => {
    // UTIL-2: an AbortError from something other than our timeout (e.g. component
    // unmount) must propagate unchanged, not be mislabeled as a timeout.
    const external = new Error('aborted by caller');
    external.name = 'AbortError';
    await expect(
      withTimeout(async () => { throw external; }, 5000, 'op'),
    ).rejects.toMatchObject({ name: 'AbortError' });
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
