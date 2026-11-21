/**
 * aNoticeUndoneIsSaid.test.ts — review round 10 (A4)
 * ─────────────────────────────────────────────────────────────────────────────
 * READ ALL, a notice's X and a group's X are shown at once and undone when the house does not
 * take them. They were undone in silence: the board flipped back as though nothing had been
 * pressed. And READ ALL's undoing marked unread again every notice it had marked, a notice the
 * member opened meanwhile (and the house took as read) among them. Now each undoing is said, and
 * READ ALL's leaves a notice read meanwhile read.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useNotificationStore, type AppNotification } from '../notificationStore';
import reelToast from '../../utils/reelToast';

const ME = '77777777-7777-4777-8777-777777777777';
const N1 = '00000101-0000-4000-8000-000000000101';
const N2 = '00000102-0000-4000-8000-000000000102';
const N3 = '00000103-0000-4000-8000-000000000103';

type Row = Record<string, unknown>;
/** How the house answers: every write refused, or only READ ALL's (the board's every unread notice). */
let mockRefuse: 'all' | 'read-all' | 'none' = 'all';
const REFUSED = { code: '42501', message: 'permission denied for table notifications' };
const readAll = (ask: Ask) => ask.op === 'update' && ask.filters.some(([op, col, val]) => op === 'eq' && col === 'is_read' && val === false);
const mockHouse = supabaseFake({
  answer: {
    notifications: (ask: Ask): Row[] | typeof REFUSED => {
      if (ask.op === 'select') return [];
      if (mockRefuse === 'all' || (mockRefuse === 'read-all' && readAll(ask))) return REFUSED;
      return [];
    },
  },
});
// Each answer worked out when asked, and held until the test lets it go.
const mockHeld = heldClient(mockHouse.client);
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: '77777777-7777-4777-8777-777777777777', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock };

const notice = (id: string, at: string): AppNotification => ({
  id, user_id: ME, type: 'comment', message: 'x', read: false, created_at: at,
});
const board = () => useNotificationStore.getState().notifications.map((n) => [n.id, n.read]);
const bell = () => useNotificationStore.getState()._unreadCount;

let clock = 1_000_000;
beforeEach(() => {
  clock += 1_000_000;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  jest.clearAllMocks();
  mockRefuse = 'all';
  useNotificationStore.setState({
    notifications: [notice(N1, '2026-11-16T10:00:03Z'), notice(N2, '2026-11-16T10:00:02Z'), notice(N3, '2026-11-16T10:00:01Z')],
    _unreadCount: 3, _hasMore: false, _cursor: null, loading: false, _fetching: false, _fetchingMore: false,
  } as never);
});
afterEach(() => { jest.restoreAllMocks(); });

it('READ ALL refused: the notices are unread again, and the member is told it did not take; one taken says nothing', async () => {
  mockRefuse = 'none';
  const landed = useNotificationStore.getState().markAllRead();
  await mockHeld.release('notifications');
  await landed;
  expect([board(), toast.error.mock.calls]).toEqual([[[N1, true], [N2, true], [N3, true]], []]);

  // The board unread again, as the house might hold it on the next read, and READ ALL refused.
  mockRefuse = 'all';
  useNotificationStore.setState({ notifications: [notice(N1, '2026-11-16T10:00:03Z'), notice(N2, '2026-11-16T10:00:02Z'), notice(N3, '2026-11-16T10:00:01Z')], _unreadCount: 3 } as never);
  const all = useNotificationStore.getState().markAllRead();
  expect(bell()).toBe(0);
  await mockHeld.release('notifications');
  await all;
  expect(board()).toEqual([[N1, false], [N2, false], [N3, false]]);
  expect(bell()).toBe(3);
  expect(toast.error.mock.calls).toEqual([['The notices could not be marked read. The house did not allow it.']]);
});

it("a notice's X refused: the notice comes back, and the member is told it was not dismissed; one taken says nothing", async () => {
  mockRefuse = 'none';
  const taken = useNotificationStore.getState().dismiss(N3);
  await mockHeld.release('notifications');
  await taken;
  expect(board()).toEqual([[N1, false], [N2, false]]);
  expect([toast.mock.calls, toast.error.mock.calls, toast.success.mock.calls]).toEqual([[], [], []]);

  mockRefuse = 'all';
  const gone = useNotificationStore.getState().dismiss(N2);
  expect(board()).toEqual([[N1, false]]);
  await mockHeld.release('notifications');
  await gone;
  expect(board()).toEqual([[N1, false], [N2, false]]);
  expect(toast.error.mock.calls).toEqual([['The notice could not be dismissed. The house did not allow it.']]);
});

it("a group's X refused: the group comes back, and the member is told they were not dismissed", async () => {
  const gone = useNotificationStore.getState().dismissGroup([N1, N2]);
  expect(board()).toEqual([[N3, false]]);
  await mockHeld.release('notifications');
  await gone;
  expect(board()).toEqual([[N1, false], [N2, false], [N3, false]]);
  expect(toast.error.mock.calls).toEqual([['The notices could not be dismissed. The house did not allow it.']]);
});

it('a notice opened while READ ALL was on its way stays read when READ ALL is refused; the rest are unread again', async () => {
  mockRefuse = 'read-all';
  const all = useNotificationStore.getState().markAllRead();
  const opened = useNotificationStore.getState().markRead(N2);
  await mockHeld.release('notifications', 1);      // the notice's own mark: taken
  await opened;
  await mockHeld.release('notifications');         // READ ALL: refused
  await all;

  expect(board()).toEqual([[N1, false], [N2, true], [N3, false]]);
  expect(bell()).toBe(2);
  expect(toast.error.mock.calls).toEqual([['The notices could not be marked read. The house did not allow it.']]);
});
