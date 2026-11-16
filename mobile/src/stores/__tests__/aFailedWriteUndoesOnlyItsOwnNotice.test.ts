/**
 * aFailedWriteUndoesOnlyItsOwnNotice.test.ts — review round 5
 * ─────────────────────────────────────────────────────────────────────────────
 * Each write on the notices board rolled back by writing the WHOLE list as it stood before its own
 * change. Two notices dismissed offline, both writes refused: the second rollback wrote back a
 * list without the first, so the first stayed off the board and the badge was short, though the
 * house still held it unread. Each failure now undoes its own notices, and nothing else.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore } from '../notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';
const N1 = '00000001-0000-4000-8000-000000000001';
const N2 = '00000002-0000-4000-8000-000000000002';
const N3 = '00000003-0000-4000-8000-000000000003';

// Every write to the board is refused, as a phone with no connection finds it.
let mockHouse = supabaseFake();
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: '77777777-7777-4777-8777-777777777777', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
// The notices hear the block store (a member hidden leaves the board): heard here, never changed.
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));

const notice = (id: string, at: string, read = false) => ({
  id, type: 'comment', read, created_at: at, user_id: ME, from_user_id: null, message: 'x',
});
const A = notice(N1, '2026-11-16T10:00:03Z');
const B = notice(N2, '2026-11-16T10:00:02Z');
const C = notice(N3, '2026-11-16T10:00:01Z');
const ids = () => useNotificationStore.getState().notifications.map((n) => [n.id, n.read]);

beforeEach(() => {
  mockHouse = supabaseFake({ rows: { notifications: [] }, fail: { notifications: { code: '', message: 'TypeError: Network request failed' } } });
  useNotificationStore.setState({
    notifications: [A, B, C], _unreadCount: 3, _hasMore: false, _cursor: null, loading: false,
  } as never);
});

it('two notices dismissed, both refused: both come back, in their places, and both are counted', async () => {
  const first = useNotificationStore.getState().dismiss(N1);
  const second = useNotificationStore.getState().dismiss(N2);
  expect(ids()).toEqual([[N3, false]]);
  await Promise.all([first, second]);
  expect(ids()).toEqual([[N1, false], [N2, false], [N3, false]]);
  expect(useNotificationStore.getState()._unreadCount).toBe(3);
});

it('one notice read and another dismissed, both refused: each undone alone', async () => {
  const read = useNotificationStore.getState().markRead(N1);
  const gone = useNotificationStore.getState().dismiss(N3);
  await Promise.all([read, gone]);
  expect(ids()).toEqual([[N1, false], [N2, false], [N3, false]]);
  expect(useNotificationStore.getState()._unreadCount).toBe(3);
});

it('a refused group leaves another notice read meanwhile as it is', async () => {
  // C is read by a write that landed; the group's refusal must not bring its unread back.
  useNotificationStore.setState({ notifications: [A, B, { ...C, read: true }], _unreadCount: 2 } as never);
  const group = useNotificationStore.getState().markGroupRead([N1, N2]);
  expect(useNotificationStore.getState()._unreadCount).toBe(0);
  await group;
  expect(ids()).toEqual([[N1, false], [N2, false], [N3, true]]);
  expect(useNotificationStore.getState()._unreadCount).toBe(2);
});
