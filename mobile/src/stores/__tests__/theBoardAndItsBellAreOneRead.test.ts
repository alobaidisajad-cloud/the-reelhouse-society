/**
 * The board and its bell are one read (review round 13, the notices).
 *
 * The board read its newest notices and the bell's unread count as two reads, each at its own
 * moment: a notice that came between them was in one and not the other, and the bell counted a
 * notice the board did not hold, or missed one it did. Now both come from the house's one read
 * (notices_page), one moment, one trip; a notice heard live that the read does not hold is counted
 * once on top of it. A house without that read yet (PGRST202) is read as before, in two reads.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore } from '../notificationStore';

const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';
const START = Date.parse('2026-11-18T10:00:00Z');
const idOf = (i: number) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`;
const notice = (i: number, read = false) => ({
  id: idOf(i), user_id: ME, type: 'endorse', from_username: 'ana', from_user_id: ANA, message: `certified your entry ${i}`,
  is_read: read, created_at: new Date(START + i * 1000).toISOString(), film_id: null, poster_path: null, group_key: null,
  title: null, related_lounge_id: null, metadata: null,
});

/** What the house's one read answers, and how often it was asked; null: the house lacks it. */
let mockPage: { rows: unknown[]; unread: number } | null = null;
let mockPageAsked = 0;
/** The read held until the test lets it answer. */
let mockGate: Promise<void> | null = null;
const mockHouse = supabaseFake({
  // The two older reads see a different board, so an answer from them is told apart.
  rows: { notifications: [notice(7), notice(8)] },
  rpc: {
    notices_page: (args: Record<string, unknown>) => {
      mockPageAsked += 1;
      expect(args).toEqual({ p_limit: 30 });
      return mockPage ?? { error: { code: 'PGRST202', message: 'Could not find the function public.notices_page' } };
    },
  },
});
const mockHandlers = new Map<string, (payload: { new?: unknown }) => unknown>();
const mockChannel: Record<string, unknown> = {};
Object.assign(mockChannel, {
  on: (kind: string, filter: { event?: string; table?: string }, handler: (payload: { new?: unknown }) => unknown) => {
    mockHandlers.set(`${kind}:${filter?.event ?? ''}:${filter?.table ?? ''}`, handler);
    return mockChannel;
  },
  subscribe: () => mockChannel,
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() {
    return {
      ...mockHouse.client,
      rpc: (fn: string, args: Record<string, unknown>) => {
        const gate = mockGate;
        return gate ? gate.then(() => mockHouse.client.rpc(fn, args)) : mockHouse.client.rpc(fn, args);
      },
      channel: () => mockChannel,
      removeChannel: async () => 'ok',
    };
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }), subscribe: () => () => {} } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const board = () => useNotificationStore.getState().notifications.map((n) => n.id);
const tablesRead = () => mockHouse.asked.filter((a) => a.table === 'notifications').length;
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

let leave: unknown = null;
beforeEach(() => {
  mockPage = null;
  mockPageAsked = 0;
  mockGate = null;
  mockHouse.asked.length = 0;
  useNotificationStore.setState({ notifications: [], _unreadCount: 0, _fetching: false, _fetchingMore: false, loading: false });
});
afterEach(() => { if (typeof leave === 'function') (leave as () => void)(); leave = null; });

it('the board and the bell come from the house\'s one read, in one trip', async () => {
  mockPage = { rows: [notice(2), notice(1, true), notice(0, true)], unread: 1 };
  await useNotificationStore.getState().fetchNotifications();
  expect(mockPageAsked).toBe(1);
  expect(tablesRead()).toBe(0);
  expect(board()).toEqual([idOf(2), idOf(1), idOf(0)]);
  expect(useNotificationStore.getState()._unreadCount).toBe(1);
  expect(useNotificationStore.getState().fetchFailed).toBe(false);
});

it('a notice heard while the one read is out is counted once on top of it', async () => {
  leave = useNotificationStore.getState().setupRealtime();
  mockPage = { rows: [notice(2), notice(1, true)], unread: 1 };
  let open!: () => void;
  mockGate = new Promise<void>((resolve) => { open = resolve; });
  const reading = useNotificationStore.getState().fetchNotifications();
  await settled();
  mockHandlers.get('postgres_changes:INSERT:notifications')!({ new: notice(3) });
  mockGate = null;
  open();
  await reading;
  expect(board()).toEqual([idOf(3), idOf(2), idOf(1)]);
  expect(useNotificationStore.getState()._unreadCount).toBe(2);
});

it('a malformed answer is a failed read, never an empty board', async () => {
  useNotificationStore.setState({ notifications: [], _unreadCount: 0 });
  mockPage = { rows: 'not a list', unread: 1 } as unknown as { rows: unknown[]; unread: number };
  await useNotificationStore.getState().fetchNotifications();
  expect(useNotificationStore.getState().fetchFailed).toBe(true);
});

it('a house without the one read is read as before, in two reads', async () => {
  mockPage = null;
  await useNotificationStore.getState().fetchNotifications();
  expect(mockPageAsked).toBe(1);
  expect(tablesRead()).toBe(2);
  expect(board()).toEqual([idOf(8), idOf(7)]);
  expect(useNotificationStore.getState()._unreadCount).toBe(2);
});
