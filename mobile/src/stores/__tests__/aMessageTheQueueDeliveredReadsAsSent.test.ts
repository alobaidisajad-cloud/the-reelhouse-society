/**
 * aMessageTheQueueDeliveredReadsAsSent.test.ts — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * A message written offline waits in the queue, drawn 'sending'. The queue delivers it once the
 * phone is back; the channel's echo would mark it sent, but while the channel was down no echo
 * came. The room's catch-up read found the message in the house and passed over it, as one
 * already held: it stood dimmed, with no reply and no reaction, for as long as the app ran. And
 * when more was missed than the room holds, the room read again from its newest kept the member's
 * own copy beside the house's: the same message drawn twice.
 *
 * Now the house's word settles it: a message of the member's still drawn sending (or failed) that
 * the catch-up finds in the house is sent, at the house's time, and held once.
 */
import { onlineManager } from '@tanstack/react-query';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useLoungeStore, type LoungeMessage } from '../lounge';

const ROOM = '11111111-1111-4111-8111-111111111111';
const ANA = '66666666-6666-4666-8666-666666666666';
const ME = '33333333-3333-4333-8333-333333333333';
const PEOPLE = [{ id: ME, username: 'me' }, { id: ANA, username: 'ana' }];
const START = Date.parse('2026-11-17T10:00:00Z');
const idOf = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
const atOf = (i: number) => new Date(START + i * 1000).toISOString();
type Row = { id: string; lounge_id: string; user_id: string; content: string; type: string; created_at: string; deleted_at: string | null };
const row = (i: number): Row => ({ id: idOf(i), lounge_id: ROOM, user_id: ANA, content: `words ${i}`, type: 'text', created_at: atOf(i), deleted_at: null });
const held = (i: number): LoungeMessage => ({ id: idOf(i), lounge_id: ROOM, user_id: ANA, username: 'ana', content: `words ${i}`, type: 'text', created_at: atOf(i) } as LoungeMessage);

/** The member's own message, written offline: on the phone at the phone's time, in the house at the house's. */
const MINE_ID = '77777777-7777-4777-8777-777777777777';
const PHONE_AT = new Date(START + 30 * 60_000).toISOString();
const mine = (status: 'sending' | 'failed'): LoungeMessage =>
  ({ id: MINE_ID, lounge_id: ROOM, user_id: ME, username: 'me', content: 'Sent from the train.', type: 'text', created_at: PHONE_AT, status } as LoungeMessage);
const delivered = (at: string): Row => ({ id: MINE_ID, lounge_id: ROOM, user_id: ME, content: 'Sent from the train.', type: 'text', created_at: at, deleted_at: null });

/** The house: the room's messages, answering the catch-up's cursor and the light reread by what they ask. */
function house(server: Row[]) {
  const ordered = [...server].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : 1));
  const after = (ask: Ask) => {
    const m = /created_at\.gt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.gt\.([^)]+)\)/.exec(ask.ors?.[0] ?? '');
    if (!m) return null;
    const [, at = '', id = ''] = m;
    return ordered.filter((r) => Date.parse(r.created_at) > Date.parse(at) || (r.created_at === at && r.id > id));
  };
  const within = (ask: Ask) => {
    const from = ask.filters.find(([op]) => op === 'gte')?.[2] as string | undefined;
    const to = ask.filters.find(([op]) => op === 'lte')?.[2] as string | undefined;
    return from && to ? ordered.filter((r) => r.created_at >= from && r.created_at <= to) : null;
  };
  // The read from the newest asks newest first.
  const newestFirst = () => [...ordered].reverse();
  return supabaseFake({
    rows: { profiles: PEOPLE, lounge_message_reactions: [] },
    answer: { lounge_messages: (ask) => after(ask) ?? within(ask) ?? newestFirst() },
  });
}

let mockHouse = supabaseFake({ rows: {} });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const open = (messages: LoungeMessage[]) => useLoungeStore.setState({
  currentLoungeId: ROOM, currentMessages: messages, messagesLoading: false, messagesFailed: false,
});
const minesNow = () => useLoungeStore.getState().currentMessages.filter((m) => m.id === MINE_ID);

beforeEach(() => { onlineManager.setOnline(true); });

it.each(['sending', 'failed'] as const)('a message drawn %s that the queue delivered while the room was away reads as sent, at the house’s time', async (status) => {
  // Ten heard, then the member's own, written offline; the queue delivered it after the tenth.
  open([...Array.from({ length: 10 }, (_, i) => held(i)), mine(status)]);
  const houseAt = new Date(START + 10_500).toISOString();
  mockHouse = house([...Array.from({ length: 12 }, (_, i) => row(i)), delivered(houseAt)]);

  await useLoungeStore.getState().catchUpMessages(ROOM);

  const got = minesNow();
  expect(got.map((m) => [m.status, m.created_at])).toEqual([['sent', houseAt]]);
  // In its place among the rest: after the tenth, before the eleventh the catch-up brought.
  const ids = useLoungeStore.getState().currentMessages.map((m) => m.id);
  expect(ids).toEqual([...Array.from({ length: 11 }, (_, i) => idOf(i)), MINE_ID, idOf(11)]);
});

it('a message the house does not hold yet stays sending, and reads sent once the house holds it', async () => {
  open([...Array.from({ length: 10 }, (_, i) => held(i)), mine('sending')]);
  mockHouse = house(Array.from({ length: 12 }, (_, i) => row(i)));
  await useLoungeStore.getState().catchUpMessages(ROOM);
  // Sent is the house's word alone: here there is none yet.
  expect(minesNow().map((m) => m.status)).toEqual(['sending']);
  // The queue delivers it; the next catch-up finds it there.
  mockHouse = house([...Array.from({ length: 12 }, (_, i) => row(i)), delivered(new Date(START + 11_500).toISOString())]);
  await useLoungeStore.getState().catchUpMessages(ROOM);
  expect(minesNow().map((m) => m.status)).toEqual(['sent']);
});

it('more missed than the room holds: the room read again from its newest draws the delivered message once, sent', async () => {
  open([held(0), mine('sending')]);
  // 900 heard while away, the member's own among the newest hundred.
  const houseAt = new Date(START + 850_500).toISOString();
  mockHouse = house([...Array.from({ length: 900 }, (_, i) => row(i)), delivered(houseAt)]);

  await useLoungeStore.getState().catchUpMessages(ROOM);

  const got = minesNow();
  expect(got).toHaveLength(1);
  const only = got[0];
  expect(only).toBeDefined();
  expect([only!.status ?? 'sent', only!.created_at]).toEqual(['sent', houseAt]);
  const ids = useLoungeStore.getState().currentMessages.map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);
});
