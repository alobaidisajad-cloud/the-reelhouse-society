/**
 * aSalonRequestAnsweredLeavesTheBell.test.ts — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A member asked to enter a host's private salon; the host ADMITted or DECLINEd them at the door.
 * The door's count fell to 0, but the bell still counted "@X is asking to enter …" unread, and the
 * board kept it, opening a door with no one at it. The house now takes the request's notice with its
 * answer (a_salon_request_takes_its_notice); the host's phone takes it off the bell and the board at
 * once, the request's own notice alone (one written before round 12 is of the house's kind,
 * 'system'), and a refused answer takes nothing.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';
import { useNotificationStore, type AppNotification } from '../notificationStore';

const HOST = '33333333-3333-4333-8333-333333333333';
const SALON = '11111111-1111-4111-8111-111111111111';
const OTHER_SALON = '12121212-1212-4121-8121-121212121212';
const ORSON = '22222222-2222-4222-8222-222222222222';
const AGNES = '44444444-4444-4444-8444-444444444444';

let mockHouse = supabaseFake({ rows: {} });
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'host' } }), subscribe: () => () => {} } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => ({ __esModule: true, get default() { return mockToast; } }));

const REFUSED = { code: '', message: 'TypeError: Network request failed' };
const notice = (id: string, type: string, from: string, salon: string | undefined, read = false): AppNotification => ({
  id, user_id: HOST, type, from_user_id: from, related_lounge_id: salon, message: 'is asking to enter The Back Row.',
  read, created_at: '2026-11-17T10:00:00Z',
});
const board = () => useNotificationStore.getState().notifications.map((n) => n.id);
const bell = () => useNotificationStore.getState()._unreadCount;

beforeEach(() => {
  mockToast.error.mockClear();
  // Orson's request (unread, round 12's kind) and an older one of his (unread, the house's kind, written
  // before); Agnes's request to the same salon (unread); Orson's request to another salon (unread);
  // Orson's follow (unread).
  useNotificationStore.setState({
    notifications: [
      notice('orson-asks', 'salon', ORSON, SALON),
      notice('orson-asked-before', 'system', ORSON, SALON),
      notice('agnes-asks', 'salon', AGNES, SALON),
      notice('orson-elsewhere', 'salon', ORSON, OTHER_SALON),
      notice('orson-follows', 'follow', ORSON, undefined),
    ],
    _unreadCount: 5,
  } as never);
});

it('the host admits a member at the door: that member’s request leaves the bell and the board, and nothing else', async () => {
  mockHouse = supabaseFake({ rows: {}, rpc: { approve_lounge_member: null } });
  await expect(useLoungeStore.getState().approveMember(SALON, ORSON)).resolves.toBe(true);
  expect(board()).toEqual(['agnes-asks', 'orson-elsewhere', 'orson-follows']);
  expect(bell()).toBe(3);
});

it('the host declines a member at the door: the same', async () => {
  mockHouse = supabaseFake({ rows: {}, rpc: { decline_lounge_member: null } });
  await expect(useLoungeStore.getState().declineMember(SALON, AGNES)).resolves.toBe(true);
  expect(board()).toEqual(['orson-asks', 'orson-asked-before', 'orson-elsewhere', 'orson-follows']);
  expect(bell()).toBe(4);
});

it('an answer the house did not take leaves the request standing, and says so', async () => {
  mockHouse = supabaseFake({ rows: {}, rpc: { approve_lounge_member: { error: REFUSED }, decline_lounge_member: { error: REFUSED } } });
  await expect(useLoungeStore.getState().approveMember(SALON, ORSON)).resolves.toBe(false);
  await expect(useLoungeStore.getState().declineMember(SALON, AGNES)).resolves.toBe(false);
  expect(board()).toHaveLength(5);
  expect(bell()).toBe(5);
  expect(mockToast.error.mock.calls.map(([w]) => w)).toEqual(['Could not admit this guest. Check your connection and try again.', 'Could not decline this request. Check your connection and try again.']);
});

it('forgetSalonRequestNotices takes only that member’s requests to that salon, of either kind, read or unread', () => {
  const store = useNotificationStore.getState();
  store.forgetSalonRequestNotices(OTHER_SALON, AGNES);
  expect(board()).toHaveLength(5);
  useNotificationStore.setState({
    notifications: [notice('read-request', 'salon', ORSON, SALON, true), notice('orson-follows', 'follow', ORSON, undefined)],
    _unreadCount: 1,
  } as never);
  useNotificationStore.getState().forgetSalonRequestNotices(SALON, ORSON);
  expect(board()).toEqual(['orson-follows']);
  expect(bell()).toBe(1);
});
