/**
 * A word heard while the room is read stays (review round 13, the salon).
 *
 * A salon opened for the first time is read whole while its channel joins. A word said after the
 * read's moment, heard over the channel before the read answered, was wiped when the answer replaced
 * the room: the transcript had a hole where it was until a reconnect or a return to the app. And the
 * channel's first live moment was never caught up on, so a word said between the read's moment and
 * the channel's was in neither. Now the read's answer is laid under every word heard since it was
 * asked, and the channel's first SUBSCRIBED reads what came since the room's read: at once when the
 * read has landed, as soon as it lands when it is still out.
 */
import { onlineManager } from '@tanstack/react-query';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const ROOM = '11111111-1111-4111-8111-111111111111';
const ANA = '66666666-6666-4666-8666-666666666666';
const ME = '33333333-3333-4333-8333-333333333333';
const PEOPLE = [{ id: ME, username: 'me' }, { id: ANA, username: 'ana' }];
const START = Date.parse('2026-11-18T10:00:00Z');
const idOf = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
type Row = { id: string; lounge_id: string; user_id: string; content: string; type: string; created_at: string; deleted_at: string | null };
const row = (i: number): Row => ({ id: idOf(i), lounge_id: ROOM, user_id: ANA, content: `words ${i}`, type: 'text', created_at: new Date(START + i * 1000).toISOString(), deleted_at: null });

/** The room as the house read it: five words, the sixth said after the read's moment. */
const SERVER = Array.from({ length: 5 }, (_, i) => row(i));
const mockHouse = supabaseFake({ rows: { profiles: PEOPLE, lounge_message_reactions: [] }, answer: { lounge_messages: () => SERVER } });
/** The room's read held until the test lets it answer. */
let mockGate: Promise<void> | null = null;
const mockFrom = (table: string) => {
  const q = mockHouse.client.from(table);
  const gate = mockGate;
  if (table !== 'lounge_messages' || !gate) return q;
  const answer = q.then.bind(q);
  (q as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => gate.then(() => answer(res, rej));
  return q;
};
/** The channel the room joins: its status and its handlers, handed to the test. */
let mockStatus: ((s: string) => void) | null = null;
const mockHandlers = new Map<string, (payload: { new?: unknown; old?: unknown }) => unknown>();
const mockChannel: Record<string, unknown> = {};
Object.assign(mockChannel, {
  on: (kind: string, filter: { event?: string; table?: string }, handler: (payload: { new?: unknown }) => unknown) => {
    mockHandlers.set(`${kind}:${filter?.event ?? ''}:${filter?.table ?? ''}`, handler);
    return mockChannel;
  },
  subscribe: (cb?: (s: string) => void) => { mockStatus = cb ?? null; return mockChannel; },
  track: jest.fn(), send: jest.fn(), presenceState: () => ({}),
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() {
    return { ...mockHouse.client, from: mockFrom, channel: () => mockChannel, removeChannel: async () => 'ok' };
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

const ids = () => useLoungeStore.getState().currentMessages.map((m) => m.id);
const gated = () => {
  let open!: () => void;
  mockGate = new Promise<void>((resolve) => { open = resolve; });
  return () => { mockGate = null; open(); };
};
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));
const realCatchUp = useLoungeStore.getState().catchUpMessages;

let leave: (() => void) | null = null;
beforeEach(() => {
  onlineManager.setOnline(true);
  mockGate = null;
  mockStatus = null;
  mockHandlers.clear();
  useLoungeStore.setState({ currentLoungeId: null, currentMessages: [], messagesLoading: false, messagesFailed: false, catchUpMessages: realCatchUp });
});
afterEach(() => { leave?.(); leave = null; });

it('a word heard over the channel while the room\'s first read is out stays after the read answers, in its place', async () => {
  const letItAnswer = gated();
  leave = useLoungeStore.getState().subscribeToLounge(ROOM, { seated: false });
  const reading = useLoungeStore.getState().fetchMessages(ROOM);
  await settled();
  // The sixth word is said after the read's moment, and heard before its answer.
  const heard = mockHandlers.get('postgres_changes:INSERT:lounge_messages');
  expect(heard).toBeDefined();
  await heard!({ new: row(5) });
  expect(ids()).toEqual([idOf(5)]);
  letItAnswer();
  await reading;
  expect(ids()).toEqual([0, 1, 2, 3, 4, 5].map(idOf));
});

it('the channel\'s first live moment, after the room\'s read landed, reads what came since', async () => {
  await useLoungeStore.getState().fetchMessages(ROOM);
  const catchUp = jest.fn(async () => {});
  useLoungeStore.setState({ catchUpMessages: catchUp });
  leave = useLoungeStore.getState().subscribeToLounge(ROOM, { seated: false });
  expect(mockStatus).not.toBeNull();
  mockStatus!('SUBSCRIBED');
  expect(catchUp).toHaveBeenCalledTimes(1);
  // Live again without a break: nothing more is read.
  mockStatus!('SUBSCRIBED');
  expect(catchUp).toHaveBeenCalledTimes(1);
});

it('live while the room\'s read is still out: what came between is read as soon as the read lands', async () => {
  const letItAnswer = gated();
  const catchUp = jest.fn(async () => {});
  useLoungeStore.setState({ catchUpMessages: catchUp });
  leave = useLoungeStore.getState().subscribeToLounge(ROOM, { seated: false });
  const reading = useLoungeStore.getState().fetchMessages(ROOM);
  await settled();
  mockStatus!('SUBSCRIBED');
  expect(catchUp).not.toHaveBeenCalled();
  letItAnswer();
  await reading;
  expect(catchUp).toHaveBeenCalledTimes(1);
  expect(catchUp).toHaveBeenCalledWith(ROOM);
});

it('a channel live for a room not open reads nothing', () => {
  const catchUp = jest.fn(async () => {});
  useLoungeStore.setState({ catchUpMessages: catchUp });
  leave = useLoungeStore.getState().subscribeToLounge(ROOM, { seated: false });
  mockStatus!('SUBSCRIBED');
  expect(catchUp).not.toHaveBeenCalled();
});


it('the member\'s own words sent while the room\'s first read is out stay after it answers, still sending or failed', async () => {
  const letItAnswer = gated();
  const reading = useLoungeStore.getState().fetchMessages(ROOM);
  await settled();
  const mine = (id: string, status: 'sending' | 'failed') => ({
    id, lounge_id: ROOM, user_id: ME, username: 'me', content: `my words ${id}`, type: 'text' as const,
    created_at: new Date(START + 10_000).toISOString(), status,
  });
  const sending = mine('88888888-8888-4888-8888-000000000001', 'sending');
  const failed = mine('88888888-8888-4888-8888-000000000002', 'failed');
  useLoungeStore.setState((s) => ({ currentMessages: [...s.currentMessages, sending, failed] }));
  letItAnswer();
  await reading;
  expect(ids()).toEqual([0, 1, 2, 3, 4].map(idOf).concat([sending.id, failed.id]));
  expect(useLoungeStore.getState().currentMessages.slice(-2).map((m) => m.status)).toEqual(['sending', 'failed']);
});
