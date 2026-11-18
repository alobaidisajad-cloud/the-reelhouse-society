/**
 * A notice heard while the board is read stays (review round 13, the notices).
 *
 * The board read the house's newest notices and the bell's count while the member's channel stayed
 * open. A notice that arrived after the house read the board, heard over the channel before the
 * read answered, was put on top and counted, then the answer replaced the board and the count from
 * its own moment: the notice left the board and the bell dropped by one, until some later read. Now
 * the answer keeps every notice heard since it was asked that it does not hold, and counts it.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore } from '../notificationStore';

const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';
const START = Date.parse('2026-11-18T10:00:00Z');
const idOf = (i: number) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`;
const notice = (i: number, read = false) => ({
  id: idOf(i), user_id: ME, type: 'endorse', from_username: 'ana', from_user_id: ANA,
  message: `certified your entry ${i}`, is_read: read, created_at: new Date(START + i * 1000).toISOString(),
});

/** The board as the house read it: three notices, one of them unread. */
const BOARD = [notice(0, true), notice(1, true), notice(2)];
const mockHouse = supabaseFake({ rows: { notifications: BOARD } });
let mockGate: Promise<void> | null = null;
const mockFrom = (table: string) => {
  const q = mockHouse.client.from(table);
  const gate = mockGate;
  if (table !== 'notifications' || !gate) return q;
  const answer = q.then.bind(q);
  (q as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => gate.then(() => answer(res, rej));
  return q;
};
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
    return { ...mockHouse.client, from: mockFrom, channel: () => mockChannel, removeChannel: async () => 'ok' };
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }), subscribe: () => () => {} } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));
const board = () => useNotificationStore.getState().notifications.map((n) => n.id);

let leave: unknown = null;
beforeEach(() => {
  mockGate = null;
  useNotificationStore.setState({ notifications: [], _unreadCount: 0, _fetching: false, _fetchingMore: false, loading: false });
});
afterEach(() => { if (typeof leave === 'function') (leave as () => void)(); leave = null; });

it('a notice heard while the board is read stays on top after the read answers, and in the bell', async () => {
  leave = useNotificationStore.getState().setupRealtime();
  let open!: () => void;
  mockGate = new Promise<void>((resolve) => { open = resolve; });
  const reading = useNotificationStore.getState().fetchNotifications();
  await settled();
  const heard = mockHandlers.get('postgres_changes:INSERT:notifications');
  expect(heard).toBeDefined();
  heard!({ new: notice(3) });
  expect(board()).toEqual([idOf(3)]);
  mockGate = null;
  open();
  await reading;
  expect(board()).toEqual([idOf(3), idOf(2), idOf(1), idOf(0)]);
  // The house counted one unread at its moment; the one heard since is the second.
  expect(useNotificationStore.getState()._unreadCount).toBe(2);
});

it('a notice the read already holds is neither drawn twice nor counted twice', async () => {
  leave = useNotificationStore.getState().setupRealtime();
  let open!: () => void;
  mockGate = new Promise<void>((resolve) => { open = resolve; });
  const reading = useNotificationStore.getState().fetchNotifications();
  await settled();
  // Heard live, and committed before the house read the board: the answer holds it.
  mockHandlers.get('postgres_changes:INSERT:notifications')!({ new: notice(2) });
  mockGate = null;
  open();
  await reading;
  expect(board()).toEqual([idOf(2), idOf(1), idOf(0)]);
  expect(useNotificationStore.getState()._unreadCount).toBe(1);
});

it('a notice heard before the read was asked is the read\'s to answer', async () => {
  leave = useNotificationStore.getState().setupRealtime();
  mockHandlers.get('postgres_changes:INSERT:notifications')!({ new: notice(9) });
  // A moment passes before the read is asked.
  await new Promise<void>((resolve) => setTimeout(resolve, 5));
  await useNotificationStore.getState().fetchNotifications();
  // The house's answer is the board: a notice heard earlier and not in it is gone from the house.
  expect(board()).toEqual([idOf(2), idOf(1), idOf(0)]);
});
