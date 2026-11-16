/**
 * anAnsweredRequestLeavesTheBell.test.tsx — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * A follow request answered at the door (ADMIT, DECLINE, DECLINE ALL) took its notice off the
 * house, but the board kept it: the bell still counted it unread and READ ALL stood lit over a
 * board with nothing to read until it was read again. An answer the house took now takes its
 * notice off the board and the count; an answer that failed takes nothing.
 */
import { renderHook, act } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useFollowRequests } from '../useFollowRequests';
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';
import type { FollowRequest } from '@/src/services/FollowRequestService';

const ME = '11111111-1111-4111-8111-111111111111';
const ORSON = '22222222-2222-4222-8222-222222222222';
const AGNES = '33333333-3333-4333-8333-333333333333';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: '11111111-1111-4111-8111-111111111111', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  (useAuthStore as any).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), selection: jest.fn(), success: jest.fn(), navigate: jest.fn(), mutate: jest.fn() },
}));

const refused = { error: { code: '', message: 'TypeError: Network request failed' } };
const house = (answers: 'taken' | 'refused') => supabaseFake({
  // The door's count, asked again after a refused DECLINE ALL: refused too, as the wire is down.
  rows: { interactions: [] },
  fail: answers === 'taken' ? {} : { interactions: refused.error },
  rpc: answers === 'taken'
    ? { accept_follow_request: null, decline_follow_request: null, decline_all_follow_requests: 2 }
    : { accept_follow_request: refused, decline_follow_request: refused, decline_all_follow_requests: refused },
});

const notice = (id: string, type: string, from: string, read = false): AppNotification => ({
  id, user_id: ME, type, from_user_id: from, message: 'x', read, created_at: '2026-11-16T10:00:00Z',
});
const board = () => useNotificationStore.getState().notifications.map((n) => n.id);
const unread = () => useNotificationStore.getState()._unreadCount;
const request = (requesterId: string, username: string): FollowRequest =>
  ({ requesterId, username, avatarUrl: null, createdAt: '2026-11-16T10:00:00Z' });

beforeEach(() => {
  // Orson's request (unread), Agnes's request (read), and Orson's certification (unread).
  useNotificationStore.setState({
    notifications: [
      notice('n-orson-req', 'follow_request', ORSON),
      notice('n-agnes-req', 'follow_request', AGNES, true),
      notice('n-orson-cert', 'endorse', ORSON),
    ],
    _unreadCount: 2,
  } as never);
});

it('admitting a member takes their request off the board and the bell, and leaves their other notices', async () => {
  mockHouse = house('taken');
  const { result } = await renderHook(() => useFollowRequests(false));
  await act(async () => { await result.current.accept(request(ORSON, 'orson')); });
  expect(board()).toEqual(['n-agnes-req', 'n-orson-cert']);
  expect(unread()).toBe(1);
});

it('declining a member takes their request off the board, and the bell counts only what was unread', async () => {
  mockHouse = house('taken');
  const { result } = await renderHook(() => useFollowRequests(false));
  await act(async () => { await result.current.decline(request(AGNES, 'agnes')); });
  expect(board()).toEqual(['n-orson-req', 'n-orson-cert']);
  expect(unread()).toBe(2);
});

it('declining all takes every request off the board and the bell', async () => {
  mockHouse = house('taken');
  const { result } = await renderHook(() => useFollowRequests(false));
  await act(async () => { await result.current.declineAll(); });
  expect(board()).toEqual(['n-orson-cert']);
  expect(unread()).toBe(1);
});

it('an answer that failed takes nothing off the board or the bell; the same answer taken then does', async () => {
  mockHouse = house('refused');
  const { result } = await renderHook(() => useFollowRequests(false));
  await act(async () => { await result.current.accept(request(ORSON, 'orson')); });
  await act(async () => { await result.current.decline(request(AGNES, 'agnes')); });
  await act(async () => { await result.current.declineAll(); });
  expect(board()).toEqual(['n-orson-req', 'n-agnes-req', 'n-orson-cert']);
  expect(unread()).toBe(2);
  // The wire back: the admit asked again is taken, and its notice goes.
  mockHouse = house('taken');
  await act(async () => { await result.current.accept(request(ORSON, 'orson')); });
  expect(board()).toEqual(['n-agnes-req', 'n-orson-cert']);
  expect(unread()).toBe(1);
});
