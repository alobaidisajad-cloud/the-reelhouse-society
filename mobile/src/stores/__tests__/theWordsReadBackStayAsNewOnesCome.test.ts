/**
 * theWordsReadBackStayAsNewOnesCome.test.ts — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * An open room holds 400 messages; past that, each new one cuts the oldest (capMessages), which
 * scrolling up reads again. But a member who had scrolled back past 400 was reading the very
 * messages each new one cut: they vanished from the top of the page as the room talked, and the
 * scroll asked for them again. Now a room the member has read back in keeps every message it holds
 * while it stays open; another room opened caps again, and a room never read back caps as before.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useLoungeStore, MESSAGE_WINDOW, type LoungeMessage } from '../lounge';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';
const START = Date.parse('2026-01-01T10:00:00Z');
const idOf = (room: string, i: number) => `${room.slice(0, 8)}-4444-4444-8444-${String(i).padStart(12, '0')}`;
const atOf = (i: number) => new Date(START + i * 1000).toISOString();
type Row = { id: string; lounge_id: string; user_id: string; content: string; type: string; created_at: string; deleted_at: string | null };
const row = (room: string, i: number): Row => ({ id: idOf(room, i), lounge_id: room, user_id: ANA, content: `words ${i}`, type: 'text', created_at: atOf(i), deleted_at: null });
const asHeld = (r: Row): LoungeMessage => ({ ...r, username: 'ana', deleted_at: undefined } as unknown as LoungeMessage);

/** Each room's 500 messages, oldest first. */
const SERVER: Row[] = [...Array.from({ length: 500 }, (_, i) => row(A, i)), ...Array.from({ length: 500 }, (_, i) => row(B, i))];
let mockSent = 0;
/** What the member sent, as the house now holds it. */
const mockWritten: Row[] = [];
const roomOf = (ask: Ask) => ask.filters.find(([op, col]) => op === 'eq' && col === 'lounge_id')?.[2];
const byPlace = (a: Row, b: Row) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : 1);

/** The house: the room's reads answered by what they ask (older than, newer than, between, the newest). */
function answer(ask: Ask): Row[] {
  if (ask.op === 'upsert') {
    const written = ask.values?.at(0) as Row | undefined;
    mockSent += 1;
    if (!written) return [];
    const taken = { ...written, created_at: new Date(START + 3_600_000 + mockSent * 1000).toISOString(), deleted_at: null };
    mockWritten.push(taken);
    return [taken];
  }
  const rows = [...SERVER, ...mockWritten].filter((r) => r.lounge_id === roomOf(ask)).sort(byPlace);
  const or = ask.ors?.[0] ?? '';
  const lt = /created_at\.lt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.lt\.([^)]+)\)/.exec(or);
  if (lt) {
    const [, at = '', id = ''] = lt;
    return rows.filter((r) => Date.parse(r.created_at) < Date.parse(at) || (r.created_at === at && r.id < id)).reverse().slice(0, 100);
  }
  const gt = /created_at\.gt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.gt\.([^)]+)\)/.exec(or);
  if (gt) {
    const [, at = '', id = ''] = gt;
    return rows.filter((r) => Date.parse(r.created_at) > Date.parse(at) || (r.created_at === at && r.id > id)).slice(0, 100);
  }
  const from = ask.filters.find(([op]) => op === 'gte')?.[2] as string | undefined;
  const to = ask.filters.find(([op]) => op === 'lte')?.[2] as string | undefined;
  if (from && to) return rows.filter((r) => r.created_at >= from && r.created_at <= to);
  return rows.reverse().slice(0, 100);
}
const mockHouse = supabaseFake({
  rows: { profiles: [{ id: ANA, username: 'ana' }, { id: ME, username: 'me' }], lounge_message_reactions: [] },
  answer: { lounge_messages: answer },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const RESETS = (jest.requireMock('../resetAllStores') as { registerStoreReset: jest.Mock }).registerStoreReset.mock.calls
  .map(([handler]) => handler as (previous: string | null) => void);
const held = () => useLoungeStore.getState().currentMessages;
const heldIds = () => new Set(held().map((m) => m.id));
let said = 0;
/** The member says something new in the open room (each different, so no send is a double tap). */
const say = (room: string) => useLoungeStore.getState().sendMessage(room, `new words ${++said}`);

/** Room A opened on its newest 400 (rows 100 to 499), as four pages read in. */
function openOnNewest400(room: string) {
  useLoungeStore.setState({
    currentLoungeId: room, messagesLoading: false, messagesFailed: false, sending: false,
    currentMessages: SERVER.filter((r) => r.lounge_id === room).slice(100).map(asHeld),
  });
}

beforeEach(() => {
  for (const forget of RESETS) forget(null);
  mockWritten.length = 0;
  useLoungeStore.setState({ currentLoungeId: null, currentMessages: [] });
});

it('read back past 400, the oldest messages the member scrolled to stay as new ones are said', async () => {
  openOnNewest400(A);
  await useLoungeStore.getState().loadMoreMessages(A);
  expect(held()).toHaveLength(500);

  await say(A);
  await say(A);

  // Nothing cut from the top the member is reading: every message read back, and both new ones.
  expect(held()).toHaveLength(502);
  expect(heldIds().has(idOf(A, 0))).toBe(true);
  expect(held().filter((m) => m.user_id === ME).map((m) => m.content)).toEqual(['new words 1', 'new words 2']);
});

it('once another room is opened, the room read back in caps again on its return; a room never read back caps as before', async () => {
  openOnNewest400(A);
  await useLoungeStore.getState().loadMoreMessages(A);
  await say(A);
  expect(held()).toHaveLength(501);

  // Another room, never read back in: past 400, a new message cuts its oldest.
  await useLoungeStore.getState().fetchMessages(B);
  useLoungeStore.setState({ currentMessages: SERVER.filter((r) => r.lounge_id === B).slice(100).map(asHeld) });
  await say(B);
  expect(held()).toHaveLength(MESSAGE_WINDOW);
  expect(heldIds().has(idOf(B, 100))).toBe(false);

  // Back in the first room: its window is the room's again, and the next message caps it.
  await useLoungeStore.getState().fetchMessages(A);
  expect(useLoungeStore.getState().currentLoungeId).toBe(A);
  await say(A);
  expect(held()).toHaveLength(MESSAGE_WINDOW);
  const newest = held()[held().length - 1];
  expect(newest).toBeDefined();
  expect(newest!.content).toBe(`new words ${said}`);
});
