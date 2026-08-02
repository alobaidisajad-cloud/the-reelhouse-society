/**
 * offlineQueue.integration.test.ts — End-to-End Flush Verification
 * ─────────────────────────────────────────────────────────────────
 * Proves the most critical invariants of the offline mutation system:
 *   1. Mutations execute in causal (FIFO) order
 *   2. idMap propagates across dependent mutations
 *   3. Network failure halts flush and preserves remaining queue
 *   4. Constraint violations (duplicates) are discarded safely
 *   5. Schema violations route to dead-letter
 *   6. Stale mutations (>24h) are pruned before flush
 *   7. Total accounting: processed + remaining + dead-letter = input
 */

// ── Module Mocks (must be before imports) ──────────────────────

import type { QueuedMutation } from '../offlineQueue';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '../offlineQueue';

const mockStorage = new Map<string, string>();
jest.mock('../../stores/mmkv-storage', () => ({
  storage: {
    getString: jest.fn((key: string) => mockStorage.get(key)),
    set: jest.fn((key: string, value: string) => mockStorage.set(key, value)),
    delete: jest.fn((key: string) => mockStorage.delete(key)),
  },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
}));

jest.mock('../../lib/sentry', () => ({
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  captureWarning: jest.fn(),
}));

// Mock supabase.auth.getSession — flushOfflineQueue now verifies session ownership
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 'mock-token' } }, error: null }),
    },
  },
}));

// Mock the mutation executor — this is what we control to simulate success/failure
const mockExecuteMutation = jest.fn();
const mockApplyIdMapToPayload = jest.fn((payload: Record<string, unknown>, idMap: Record<string, string>) => {
  const result = { ...payload };
  if (result.list_id && idMap[result.list_id as string]) result.list_id = idMap[result.list_id as string];
  if (result.id && idMap[result.id as string]) result.id = idMap[result.id as string];
  if (result.log_id && idMap[result.log_id as string]) result.log_id = idMap[result.log_id as string];
  if (result.target_log_id && idMap[result.target_log_id as string]) result.target_log_id = idMap[result.target_log_id as string];
  if (result.dossier_id && idMap[result.dossier_id as string]) result.dossier_id = idMap[result.dossier_id as string];
  return result;
});

jest.mock('../mutationExecutor', () => ({
  executeMutation: (...args: unknown[]) => mockExecuteMutation(...args),
  // Matches the real signature (mutationExecutor.ts) instead of swallowing rest
  // args — a rest proxy cannot be spread into a two-parameter mock.
  applyIdMapToPayload: (payload: Record<string, unknown>, idMap: Record<string, string>) =>
    mockApplyIdMapToPayload(payload, idMap),
}));

jest.mock('../networkError', () => ({
  isNetworkError: jest.fn((e: unknown) => {
    const msg = String(
      typeof e === 'object' && e !== null && 'message' in e
        ? (e as { message: string }).message
        : e ?? ''
    ).toLowerCase();
    return msg.includes('network') || msg.includes('offline') || msg.includes('fetch') || msg.includes('timeout');
  }),
  isTransientError: jest.fn((e: unknown) => {
    if (typeof e !== 'object' || e === null) return false;
    const status = 'status' in e ? Number((e as { status: unknown }).status) : NaN;
    return status === 408 || status === 429 || (Number.isFinite(status) && status >= 500 && status <= 599);
  }),
}));

jest.mock('../reelToast', () => {
  const toast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: toast };
});

jest.mock('../logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// ── Test Helpers ───────────────────────────────────────────────

const QUEUE_KEY = 'reelhouse-offline-mutations';
const DEAD_LETTER_KEY = 'reelhouse-offline-mutations_dead_letter';

function clearQueue() {
  mockStorage.delete(QUEUE_KEY);
  mockStorage.delete(DEAD_LETTER_KEY);
}

function getDeadLetter(): QueuedMutation[] {
  const raw = mockStorage.get(DEAD_LETTER_KEY);
  return raw ? JSON.parse(raw) : [];
}

function injectQueue(mutations: QueuedMutation[]) {
  mockStorage.set(QUEUE_KEY, JSON.stringify(mutations));
}

// ── Tests ──────────────────────────────────────────────────────

describe('Offline Queue — Integration Tests', () => {
  beforeEach(() => {
    clearQueue();
    mockExecuteMutation.mockReset();
    mockApplyIdMapToPayload.mockClear();
    jest.clearAllMocks();
  });

  describe('Invariant 1: Causal FIFO ordering', () => {
    it('executes mutations in the order they were enqueued', async () => {
      const executionOrder: string[] = [];

      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        executionOrder.push(mutation.type);
        return {};
      });

      enqueueMutation({ type: 'create_list', payload: { id: 'temp-1', user_id: 'u1', title: 'My List' } });
      enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'temp-1', film_id: 550 } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'log-1' } });

      await flushOfflineQueue();

      expect(executionOrder).toEqual(['create_list', 'add_film_to_list', 'endorse_log']);
    });

    it('processes 10 mutations in strict sequence', async () => {
      const order: number[] = [];
      mockExecuteMutation.mockImplementation(async (_m: QueuedMutation) => {
        order.push(order.length);
        return {};
      });

      for (let i = 0; i < 10; i++) {
        enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: `log-${i}` } });
      }

      await flushOfflineQueue();

      expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(getOfflineQueue().length).toBe(0);
    });
  });

  describe('Invariant 2: idMap propagation', () => {
    it('passes accumulated idMap to each executeMutation call', async () => {
      const capturedIdMaps: Record<string, string>[] = [];

      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation, idMap: Record<string, string>) => {
        capturedIdMaps.push({ ...idMap });
        if (mutation.type === 'create_list') {
          return { fakeId: 'temp-list-1', newId: 'real-list-abc' };
        }
        return {};
      });

      enqueueMutation({ type: 'create_list', payload: { id: 'temp-list-1', user_id: 'u1', title: 'Test' } });
      enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'temp-list-1', film_id: 123 } });

      await flushOfflineQueue();

      // First call: idMap is empty
      expect(capturedIdMaps[0]).toEqual({});
      // Second call: idMap contains the mapping from first mutation
      expect(capturedIdMaps[1]).toEqual({ 'temp-list-1': 'real-list-abc' });
    });

    it('accumulates multiple id mappings across chain of creates', async () => {
      const capturedIdMaps: Record<string, string>[] = [];

      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation, idMap: Record<string, string>) => {
        capturedIdMaps.push({ ...idMap });
        if (mutation.type === 'create_list' && mutation.payload.id === 'temp-A') {
          return { fakeId: 'temp-A', newId: 'real-A' };
        }
        if (mutation.type === 'create_list' && mutation.payload.id === 'temp-B') {
          return { fakeId: 'temp-B', newId: 'real-B' };
        }
        return {};
      });

      enqueueMutation({ type: 'create_list', payload: { id: 'temp-A', user_id: 'u1', title: 'List A' } });
      enqueueMutation({ type: 'create_list', payload: { id: 'temp-B', user_id: 'u1', title: 'List B' } });
      enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'temp-A', film_id: 100 } });

      await flushOfflineQueue();

      expect(capturedIdMaps[2]).toEqual({ 'temp-A': 'real-A', 'temp-B': 'real-B' });
    });
  });

  describe('Invariant 3: Network failure halts flush', () => {
    it('stops processing and preserves remaining mutations on network error', async () => {
      let callCount = 0;
      mockExecuteMutation.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Network request failed');
        return {};
      });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'a' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'b' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'c' } });

      await flushOfflineQueue();

      // First succeeds, second throws network error → halt
      expect(callCount).toBe(2);

      // Remaining queue should have the failed mutation and those after it
      const remaining = getOfflineQueue();
      expect(remaining.length).toBe(2);
      expect(remaining[0].payload.target_log_id).toBe('b');
      expect(remaining[1].payload.target_log_id).toBe('c');
    });

    it('applies idMap to remaining mutations when halting', async () => {
      let callCount = 0;
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        callCount++;
        if (mutation.type === 'create_list') {
          return { fakeId: 'temp-list-1', newId: 'real-list-xyz' };
        }
        if (callCount === 2) throw new Error('Network timeout');
        return {};
      });

      enqueueMutation({ type: 'create_list', payload: { id: 'temp-list-1', user_id: 'u1', title: 'Test' } });
      enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'temp-list-1', film_id: 200 } });
      enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'temp-list-1', film_id: 300 } });

      await flushOfflineQueue();

      // applyIdMapToPayload should have been called on remaining mutations
      expect(mockApplyIdMapToPayload).toHaveBeenCalled();
    });

    it('does not route network errors to dead-letter', async () => {
      mockExecuteMutation.mockRejectedValue(new Error('fetch failed'));

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'x' } });

      await flushOfflineQueue();

      expect(getDeadLetter().length).toBe(0);
      expect(getOfflineQueue().length).toBe(1);
    });
  });

  describe('Invariant 4: Duplicate constraint violations discarded', () => {
    it('discards mutations that throw 23505/duplicate errors', async () => {
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        if (mutation.payload.target_log_id === 'dup') {
          const err = new Error('duplicate key value violates unique constraint');
          (err as any).code = '23505';
          throw err;
        }
        return {};
      });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'dup' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'fresh' } });

      await flushOfflineQueue();

      // Queue should be empty — dup discarded, fresh processed
      expect(getOfflineQueue().length).toBe(0);
      // No dead-letter entries for duplicates
      expect(getDeadLetter().length).toBe(0);
    });

    it('discards mutations with 409 status', async () => {
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        if (mutation.payload.target_log_id === 'conflict') {
          const err = new Error('Conflict');
          (err as any).status = 409;
          throw err;
        }
        return {};
      });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'conflict' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'ok' } });

      await flushOfflineQueue();

      expect(getOfflineQueue().length).toBe(0);
      expect(getDeadLetter().length).toBe(0);
    });

    it('continues processing after discarding duplicate', async () => {
      const processed: string[] = [];
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        if (mutation.payload.target_log_id === 'dup') {
          throw new Error('unique constraint violation');
        }
        processed.push(mutation.payload.target_log_id as string);
        return {};
      });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'first' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'dup' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'last' } });

      await flushOfflineQueue();

      expect(processed).toEqual(['first', 'last']);
    });
  });

  describe('Invariant 5: Schema violations route to dead-letter', () => {
    it('routes invalid payloads to dead-letter queue without executing', async () => {
      mockExecuteMutation.mockResolvedValue({});

      // remove_log requires { log_id: z.string() } — this payload is missing it
      enqueueMutation({ type: 'remove_log', payload: { wrong_field: 'bad' } as any });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'valid' } });

      await flushOfflineQueue();

      // Only the valid mutation should have been executed
      expect(mockExecuteMutation).toHaveBeenCalledTimes(1);

      // Dead-letter should contain the invalid mutation
      const deadLetter = getDeadLetter();
      expect(deadLetter.length).toBe(1);
      expect(deadLetter[0].type).toBe('remove_log');
      expect(deadLetter[0].payload._failReason).toContain('schema');
    });

    it('attaches _failedAt timestamp to dead-lettered mutations', async () => {
      mockExecuteMutation.mockResolvedValue({});

      enqueueMutation({ type: 'remove_log', payload: { no_log_id: true } as any });

      await flushOfflineQueue();

      const deadLetter = getDeadLetter();
      expect(deadLetter[0].payload._failedAt).toBeDefined();
      expect(typeof deadLetter[0].payload._failedAt).toBe('string');
    });

    it('does not halt the queue on schema failure', async () => {
      const processed: string[] = [];
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        processed.push(mutation.type);
        return {};
      });

      // Schema-invalid followed by two valid mutations
      enqueueMutation({ type: 'remove_log', payload: {} as any });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'a' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'b' } });

      await flushOfflineQueue();

      expect(processed).toEqual(['endorse_log', 'endorse_log']);
    });
  });

  describe('Invariant 6: Stale mutations pruned', () => {
    it('removes mutations older than 24 hours before processing', async () => {
      const executed: string[] = [];
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        executed.push(mutation.payload.target_log_id as string);
        return {};
      });

      // Manually inject a stale mutation into MMKV
      const staleQueue: QueuedMutation[] = [
        {
          id: 'stale-1',
          type: 'endorse_log',
          payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'old' },
          timestamp: Date.now() - 25 * 60 * 60 * 1000,
        },
        {
          id: 'fresh-1',
          type: 'endorse_log',
          payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'new' },
          timestamp: Date.now(),
        },
      ];
      injectQueue(staleQueue);

      await flushOfflineQueue();

      // Only the fresh mutation should be executed
      expect(mockExecuteMutation).toHaveBeenCalledTimes(1);
      expect(executed).toEqual(['new']);
    });

    it('prunes all mutations if entire queue is stale', async () => {
      const staleQueue: QueuedMutation[] = [
        {
          id: 'stale-a',
          type: 'endorse_log',
          payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'ancient' },
          timestamp: Date.now() - 48 * 60 * 60 * 1000,
        },
      ];
      injectQueue(staleQueue);

      await flushOfflineQueue();

      expect(mockExecuteMutation).not.toHaveBeenCalled();
      expect(getOfflineQueue().length).toBe(0);
    });
  });

  describe('Invariant 7: Total accounting', () => {
    it('processed + remaining + dead-letter = initial queue length', async () => {
      let processedCount = 0;

      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        processedCount++;
        if (mutation.payload.target_log_id === 'network-fail') {
          throw new Error('Network offline');
        }
        return {};
      });

      // Build a queue with known outcome:
      // 1. valid (processed) ✓
      // 2. schema-invalid (dead-letter)
      // 3. valid (processed) ✓
      // 4. will network-fail (halts — remains in queue along with #5)
      // 5. valid (never reached — remains)
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'good-1' } });
      enqueueMutation({ type: 'remove_log', payload: { bad: true } as any }); // schema fail → dead-letter
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'good-2' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'network-fail' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'unreached' } });

      const initialLength = getOfflineQueue().length;
      expect(initialLength).toBe(5);

      await flushOfflineQueue();

      const remaining = getOfflineQueue();
      const deadLetter = getDeadLetter();

      // Accounting breakdown for this test:
      //   good-1       → executed successfully (processedCount++)
      //   schema-bad   → dead-letter (skipped via continue, no executeMutation call)
      //   good-2       → executed successfully (processedCount++)
      //   network-fail → executeMutation called (processedCount++), throws network error → halts
      //   unreached    → never processed, pushed to remaining along with network-fail
      //
      // processedCount = 3, remaining = 2, deadLetter = 1
      // Successful mutations = processedCount - 1 (the network-fail was attempted but failed and remains)
      // successful(2) + dead-letter(1) + remaining(2) = 5 = initialLength
      const successfulExecutions = processedCount - 1; // the last processedCount++ was the failed network one
      expect(successfulExecutions + deadLetter.length + remaining.length).toBe(initialLength);
    });

    it('empty queue produces zero in all buckets', async () => {
      await flushOfflineQueue();

      expect(mockExecuteMutation).not.toHaveBeenCalled();
      expect(getOfflineQueue().length).toBe(0);
      expect(getDeadLetter().length).toBe(0);
    });
  });

  describe('Concurrency guard', () => {
    it('prevents parallel flush calls', async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      mockExecuteMutation.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise(r => setTimeout(r, 10));
        concurrentCalls--;
        return {};
      });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'a' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'b' } });

      // Fire two flushes simultaneously
      await Promise.all([flushOfflineQueue(), flushOfflineQueue()]);

      // The isFlushing guard should prevent parallel execution
      expect(maxConcurrent).toBeLessThanOrEqual(1);
    });

    it('allows subsequent flush after previous completes', async () => {
      mockExecuteMutation.mockResolvedValue({});

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'batch1' } });
      await flushOfflineQueue();

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'batch2' } });
      await flushOfflineQueue();

      expect(mockExecuteMutation).toHaveBeenCalledTimes(2);
      expect(getOfflineQueue().length).toBe(0);
    });
  });

  describe('Unknown errors route to dead-letter', () => {
    it('routes non-network, non-duplicate errors to dead-letter', async () => {
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        if (mutation.payload.target_log_id === 'fatal') {
          throw new Error('Row-level security violation');
        }
        return {};
      });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'fatal' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'ok' } });

      await flushOfflineQueue();

      expect(getOfflineQueue().length).toBe(0);
      const deadLetter = getDeadLetter();
      expect(deadLetter.length).toBe(1);
      expect(deadLetter[0].payload._failReason).toContain('Row-level security');
    });

    it('continues processing after routing to dead-letter', async () => {
      const processed: string[] = [];
      mockExecuteMutation.mockImplementation(async (mutation: QueuedMutation) => {
        if (mutation.payload.target_log_id === 'rls-fail') {
          throw new Error('permission denied for table');
        }
        processed.push(mutation.payload.target_log_id as string);
        return {};
      });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'before' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'rls-fail' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'after' } });

      await flushOfflineQueue();

      expect(processed).toEqual(['before', 'after']);
    });
  });

  describe('Transient server failures retry instead of dead-lettering (OFFQ-1)', () => {
    const transient = (status: number, msg = 'Server Error') =>
      Object.assign(new Error(msg), { status });

    it('preserves a mutation that fails with a transient 500 (does NOT dead-letter)', async () => {
      mockExecuteMutation.mockImplementation(async () => { throw transient(500, 'Internal Server Error'); });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 't1' } });
      await flushOfflineQueue();

      expect(getDeadLetter().length).toBe(0);
      const q = getOfflineQueue();
      expect(q.length).toBe(1);
      expect(q[0]._retryCount).toBe(1); // counter bumped, not lost
    });

    it('halts the flush on a transient 429 to preserve causal order', async () => {
      let n = 0;
      mockExecuteMutation.mockImplementation(async () => { n++; if (n === 2) throw transient(429, 'rate limited'); return {}; });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'a' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'b' } });
      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'c' } });
      await flushOfflineQueue();

      expect(n).toBe(2); // first ok, second halts the rest
      const q = getOfflineQueue();
      expect(q.length).toBe(2);
      expect(q[0].payload.target_log_id).toBe('b');
      expect(q[0]._retryCount).toBe(1);
      expect(getDeadLetter().length).toBe(0);
    });

    it('increments the retry counter across flushes and dead-letters after the budget is spent', async () => {
      mockExecuteMutation.mockImplementation(async () => { throw transient(500, 'Internal Server Error'); });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'persist' } });

      // MAX_TRANSIENT_RETRIES = 5 ⇒ attempts 1..4 keep, the 5th exhausts.
      for (let i = 0; i < 5; i++) await flushOfflineQueue();

      expect(getOfflineQueue().length).toBe(0);
      const dl = getDeadLetter();
      expect(dl.length).toBe(1);
      expect(String(dl[0].payload._failReason)).toContain('transient-exhausted');
    });

    it('recovers: a mutation that fails transiently then succeeds is never lost', async () => {
      let attempt = 0;
      mockExecuteMutation.mockImplementation(async () => { attempt++; if (attempt === 1) throw transient(503, 'Service Unavailable'); return {}; });

      enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: 'recover' } });
      await flushOfflineQueue(); // attempt 1 → transient halt, kept
      expect(getOfflineQueue().length).toBe(1);

      await flushOfflineQueue(); // attempt 2 → success
      expect(getOfflineQueue().length).toBe(0);
      expect(getDeadLetter().length).toBe(0);
    });
  });

  describe('Queue cap enforcement', () => {
    it('caps queue at MAX_QUEUE_SIZE (100), dropping oldest', () => {
      for (let i = 0; i < 110; i++) {
        enqueueMutation({ type: 'endorse_log', payload: { user_id: 'u1', type: 'endorse_log', target_log_id: `item-${i}` } });
      }

      const queue = getOfflineQueue();
      expect(queue.length).toBe(100);
      // The oldest items should have been dropped
      expect(queue[0].payload.target_log_id).toBe('item-10');
      expect(queue[queue.length - 1].payload.target_log_id).toBe('item-109');
    });
  });
});
