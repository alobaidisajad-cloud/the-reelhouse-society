/**
 * aBlockerIsNeverNamedAtTheTypewriter.test.ts — a salon's typing line names only a member the house
 * shows the reader (review round 14).
 *
 * To a member someone has blocked, the blocker is no one: the house gives them none of the blocker's
 * rows, words, seats or reactions. But a salon's typing broadcast reaches every reader of the room and
 * names its typist, and the room named the blocker "at the typewriter" to the very member who could
 * read nothing else of them: the one place the block still showed. Now a typist is named only once
 * the house gives the reader their row; a typist it gives no row, or a read that fails, is never
 * named, and the answer is asked again after the room is left.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';
import { forgetShownTypists, shownByTheHouse } from '../typistShown';

const SALON = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const SHOWN = '44444444-4444-4444-8444-444444444444';
// A member who blocked this reader: the house gives the reader no row of them, as of no member.
const BLOCKER = '55555555-5555-4555-8555-555555555555';

let mockFails = false;
// The rows the house gives this reader: never the blocker's.
const mockPeople = [{ id: SHOWN, username: 'vesper' }, { id: ME, username: 'me' }];
const mockHouse = supabaseFake({
  answer: {
    profiles: (ask) => mockFails
      ? { code: '', message: 'Network request failed' }
      : mockPeople.filter((row) => ask.filters.every(([op, column, value]) => op !== 'eq' || (row as Record<string, unknown>)[column] === value)),
  },
});
const mockHandlers = new Map<string, (payload: { payload?: unknown }) => unknown>();
const mockChannel: Record<string, unknown> = {};
Object.assign(mockChannel, {
  on: (kind: string, filter: { event?: string }, handler: (payload: { payload?: unknown }) => unknown) => {
    mockHandlers.set(`${kind}:${filter?.event ?? ''}`, handler);
    return mockChannel;
  },
  subscribe: () => mockChannel,
  track: jest.fn(), send: jest.fn(), presenceState: () => ({}),
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, channel: () => mockChannel, removeChannel: async () => 'ok' }; },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));
const typing = (userId: string, username: string) => {
  const handler = mockHandlers.get('broadcast:typing');
  expect(handler).toBeDefined();
  handler!({ payload: { user_id: userId, username } });
};

let leave: (() => void) | null = null;
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  mockFails = false;
  mockHandlers.clear();
  forgetShownTypists();
  useLoungeStore.setState({ currentLoungeId: SALON, typingUsers: [], presentCount: 0 } as never);
  leave = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
});
afterEach(() => {
  leave?.();
  leave = null;
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('the room\'s typing line', () => {
  it('names a member the house shows the reader, and never one who blocked them', async () => {
    typing(BLOCKER, 'the_blocker');
    typing(SHOWN, 'vesper');
    await settled();
    expect(useLoungeStore.getState().typingUsers).toEqual(['vesper']);
  });

  it('names no one when the house could not be asked', async () => {
    mockFails = true;
    typing(SHOWN, 'vesper');
    await settled();
    expect(useLoungeStore.getState().typingUsers).toEqual([]);
  });
});

describe('whether the house shows the reader a member', () => {
  it('is the row the house gives the reader: one it gives is shown, one it does not is not', async () => {
    await expect(shownByTheHouse(ME, SHOWN)).resolves.toBe(true);
    await expect(shownByTheHouse(ME, BLOCKER)).resolves.toBe(false);
  });

  it('a read that fails shows no one, and is asked again, never kept', async () => {
    mockFails = true;
    await expect(shownByTheHouse(ME, SHOWN)).resolves.toBe(false);
    mockFails = false;
    await expect(shownByTheHouse(ME, SHOWN)).resolves.toBe(true);
  });
});
