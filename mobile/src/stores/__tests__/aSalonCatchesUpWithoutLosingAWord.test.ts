/**
 * A salon catches up without losing a word (P4.8).
 *
 * Every read of an open room again (on return to the app, on its channel coming back, on the
 * not-live interval) replaced what it held: a failed bubble was erased with its words, the
 * older pages the member had scrolled up to went, and a read that failed raised "Could not load
 * messages" each time. Now it reads only what is newer than the newest message held, page after
 * page, and merges it in; the held ones are read again light (withdrawn, gone, their reactions).
 * Nothing is tried offline, and no failure is toasted.
 */
import { onlineManager } from '@tanstack/react-query';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useLoungeStore, type LoungeMessage } from '../lounge';

const ROOM = '11111111-1111-4111-8111-111111111111';
const ANA = '66666666-6666-4666-8666-666666666666';
const ME = '33333333-3333-4333-8333-333333333333';
const PEOPLE = [{ id: ME, username: 'me' }, { id: ANA, username: 'ana' }];
const START = Date.parse('2026-10-27T10:00:00Z');
const idOf = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
const atOf = (i: number) => new Date(START + i * 1000).toISOString();
type Row = { id: string; lounge_id: string; user_id: string; content: string; type: string; created_at: string; deleted_at: string | null };
const row = (i: number): Row => ({ id: idOf(i), lounge_id: ROOM, user_id: ANA, content: `words ${i}`, type: 'text', created_at: atOf(i), deleted_at: null });
const held = (i: number): LoungeMessage => ({ id: idOf(i), lounge_id: ROOM, user_id: ANA, username: 'ana', content: `words ${i}`, type: 'text', created_at: atOf(i) } as LoungeMessage);

/** The house: the room's messages, answering the catch-up's cursor and the light reread by what they ask. */
function house(server: Row[], reactions: Record<string, unknown>[] = []) {
  const after = (ask: Ask) => {
    const m = /created_at\.gt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.gt\.([^)]+)\)/.exec(ask.ors?.[0] ?? '');
    if (!m) return null;
    const [, at = '', id = ''] = m;
    return server.filter((r) => Date.parse(r.created_at) > Date.parse(at) || (r.created_at === at && r.id > id));
  };
  const within = (ask: Ask) => {
    const from = ask.filters.find(([op]) => op === 'gte')?.[2] as string | undefined;
    const to = ask.filters.find(([op]) => op === 'lte')?.[2] as string | undefined;
    return from && to ? server.filter((r) => r.created_at >= from && r.created_at <= to) : null;
  };
  return supabaseFake({
    rows: { profiles: PEOPLE, lounge_message_reactions: reactions },
    answer: { lounge_messages: (ask) => after(ask) ?? within(ask) ?? server },
  });
}

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

/** A send that failed after the 250th message, its words kept for TRY AGAIN. */
const FAILED = { id: '77777777-7777-4777-8777-777777777777', lounge_id: ROOM, user_id: ME, username: 'me', content: 'my unsent words', type: 'text', created_at: new Date(START + 249_500).toISOString(), status: 'failed' } as LoungeMessage;
const open = (messages: LoungeMessage[]) => useLoungeStore.setState({
  currentLoungeId: ROOM, currentMessages: messages, messagesLoading: false, messagesFailed: false,
});
const ids = () => useLoungeStore.getState().currentMessages.map((m) => m.id);

beforeEach(() => {
  mockToast.error.mockClear();
  onlineManager.setOnline(true);
});
afterAll(() => { onlineManager.setOnline(true); });

it('250 held and a failed send; 150 more on the house: all 400 held in order, and the failed bubble still drawn', async () => {
  // Two older pages loaded and the newest: the room's first 250 words.
  open([...Array.from({ length: 250 }, (_, i) => held(i)), FAILED]);
  mockHouse = house(Array.from({ length: 400 }, (_, i) => row(i)));
  let spun = false;
  const unsub = useLoungeStore.subscribe((s) => { if (s.messagesLoading) spun = true; });

  // The return to the app, then the channel back after a drop, then the not-live interval.
  await useLoungeStore.getState().fetchMessages(ROOM);
  await useLoungeStore.getState().catchUpMessages(ROOM);
  await useLoungeStore.getState().catchUpMessages(ROOM);
  unsub();

  const all = useLoungeStore.getState().currentMessages;
  expect(all.filter((m) => m.id !== FAILED.id).map((m) => m.id)).toEqual(Array.from({ length: 400 }, (_, i) => idOf(i)));
  const kept = all.find((m) => m.id === FAILED.id);
  expect([kept?.content, kept?.status]).toEqual(['my unsent words', 'failed']);
  // Where it was sent: after the 250th message, before the 251st.
  expect(ids().indexOf(FAILED.id)).toBe(250);
  expect([spun, mockToast.error.mock.calls.length]).toEqual([false, 0]);
});

it('reads the held ones again light: a withdrawal, a reaction, a message taken down', async () => {
  open(Array.from({ length: 50 }, (_, i) => held(i)));
  const server = Array.from({ length: 50 }, (_, i) => row(i))
    .filter((r) => r.id !== idOf(30))
    .map((r) => (r.id === idOf(10) ? { ...r, deleted_at: '2026-10-27T11:00:00Z' } : r));
  mockHouse = house(server, [{ id: '55555555-5555-4555-8555-555555555555', message_id: idOf(20), lounge_id: ROOM, user_id: ANA, reaction: 'bravo' }]);
  await useLoungeStore.getState().catchUpMessages(ROOM);
  const by = new Map(useLoungeStore.getState().currentMessages.map((m) => [m.id, m]));
  expect([by.get(idOf(10))?.content, !!by.get(idOf(10))?.deleted_at]).toEqual(['', true]);
  expect(by.get(idOf(20))?.reactions).toEqual([{ reaction: 'bravo', count: 1, mine: false }]);
  expect(by.has(idOf(30))).toBe(false);
});

it('a message the read leaves as it was is the same message: its row is not drawn again', async () => {
  const before = Array.from({ length: 20 }, (_, i) => held(i));
  open(before);
  mockHouse = house(Array.from({ length: 20 }, (_, i) => row(i)));
  await useLoungeStore.getState().catchUpMessages(ROOM);
  expect(useLoungeStore.getState().currentMessages).toBe(before);
});

it('offline, no read is made and nothing is said', async () => {
  open([held(0), FAILED]);
  mockHouse = house([row(0), row(1)]);
  onlineManager.setOnline(false);
  for (let i = 0; i < 3; i++) await useLoungeStore.getState().catchUpMessages(ROOM);
  expect(mockHouse.asked).toHaveLength(0);
  expect(mockToast.error).not.toHaveBeenCalled();
  expect(ids()).toEqual([idOf(0), FAILED.id]);
});

it('a catch-up that fails leaves what is held, and says nothing', async () => {
  open([held(0), FAILED]);
  mockHouse = supabaseFake({ fail: { lounge_messages: { code: '', message: 'Failed to fetch' } } });
  await useLoungeStore.getState().fetchMessages(ROOM);
  expect(ids()).toEqual([idOf(0), FAILED.id]);
  expect(mockToast.error).not.toHaveBeenCalled();
});

it('more missed than the room holds: read again from its newest, the member’s own unsent words kept', async () => {
  open([held(0), FAILED]);
  mockHouse = house(Array.from({ length: 900 }, (_, i) => row(i)));
  await useLoungeStore.getState().catchUpMessages(ROOM);
  const got = ids();
  expect(got.filter((id) => id !== FAILED.id)).toEqual(Array.from({ length: 100 }, (_, i) => idOf(800 + i)));
  expect(got).toContain(FAILED.id);
});
