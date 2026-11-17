/**
 * aSalonReadWhileTheCorridorIsReadStaysRead.test.ts — review round 8
 * ─────────────────────────────────────────────────────────────────────────────
 * The corridor reads itself again as the member comes back to it, no later than the room's mark
 * on leaving: that read (get_lounge_list), asked first and landing after, wrote the room's old
 * count back, and the salon just read said "N unread" until the next poll. A salon marked read
 * while a corridor read is out now stays at 0 unread when that read lands (_readRoomsHere); a
 * mark the house refused is not laid over, and a read asked after the mark is the house's word.
 * Against the house as strict as it is (test-utils/supabaseFake), the corridor's answer worked
 * out when it is asked and held until the test lets it go.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';
import { resetAllStores } from '../resetAllStores';

const ME = '33333333-3333-4333-8333-333333333333';
const HOST = '55555555-5555-4555-8555-555555555555';
const R1 = '00000000-0000-4000-9000-000000000001';
const R2 = '00000000-0000-4000-9000-000000000002';

/** A salon as the house holds it. */
const room = (id: string, n: number) => ({
  id, name: `Salon ${n}`, description: 'Talk', is_private: false, creator_id: HOST,
  created_at: `2026-11-0${n}T12:00:00Z`, member_count: 3, cover_image: null,
});

/** How many words in each salon the member has not read, as the house counts them now. */
let mockUnread: Record<string, number> = {};
/** Salons whose mark the house refuses. */
let mockRefused = new Set<string>();

const roomOf = (ask: Ask) => ask.filters.find(([op, col]) => op === 'eq' && col === 'lounge_id')?.[2] as string;
const mockHouse = supabaseFake({
  rpc: {
    // The corridor as it stands when asked: both salons, the member seated in each.
    get_lounge_list: () => ({
      memberships: [R1, R2].map((id) => ({ lounge_id: id, last_read_at: null, status: 'approved' })),
      newest: [room(R2, 2), room(R1, 1)], hosted: [], joined: [room(R1, 1), room(R2, 2)],
      unread: [R1, R2].map((id) => ({ lounge_id: id, unread_count: mockUnread[id] ?? 0, last_message_at: null })),
      pending: [], faces: [], last_words: [],
    }),
  },
  answer: {
    // The seat's mark: refused, or every word in the salon read.
    lounge_members: (ask) => {
      if (mockRefused.has(roomOf(ask))) return { code: '42501', message: 'permission denied for table lounge_members' };
      mockUnread[roomOf(ask)] = 0;
      return [];
    },
  },
});
/** The corridor's answers, each worked out when asked and waiting until let go, oldest first. */
const mockWaiting: (() => void)[] = [];
const mockCorridor = {
  client: {
    from: (table: string) => mockHouse.client.from(table),
    rpc: (fn: string, args?: Record<string, unknown>) => {
      const answered = mockHouse.client.rpc(fn, args);
      return new Promise((resolve) => { mockWaiting.push(() => resolve(answered)); });
    },
  },
};
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockCorridor.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333' } }) } }));

const turns = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
/** The corridor's read, asked now and held. */
const askTheCorridor = async () => {
  const read = useLoungeStore.getState().fetchLounges();
  await turns();
  expect(mockWaiting).toHaveLength(1);
  // Inside an object: an async function handing back the promise itself would wait on it.
  return { read };
};
/** The corridor's read let go. */
const answerTheCorridor = async (read: Promise<void>) => {
  const go = mockWaiting.shift();
  expect(go).toBeDefined();
  go!();
  await read;
};
const unread = () => Object.fromEntries(useLoungeStore.getState().lounges.map((l) => [l.id, l.unread_count]));

let clock = 1_000_000;
beforeEach(async () => {
  clock += 1_000_000;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  await resetAllStores(ME);
  mockUnread = { [R1]: 3, [R2]: 2 };
  mockRefused = new Set();
  // The corridor as the member last read it.
  const { read } = await askTheCorridor();
  await answerTheCorridor(read);
  expect(unread()).toEqual({ [R1]: 3, [R2]: 2 });
});

afterEach(() => {
  expect(mockWaiting).toHaveLength(0);
  jest.restoreAllMocks();
});

it('a salon read while the corridor was being read says nothing unread when that read lands', async () => {
  const { read } = await askTheCorridor();               // asked: 3 unread in the salon, as the house counts them
  clock += 1;
  await useLoungeStore.getState().markRead(R1);          // the mark lands first
  expect(unread()).toEqual({ [R1]: 0, [R2]: 2 });
  await answerTheCorridor(read);                         // the read, asked before it, lands after

  expect(unread()).toEqual({ [R1]: 0, [R2]: 2 });
});

it('a mark the house refused is not laid over the read: that salon counts its unread again, the one taken stays read', async () => {
  mockRefused = new Set([R1]);
  const { read } = await askTheCorridor();
  clock += 1;
  await Promise.all([useLoungeStore.getState().markRead(R1), useLoungeStore.getState().markRead(R2)]);
  await answerTheCorridor(read);

  expect(unread()).toEqual({ [R1]: 3, [R2]: 0 });
});

it('once a read asked after the mark has answered, the salon counts what the house counts', async () => {
  const { read: first } = await askTheCorridor();
  clock += 1;
  await useLoungeStore.getState().markRead(R1);
  await answerTheCorridor(first);
  expect(unread()).toEqual({ [R1]: 0, [R2]: 2 });

  // Words written in the salon since; asked later than the house took the mark, a read is the house's word.
  clock += 1_000;
  mockUnread[R1] = 1;
  const { read: second } = await askTheCorridor();
  await answerTheCorridor(second);
  expect(unread()).toEqual({ [R1]: 1, [R2]: 2 });
});
