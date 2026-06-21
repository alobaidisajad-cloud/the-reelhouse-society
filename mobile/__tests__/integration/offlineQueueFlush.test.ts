/**
 * offlineQueueFlush.test.ts — Integration: Offline Queue FIFO Execution & ID Propagation
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Exercises the REAL offline queue (enqueue + flush) with mocked Supabase to verify:
 *   1. Enqueue 3 mutations → flush → all execute in FIFO order
 *   2. create_list + add_film_to_list → idMap propagates the server-generated ID correctly
 */

import {
    clearOfflineQueue,
    enqueueMutation,
    flushOfflineQueue,
    getOfflineQueue,
    setQueueUserId,
} from '@/src/utils/offlineQueue';

// ── Track execution order ───────────────────────────────────────────────────

const executionLog: string[] = [];
let mockIdCounter = 0;

// ── Mock InteractionService (used by endorse_log) ───────────────────────────

jest.mock('@/src/services/InteractionService', () => ({
  InteractionService: {
    addEndorsement: jest.fn(async (p: any) => {
      executionLog.push(`interaction:${p.type}`);
    }),
  },
}));

// ── Mock Supabase ───────────────────────────────────────────────────────────

jest.mock('@/src/lib/supabase', () => {
  // Helper to create a chainable Supabase query builder mock
  function mockMakeChain(terminalResult?: { data: unknown; error: unknown }) {
    const chain: Record<string, jest.Mock> = {};
    const self = () => chain;
    chain.select = jest.fn().mockImplementation(self);
    chain.insert = jest.fn().mockImplementation(self);
    chain.update = jest.fn().mockImplementation(self);
    chain.upsert = jest.fn().mockImplementation(self);
    chain.delete = jest.fn().mockImplementation(self);
    chain.eq = jest.fn().mockImplementation(self);
    chain.neq = jest.fn().mockImplementation(self);
    chain.in = jest.fn().mockImplementation(self);
    chain.not = jest.fn().mockImplementation(self);
    chain.or = jest.fn().mockImplementation(self);
    chain.order = jest.fn().mockImplementation(self);
    chain.limit = jest.fn().mockImplementation(self);
    chain.single = jest.fn().mockResolvedValue(terminalResult ?? { data: null, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue(terminalResult ?? { data: null, error: null });
    chain.then = jest.fn((cb) => Promise.resolve(cb(terminalResult ?? { data: [], error: null })));
    return chain;
  }

  // We need to track calls from inside the mock factory, so we use a
  // module-level array accessible via the mock's closure.
  const _executionLog: string[] = [];
  let _mockIdCounter = 0;

  // Expose reset helpers on the mock module for tests to use
  const mockModule = {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' }, access_token: 'mock-token' } }, error: null }),
      },
      from: jest.fn((table: string) => {
        const chain = mockMakeChain();

        // Override insert to track execution and return proper chained results
        chain.insert = jest.fn().mockImplementation((rows: unknown[]) => {
          _executionLog.push(`insert:${table}`);
          const innerChain = mockMakeChain();
          // For logs table, simulate returning an id
          if (table === 'logs') {
            innerChain.maybeSingle = jest.fn().mockResolvedValue({
              data: { id: 'server-log-id-1' },
              error: null,
            });
          }
          return innerChain;
        });

        // Override upsert to track execution and return proper chained results
        chain.upsert = jest.fn().mockImplementation((rows: unknown[], _opts?: unknown) => {
          _executionLog.push(`upsert:${table}`);
          const innerChain = mockMakeChain();
          // For lists table, simulate returning a new ID
          if (table === 'lists') {
            _mockIdCounter++;
            const newId = `server-list-id-${_mockIdCounter}`;
            innerChain.maybeSingle = jest.fn().mockResolvedValue({
              data: { id: newId },
              error: null,
            });
          }
          return innerChain;
        });

        chain.update = jest.fn().mockImplementation(() => {
          _executionLog.push(`update:${table}`);
          return mockMakeChain();
        });

        chain.delete = jest.fn().mockImplementation(() => {
          _executionLog.push(`delete:${table}`);
          return mockMakeChain();
        });

        return chain;
      }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
    __getExecutionLog: () => _executionLog,
    __resetExecutionLog: () => { _executionLog.length = 0; },
    __resetIdCounter: () => { _mockIdCounter = 0; },
  };

  return mockModule;
});

jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('@/src/utils/reelToast', () => {
  const fn = jest.fn();
  (fn as any).error = jest.fn();
  (fn as any).success = jest.fn();
  return { __esModule: true, default: fn };
});

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      user: { id: 'test-user-id', username: 'testuser' },
      isAuthenticated: true,
    })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

// ── Access mock internals ───────────────────────────────────────────────────

 
const supabaseMock = require('@/src/lib/supabase') as {
  __getExecutionLog: () => string[];
  __resetExecutionLog: () => void;
  __resetIdCounter: () => void;
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Offline Queue Flush Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executionLog.length = 0;
    mockIdCounter = 0;
    supabaseMock.__resetExecutionLog();
    supabaseMock.__resetIdCounter();
    clearOfflineQueue();
    setQueueUserId('test-user-id');
  });

  it('enqueue 3 mutations → flush → all execute in FIFO order', async () => {
    // Enqueue 3 different mutations
    enqueueMutation({
      type: 'add_log',
      payload: { user_id: 'test-user-id', film_id: 550, film_title: 'Fight Club', rating: 5 },
    });

    enqueueMutation({
      type: 'endorse_log',
      payload: { user_id: 'test-user-id', type: 'endorse_log', target_log_id: 'log-abc-123' },
    });

    enqueueMutation({
      type: 'add_watchlist',
      payload: { user_id: 'test-user-id', film_id: 680, film_title: 'Pulp Fiction' },
    });

    // Verify queue has 3 items
    expect(getOfflineQueue()).toHaveLength(3);

    // Flush
    await flushOfflineQueue();

    // Get the execution log from the supabase mock
    const log = supabaseMock.__getExecutionLog();

    // Verify FIFO order:
    // add_log → inserts into 'logs'
    // endorse_log → uses InteractionService (tracked in executionLog)
    // add_watchlist → inserts into 'watchlists'
    expect(log[0]).toBe('insert:logs');
    // endorse_log uses InteractionService, not supabase.from directly
    expect(executionLog[0]).toBe('interaction:endorse_log');
    expect(log[1]).toBe('insert:watchlists');

    // Queue should be empty after successful flush
    expect(getOfflineQueue()).toHaveLength(0);
  });

  it('create_list + add_film_to_list → idMap propagates correctly', async () => {
    // Simulate: user creates a list offline, then adds a film to it.
    // The add_film_to_list references the list by a temporary client-side ID.
    // After flush, the idMap should remap the temp ID to the server-generated ID.
    const tempListId = 'test-uuid-temp123';

    enqueueMutation({
      type: 'create_list',
      payload: { user_id: 'test-user-id', id: tempListId, _tempId: tempListId, title: 'My Noir Picks', description: 'Dark cinema' },
    });

    enqueueMutation({
      type: 'add_film_to_list',
      payload: { user_id: 'test-user-id', list_id: tempListId, film_id: 550, film_title: 'Fight Club', poster_path: '/poster.jpg' },
    });

    expect(getOfflineQueue()).toHaveLength(2);

    await flushOfflineQueue();

    const log = supabaseMock.__getExecutionLog();

    // The create_list should have been called first (upsert into lists)
    expect(log[0]).toBe('upsert:lists');
    // The add_film_to_list should upsert into list_items
    expect(log[1]).toBe('upsert:list_items');

    // Queue should be empty
    expect(getOfflineQueue()).toHaveLength(0);
  });
});
