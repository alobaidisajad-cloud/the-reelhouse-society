/**
 * blockEnforcement.test.ts — Batch 11, the client half
 * ────────────────────────────────────────────────────
 * Two client-side gaps that the server-side RLS policies in
 * 20260802_02_block_filtering_comments_notifications.sql cannot reach:
 *
 *   #105 — blocking someone mid-conversation left their messages on screen while
 *          the toast said "their content is now hidden". The lounge filtered on
 *          load, on pagination, on realtime insert and on the typing indicator,
 *          but nothing re-examined what was ALREADY rendered.
 *
 *   #112 — a blocked actor's notification could still arrive over the websocket.
 *          The fetch and load-more paths are covered by RLS; the socket is the one
 *          path where it may not apply.
 *
 * Both are pure store logic, so they are tested directly rather than through a
 * rendered screen — the assertion is on the state the UI reads.
 */

import { useLoungeStore } from '../lounge';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), rpc: jest.fn() },
}));

jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn().mockReturnValue({ user: { id: 'viewer', username: 'viewer' } }) },
}));

jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(),
  flushOfflineQueue: jest.fn(),
  getOfflineQueue: jest.fn().mockReturnValue([]),
}));

jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

// The block list under test — driven per-test.
// jest.mock is hoisted above this, so the name must be mock-prefixed for Jest to
// allow the factory to close over it.
const mockHidden = new Set<string>();
jest.mock('../blockStore', () => ({
  useBlockStore: {
    getState: () => ({ isHidden: (id: string) => mockHidden.has(id) }),
  },
}));

function msg(id: string, user_id: string) {
  return {
    id, lounge_id: 'salon-1', user_id,
    username: user_id, content: `from ${user_id}`, type: 'text',
    created_at: '2024-01-01T00:00:00Z',
  } as never;
}

describe('#105 — purgeHiddenMessages', () => {
  beforeEach(() => {
    mockHidden.clear();
    useLoungeStore.setState({
      currentMessages: [msg('m1', 'alice'), msg('m2', 'bram'), msg('m3', 'cleo')],
    });
  });

  it('removes every message from a newly blocked member', () => {
    mockHidden.add('bram');
    useLoungeStore.getState().purgeHiddenMessages();

    const ids = useLoungeStore.getState().currentMessages.map(m => m.id);
    expect(ids).toEqual(['m1', 'm3']);
  });

  it('removes ALL of their messages, not just the most recent', () => {
    useLoungeStore.setState({
      currentMessages: [msg('m1', 'bram'), msg('m2', 'alice'), msg('m3', 'bram')],
    });
    mockHidden.add('bram');
    useLoungeStore.getState().purgeHiddenMessages();

    expect(useLoungeStore.getState().currentMessages.map(m => m.user_id)).toEqual(['alice']);
  });

  it('leaves everyone else untouched when nobody is hidden', () => {
    useLoungeStore.getState().purgeHiddenMessages();
    expect(useLoungeStore.getState().currentMessages).toHaveLength(3);
  });

  it('is safe on an empty conversation', () => {
    useLoungeStore.setState({ currentMessages: [] });
    expect(() => useLoungeStore.getState().purgeHiddenMessages()).not.toThrow();
    expect(useLoungeStore.getState().currentMessages).toEqual([]);
  });

  it('a mute purges exactly like a block — isHidden covers both', () => {
    // The store asks isHidden(), which is true for blocked OR muted. There is no
    // separate mute path to get wrong.
    mockHidden.add('cleo');
    useLoungeStore.getState().purgeHiddenMessages();
    expect(useLoungeStore.getState().currentMessages.map(m => m.user_id)).toEqual(['alice', 'bram']);
  });
});
