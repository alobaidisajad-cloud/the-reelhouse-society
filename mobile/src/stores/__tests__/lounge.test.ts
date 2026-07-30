/**
 * lounge.test.ts — Lounge (Chat) Store Tests
 * ───────────────────────────────────────────
 * Tests the lounge lifecycle: room listing, message
 * sending throttle, and send guard behavior.
 */

import { useLoungeStore } from '../lounge';

const mockFrom = jest.fn();
const mockChannel = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
  },
}));

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({
      user: { id: 'u1', username: 'testuser', role: 'cinephile' },
    }),
  },
}));

jest.mock('../resetAllStores', () => ({
  registerStoreReset: jest.fn(),
}));

jest.mock('../../utils/reelToast', () => {
  const fn = jest.fn();
  fn.error = jest.fn();
  fn.success = jest.fn();
  return { __esModule: true, default: fn };
});

jest.mock('../../utils/mappers', () => ({
  mapMessageRow: jest.fn().mockImplementation((row: Record<string, unknown>) => ({
    id: row.id,
    lounge_id: row.lounge_id,
    user_id: row.user_id,
    username: row.username ?? 'unknown',
    content: row.content ?? '',
    type: row.type ?? 'text',
    created_at: row.created_at ?? new Date().toISOString(),
  })),
  LoungeMessageRow: {},
}));

describe('LoungeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLoungeStore.setState({
      lounges: [],
      currentMessages: [],
      currentLoungeId: null,
      loading: false,
      sending: false,
    });
  });

  describe('initial state', () => {
    it('starts with empty lounges and messages', () => {
      const state = useLoungeStore.getState();
      expect(state.lounges).toEqual([]);
      expect(state.currentMessages).toEqual([]);
      expect(state.currentLoungeId).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.sending).toBe(false);
    });
  });



  describe('fetchLounges', () => {
    it('skips if no user', async () => {
      const { useAuthStore } = require('../auth');
      useAuthStore.getState.mockReturnValueOnce({ user: null });

      await useLoungeStore.getState().fetchLounges();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

});
