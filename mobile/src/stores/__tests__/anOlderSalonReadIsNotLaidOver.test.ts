/**
 * anOlderSalonReadIsNotLaidOver.test.ts — the corridor's and a room's reads, laid only while still the one asked.
 * ─────────────────────────────────────────────────────────────────────────────
 * The corridor is read every thirty seconds while open and again on each return: an older read
 * landing last laid its older corridor over the newer one. A room read whole twice (left and entered
 * again, or asked again from TRY AGAIN) laid the older answer last, and a word the newer one held was
 * gone. A next page asked under a read of the room since begun again was joined to it. Each read is
 * now numbered (the corridor's; each room's, a next page asking under the read it continues), and an
 * older answer is dropped. The house is the shared fake, its answers held and let go newest first.
 */
import { onlineManager } from '@tanstack/react-query';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';
const ROOM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const START = Date.parse('2026-11-18T10:00:00Z');
const idOf = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
const word = (i: number, room = ROOM) => ({ id: idOf(i), lounge_id: room, user_id: ANA, content: `words ${i}`, type: 'text', created_at: new Date(START + i * 1000).toISOString(), deleted_at: null });

let mockName = 'The First Name';
let mockWords = [0, 1, 2, 3, 4].map((i) => word(i));
const salon = () => ({ id: ROOM, name: mockName, description: 'Talk', is_private: false, creator_id: ANA, created_at: '2026-11-01T12:00:00Z', member_count: 3, cover_image: null });
const house = () => supabaseFake({
  rows: { profiles: [{ id: ME, username: 'me' }, { id: ANA, username: 'ana' }], lounge_message_reactions: [] },
  rpc: {
    get_lounge_list: () => ({
      memberships: [{ lounge_id: ROOM, last_read_at: null, status: 'approved' }],
      newest: [salon()], hosted: [], joined: [salon()],
      unread: [{ lounge_id: ROOM, unread_count: 0, last_message_at: null }],
      pending: [], faces: [], last_words: [],
    }),
  },
  // Every read of the room's words: before or after the cursor a page carries (the room's moments
  // are each a second apart, so its moment alone places it), and the fake orders them.
  answer: {
    lounge_messages: (ask) => {
      const room = ask.filters.find(([op, col]) => op === 'eq' && col === 'lounge_id')?.[2];
      const cursor = (ask.ors ?? [])[0]?.match(/^created_at\.(lt|gt)\.([^,]+),/);
      return mockWords.filter((w) => w.lounge_id === room
        && (!cursor || (cursor[1] === 'lt' ? w.created_at < cursor[2]! : w.created_at > cursor[2]!)));
    },
  },
});
let mockHouse = house();
jest.mock('@/src/lib/supabase', () => ({
  get supabase() {
    return { ...mockHouse.client, channel: () => ({ on() { return this; }, subscribe() { return this; }, track: jest.fn(), send: jest.fn(), presenceState: () => ({}) }), removeChannel: async () => 'ok' };
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const settled = async () => { for (let i = 0; i < 6; i += 1) await new Promise<void>((res) => setImmediate(res)); };
const ids = () => useLoungeStore.getState().currentMessages.map((m) => m.content);

beforeEach(() => {
  onlineManager.setOnline(true);
  mockName = 'The First Name';
  mockWords = [0, 1, 2, 3, 4].map((i) => word(i));
  mockHouse = house();
  useLoungeStore.setState({ lounges: [], loungesRead: true, currentLoungeId: null, currentMessages: [], messagesLoading: false, messagesFailed: false });
});

it('of two reads of the corridor, the older answering last is not laid over the newer', async () => {
  mockHouse.hold();
  const older = useLoungeStore.getState().fetchLounges();
  await settled();
  mockName = 'Renamed Since';
  const newer = useLoungeStore.getState().fetchLounges();
  await settled();
  mockHouse.release('newest');
  await Promise.all([older, newer]);
  expect(useLoungeStore.getState().lounges.map((l) => l.name)).toEqual(['Renamed Since']);
  expect(useLoungeStore.getState().loungesLoading).toBe(false);
});

it('of two whole reads of a room, the older answering last does not take away a word the newer holds', async () => {
  mockHouse.hold();
  const older = useLoungeStore.getState().fetchMessages(ROOM);
  await settled();
  mockWords = [...mockWords, word(5)];
  const newer = useLoungeStore.getState().fetchMessages(ROOM);
  await settled();
  mockHouse.release('newest');
  await Promise.all([older, newer]);
  expect(ids()).toEqual(['words 0', 'words 1', 'words 2', 'words 3', 'words 4', 'words 5']);
  expect(useLoungeStore.getState().messagesLoading).toBe(false);
});

it('a next page asked before the room was read again from what it kept is not joined to it', async () => {
  mockWords = [0, 1, 2, 3, 4, 5, 6].map((i) => word(i));
  useLoungeStore.setState({ currentLoungeId: ROOM, currentMessages: [] });
  // The room's newest five read, the two oldest left for a next page.
  mockWords = mockWords.slice(2);
  await useLoungeStore.getState().fetchMessages(ROOM);
  mockWords = [0, 1, 2, 3, 4, 5, 6].map((i) => word(i));
  mockHouse.hold();
  const more = useLoungeStore.getState().loadMoreMessages(ROOM);
  await settled();
  // Another room opened and this one again before the page answered: drawn from what was kept, read again from it.
  void useLoungeStore.getState().fetchMessages(OTHER);
  void useLoungeStore.getState().fetchMessages(ROOM);
  await settled();
  expect(ids()).toEqual(['words 2', 'words 3', 'words 4', 'words 5', 'words 6']);
  // The page answers first, then the other room, then the catch-up.
  mockHouse.release();
  await more;
  await settled();
  expect(ids()).toEqual(['words 2', 'words 3', 'words 4', 'words 5', 'words 6']);
});
