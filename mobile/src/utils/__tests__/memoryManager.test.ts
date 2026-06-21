/**
 * MemoryManager — State Transition Tests
 * ──────────────────────────────────────
 * T4-03 AUDIT: Validates the memory manager's lifecycle:
 * - Background → cache sweep + GC
 * - Memory warning → aggressive purge
 * - Active → resume mutations
 * - Double-init guard (idempotent)
 */

// Mock dependencies
const mockClearMemoryCache = jest.fn();
const mockRemoveQueries = jest.fn();
const mockResumePausedMutations = jest.fn().mockResolvedValue(undefined);
const mockAddEventListener = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAddEventListener,
  },
  Platform: { OS: 'ios' },
}));

jest.mock('expo-image', () => ({
  Image: {
    clearMemoryCache: mockClearMemoryCache,
  },
}));

jest.mock('@/src/lib/queryClient', () => ({
  queryClient: {
    removeQueries: mockRemoveQueries,
    resumePausedMutations: mockResumePausedMutations,
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    alert: jest.fn(),
  },
}));

describe('MemoryManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the static isListening flag between tests
    jest.resetModules();
  });

  it('should register AppState listeners on initialize', () => {
    const MemoryManager = require('../memoryManager').default;
    MemoryManager.initialize();

    // Should register both 'change' and 'memoryWarning' listeners
    expect(mockAddEventListener).toHaveBeenCalledTimes(2);
    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith('memoryWarning', expect.any(Function));
  });

  it('should be idempotent — double initialize does not register twice', () => {
    const MemoryManager = require('../memoryManager').default;
    MemoryManager.initialize();
    MemoryManager.initialize(); // Second call should be a no-op

    // Only 2 listeners (change + memoryWarning), not 4
    expect(mockAddEventListener).toHaveBeenCalledTimes(2);
  });

  it('should clear image cache and queries on background', () => {
    const MemoryManager = require('../memoryManager').default;
    MemoryManager.initialize();

    // Extract the 'change' handler
    const changeHandler = mockAddEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'change'
    )![1] as (state: string) => void;

    changeHandler('background');

    expect(mockClearMemoryCache).toHaveBeenCalledTimes(1);
    expect(mockRemoveQueries).toHaveBeenCalledWith({ type: 'inactive' });
  });

  it('should resume paused mutations on active', () => {
    const MemoryManager = require('../memoryManager').default;
    MemoryManager.initialize();

    const changeHandler = mockAddEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'change'
    )![1] as (state: string) => void;

    changeHandler('active');

    expect(mockResumePausedMutations).toHaveBeenCalledTimes(1);
  });

  it('should aggressively purge on memory warning', () => {
    const MemoryManager = require('../memoryManager').default;
    MemoryManager.initialize();

    // Extract the 'memoryWarning' handler
    const warningHandler = mockAddEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'memoryWarning'
    )![1] as () => void;

    warningHandler();

    // Should clear image cache
    expect(mockClearMemoryCache).toHaveBeenCalledTimes(1);

    // Only one removeQueries call now — the TMDB-specific call was redundant
    // because removeQueries({ type: 'inactive' }) already covers all inactive queries.
    expect(mockRemoveQueries).toHaveBeenCalledWith({ type: 'inactive' });
  });

  it('should call gc if available on background', () => {
    const mockGc = jest.fn();
    (global as Record<string, unknown>).gc = mockGc;

    const MemoryManager = require('../memoryManager').default;
    MemoryManager.initialize();

    const changeHandler = mockAddEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'change'
    )![1] as (state: string) => void;

    changeHandler('background');

    expect(mockGc).toHaveBeenCalledTimes(1);

    // Cleanup
    delete (global as Record<string, unknown>).gc;
  });
});
