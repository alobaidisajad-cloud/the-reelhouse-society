/**
 * filterContentByBlocks.pbt.test.ts — Property-Based Tests for filterContentByBlocks
 * ───────────────────────────────────────────────────────────────────────────────────
 * Property 3: Content filter excludes all blocked and muted users (Task 8.2)
 * Property 4: Content filter does not mutate input (Task 8.3)
 *
 * Validates: Requirements 3.1, 3.2
 */

import * as fc from 'fast-check';

// ── Import after mocks ───────────────────────────────────────────────────────

import { filterContentByBlocks } from '../filterContentByBlocks';

// ── Mocks ────────────────────────────────────────────────────────────────────

// We need to mock blockStore before importing filterContentByBlocks
const mockIsHidden = jest.fn((userId: string) => false);

jest.mock('../../stores/blockStore', () => ({
  useBlockStore: {
    getState: jest.fn(() => ({
      isHidden: mockIsHidden,
    })),
  },
}));

jest.mock('../../stores/auth', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'test-user' } })) },
}));

jest.mock('../../stores/resetAllStores', () => ({
  registerStoreReset: jest.fn(),
}));

jest.mock('../../lib/sentry', () => ({
  captureError: jest.fn(),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('../../lib/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

jest.mock('../reelToast', () => {
  const fn = jest.fn();
  fn.error = jest.fn();
  fn.info = jest.fn();
  return { __esModule: true, default: fn };
});

jest.mock('../logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** A content item with a user_id field. */
interface _TestItem {
  id: string;
  user_id: string;
  content: string;
}

const testItemArb = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  content: fc.string({ minLength: 0, maxLength: 50 }),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('filterContentByBlocks PBT — Property 3: Excludes blocked/muted', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For any items and blocked set, filtered result has no items
   * from blocked/muted authors.
   */

  afterEach(() => {
    mockIsHidden.mockReset();
  });

  it('filtered result contains no items from hidden (blocked/muted) authors', () => {
    fc.assert(
      fc.property(
        fc.array(testItemArb, { minLength: 0, maxLength: 50 }),
        fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 10 }),
        (items, hiddenUserIds) => {
          const hiddenSet = new Set(hiddenUserIds);

          // Configure mock: isHidden returns true for users in hiddenSet
          mockIsHidden.mockImplementation((userId: string) => hiddenSet.has(userId));

          const result = filterContentByBlocks(items, (item) => item.user_id);

          // Verify: no item in result has a user_id in the hidden set
          return result.every((item) => !hiddenSet.has(item.user_id));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('items from non-hidden authors are all preserved in the result', () => {
    fc.assert(
      fc.property(
        fc.array(testItemArb, { minLength: 0, maxLength: 50 }),
        fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 10 }),
        (items, hiddenUserIds) => {
          const hiddenSet = new Set(hiddenUserIds);

          mockIsHidden.mockImplementation((userId: string) => hiddenSet.has(userId));

          const result = filterContentByBlocks(items, (item) => item.user_id);

          // All non-hidden items should be in the result
          const expectedItems = items.filter((item) => !hiddenSet.has(item.user_id));
          return result.length === expectedItems.length;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('when hidden set is empty, all items are returned', () => {
    fc.assert(
      fc.property(
        fc.array(testItemArb, { minLength: 0, maxLength: 50 }),
        (items) => {
          mockIsHidden.mockImplementation(() => false);

          const result = filterContentByBlocks(items, (item) => item.user_id);

          return result.length === items.length;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when all users are hidden, result is empty', () => {
    fc.assert(
      fc.property(
        fc.array(testItemArb, { minLength: 1, maxLength: 50 }),
        (items) => {
          mockIsHidden.mockImplementation(() => true);

          const result = filterContentByBlocks(items, (item) => item.user_id);

          return result.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('filterContentByBlocks PBT — Property 4: No input mutation', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * Property: Original array unchanged after filtering
   * (same length, elements, order).
   */

  afterEach(() => {
    mockIsHidden.mockReset();
  });

  it('original array is not mutated after filtering (length, elements, order preserved)', () => {
    fc.assert(
      fc.property(
        fc.array(testItemArb, { minLength: 0, maxLength: 50 }),
        fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 10 }),
        (items, hiddenUserIds) => {
          const hiddenSet = new Set(hiddenUserIds);
          mockIsHidden.mockImplementation((userId: string) => hiddenSet.has(userId));

          // Take a snapshot of the original array
          const originalLength = items.length;
          const originalSnapshot = items.map((item) => ({ ...item }));

          // Perform filtering
          filterContentByBlocks(items, (item) => item.user_id);

          // Verify: original array is unchanged
          if (items.length !== originalLength) return false;

          for (let i = 0; i < items.length; i++) {
            if (items[i].id !== originalSnapshot[i].id) return false;
            if (items[i].user_id !== originalSnapshot[i].user_id) return false;
            if (items[i].content !== originalSnapshot[i].content) return false;
          }

          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('filtering returns a new array reference (not the same object)', () => {
    fc.assert(
      fc.property(
        fc.array(testItemArb, { minLength: 1, maxLength: 50 }),
        (items) => {
          mockIsHidden.mockImplementation(() => false);

          const result = filterContentByBlocks(items, (item) => item.user_id);

          // Even when no items are filtered, Array.filter returns a new array
          return result !== items;
        },
      ),
      { numRuns: 100 },
    );
  });
});
