/**
 * lounge.test.ts — Lounge (Chat) Store Tests
 * ───────────────────────────────────────────
 * Tests the lounge lifecycle: room listing, message
 * sending throttle, and send guard behavior.
 */

import { useLoungeStore } from '../lounge';

const mockFrom = jest.fn();
const mockChannel = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
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

  // Withdrawing your own dispatch is the LIVE delete path (the hard-delete
  // deleteMessage was removed in 441f3b5). It tombstones rather than destroying
  // so a conversation doesn't grow holes where a reply's parent used to be.
  describe('withdrawMessage', () => {
    const seed = () => useLoungeStore.setState({
      currentMessages: [
        { id: 'm1', lounge_id: 'l1', user_id: 'u1', username: 'testuser', content: 'Regrettable take', type: 'text', created_at: '2026-01-01', reactions: [{ reaction: '🔥', count: 2, mine: false }] },
        { id: 'm2', lounge_id: 'l1', user_id: 'u2', username: 'other', content: 'Untouched', type: 'text', created_at: '2026-01-02' },
      ] as never,
    });

    it('tombstones optimistically: blanks content, stamps deleted_at, clears reactions', async () => {
      seed();
      mockRpc.mockResolvedValue({ error: null });

      await useLoungeStore.getState().withdrawMessage('m1');

      const [withdrawn, untouched] = useLoungeStore.getState().currentMessages;
      expect(withdrawn.content).toBe('');
      expect(withdrawn.deleted_at).toBeTruthy();
      expect(withdrawn.reactions).toEqual([]);
      // The row SURVIVES — that is the whole point of a tombstone.
      expect(useLoungeStore.getState().currentMessages).toHaveLength(2);
      expect(untouched.content).toBe('Untouched');
    });

    it('goes through the withdraw RPC, never a hard delete', async () => {
      seed();
      mockRpc.mockResolvedValue({ error: null });

      await useLoungeStore.getState().withdrawMessage('m1');

      expect(mockRpc).toHaveBeenCalledWith('withdraw_lounge_message', { p_message_id: 'm1' });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('restores the message intact when the server refuses', async () => {
      seed();
      mockRpc.mockResolvedValue({ error: { message: 'not your message' } });

      await useLoungeStore.getState().withdrawMessage('m1');

      const restored = useLoungeStore.getState().currentMessages[0];
      expect(restored.content).toBe('Regrettable take');
      expect(restored.deleted_at).toBeUndefined();
      expect(restored.reactions).toEqual([{ reaction: '🔥', count: 2, mine: false }]);
    });

    it('does nothing for a message that is not in view', async () => {
      seed();
      await useLoungeStore.getState().withdrawMessage('does-not-exist');
      expect(mockRpc).not.toHaveBeenCalled();
      expect(useLoungeStore.getState().currentMessages[0].content).toBe('Regrettable take');
    });
  });

});
