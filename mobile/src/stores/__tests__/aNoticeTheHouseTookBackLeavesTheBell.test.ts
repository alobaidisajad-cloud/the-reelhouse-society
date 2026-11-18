/**
 * aNoticeTheHouseTookBackLeavesTheBell.test.ts — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * The house takes notices back on its own: a follow request withdrawn, a follow or a certification
 * taken back, a salon request answered on the host's other phone. The phone heard only new notices,
 * so an open phone kept counting the gone one in the bell, and a certification given again read as
 * two. The house now tells each member's phone, on a private topic of their own
 * ('notices:<member>', 'notices_gone'), which of their notices went; the phone takes them off the
 * board and their unread ones off the bell, and keeps them gone: a read asked before the word, or the
 * notice's own arrival heard after it, never brings one back. The word is heard by its member alone,
 * and never applied once they have signed out.
 *
 * Here the realtime client records each channel opened and what it listens for; the house's rows are
 * supabaseFake's.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore, type AppNotification } from '../notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';
const ID = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

type Handler = { kind: string; cfg: Record<string, unknown>; fn: (payload: unknown) => void };
interface Wire { topic: string; opts: unknown; handlers: Handler[]; status?: (s: string) => void }
const mockWires: Wire[] = [];
let mockHouse = supabaseFake({ rows: { notifications: [] } });
function mockRealtime(client: typeof mockHouse.client) {
  return {
    ...client,
    channel: (name: string, opts?: unknown) => {
      const wire: Wire = { topic: name, opts, handlers: [] };
      mockWires.push(wire);
      const api: Record<string, unknown> = {};
      Object.assign(api, {
        on: (kind: string, cfg: Record<string, unknown>, fn: (payload: unknown) => void) => { wire.handlers.push({ kind, cfg, fn }); return api; },
        subscribe: (cb?: (s: string) => void) => { wire.status = cb; return api; },
      });
      return api;
    },
    removeChannel: () => Promise.resolve('ok'),
  };
}
let mockUser: { id: string; username: string } | null = null;
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockRealtime(mockHouse.client); } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: mockUser }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));

const notice = (n: number, read = false): AppNotification => ({
  id: ID(n), user_id: ME, type: 'endorse', message: 'certified your log of Vertigo.', read, created_at: `2026-11-17T10:00:${String(n).padStart(2, '0')}.000Z`,
});
const board = () => useNotificationStore.getState().notifications.map((n) => n.id);
const bell = () => useNotificationStore.getState()._unreadCount;
const wire = (topic: string) => {
  const found = mockWires.find((w) => w.topic === topic);
  expect(found).toBeDefined();
  return found!;
};
/** The house's word on a topic, as realtime-js hands a broadcast to its listener. */
const tell = (topic: string, ids: string[]) => {
  for (const h of wire(topic).handlers.filter((x) => x.kind === 'broadcast' && x.cfg.event === 'notices_gone')) {
    h.fn({ type: 'broadcast', event: 'notices_gone', payload: { ids } });
  }
};
/** A notice arriving over the notices' channel. */
const arrives = (n: number) => {
  const row = { id: ID(n), user_id: ME, type: 'endorse', message: 'certified your log of Vertigo.', is_read: false, created_at: '2026-11-17T11:00:00.000Z' };
  for (const h of wire('global_notifications').handlers.filter((x) => x.kind === 'postgres_changes')) h.fn({ new: row });
};

let leave: void | (() => void);
beforeEach(() => {
  mockUser = { id: ME, username: 'me' };
  mockWires.length = 0;
  mockHouse = supabaseFake({ rows: { notifications: [] } });
  // Three on the board: two unread, one read.
  useNotificationStore.setState({ notifications: [notice(3), notice(2, true), notice(1)], _unreadCount: 2 } as never);
  leave = useNotificationStore.getState().setupRealtime();
});
afterEach(() => { if (typeof leave === 'function') leave(); });

it('listens for the house’s word on the member’s own private topic, and no one else’s', () => {
  const own = wire(`notices:${ME}`);
  expect(own.opts).toEqual({ config: { private: true } });
  expect(mockWires.filter((w) => w.topic.startsWith('notices:')).map((w) => w.topic)).toEqual([`notices:${ME}`]);
});

it('a notice the house took back leaves the board, and its unread count leaves the bell', () => {
  tell(`notices:${ME}`, [ID(3), ID(2)]);
  expect(board()).toEqual([ID(1)]);
  expect(bell()).toBe(1);
});

it('a certification given again after it was taken back reads as one, never two', () => {
  tell(`notices:${ME}`, [ID(1)]);
  arrives(4);
  expect(board()).toEqual([ID(4), ID(3), ID(2)]);
  expect(bell()).toBe(2);
});

it('the notice’s own arrival heard after the word is never drawn', () => {
  tell(`notices:${ME}`, [ID(5)]);
  arrives(5);
  expect(board()).not.toContain(ID(5));
  expect(bell()).toBe(2);
});

it('a read asked before the word lands without the notice, its unread uncounted', async () => {
  const unread = (n: number) => ({ id: ID(n), user_id: ME, type: 'endorse', message: 'certified your log of Vertigo.', is_read: false, created_at: `2026-11-17T10:00:0${n}.000Z` });
  mockHouse = supabaseFake({ rows: { notifications: [unread(1), unread(3)] } });
  const reading = useNotificationStore.getState().fetchNotifications();
  tell(`notices:${ME}`, [ID(3)]);
  await reading;
  expect(board()).toEqual([ID(1)]);
  expect(bell()).toBe(1);
});

it('a word heard after the member signed out is never applied, and a malformed one is dropped', () => {
  tell(`notices:${ME}`, [ID(1)]);
  const before = board();
  for (const h of wire(`notices:${ME}`).handlers) h.fn({ type: 'broadcast', event: 'notices_gone', payload: { ids: 'all' } });
  expect(board()).toEqual(before);
  mockUser = null;
  tell(`notices:${ME}`, [ID(3)]);
  expect(board()).toEqual(before);
});

it('forgetGoneNotices takes only the notices it names, read or unread, and nothing when none is held', () => {
  const store = useNotificationStore.getState();
  store.forgetGoneNotices([]);
  expect(board()).toEqual([ID(3), ID(2), ID(1)]);
  store.forgetGoneNotices([ID(2), ID(9)]);
  expect(board()).toEqual([ID(3), ID(1)]);
  expect(bell()).toBe(2);
});

it('the word’s channel back after a drop reads the board again, and down past a beat the board is not said live', async () => {
  jest.useFakeTimers();
  const original = useNotificationStore.getState().fetchNotifications;
  try {
    const read = jest.fn(async () => {});
    useNotificationStore.setState({ fetchNotifications: read });
    if (typeof leave === 'function') leave();
    const made = mockWires.length;
    leave = useNotificationStore.getState().setupRealtime();
    // Opened again under the same names, the channels wait for the last leave to be answered
    // (openChannel): the member's channel is the one made after it, never the one left.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const own = mockWires.slice(made).find((w) => w.topic === `notices:${ME}`);
    expect(own).toBeDefined();
    expect(own!.status).toBeDefined();
    own!.status!('SUBSCRIBED');
    // Its first live moment reads the board too (round 13): the reads below are the drop's.
    read.mockClear();
    own!.status!('CHANNEL_ERROR');
    jest.advanceTimersByTime(6_000);
    expect(useNotificationStore.getState().noticesLive).toBe(false);
    own!.status!('SUBSCRIBED');
    expect(useNotificationStore.getState().noticesLive).toBe(true);
    // Read once down past the beat, and once more on the way back: what went meanwhile is not on the board.
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    if (typeof leave === 'function') leave();
    leave = undefined;
    useNotificationStore.setState({ fetchNotifications: original });
    jest.useRealTimers();
  }
});
