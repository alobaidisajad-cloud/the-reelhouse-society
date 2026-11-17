/**
 * aReadAllRefusedTakesBackWhatTheHouseHasNot.test.ts — the board holds what the house holds.
 *
 * READ ALL refused takes its marks back, and spared a notice the member opened meanwhile (review
 * round 10). It spared one whose own mark was still on its way, too: that mark failed as well, and
 * the notice stood read on the board, the bell one short, while the house held it unread. Now only a
 * mark the house took is spared; one on its way is taken back with the rest, and landing, marks its
 * notice read again.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';
const N1 = '00000201-0000-4000-8000-000000000201';
const N2 = '00000202-0000-4000-8000-000000000202';
/** How the house answers each mark, in turn: reached and taken, or unreached. */
let mockMarks: ('taken' | 'unreached')[] = [];
const mockHouse = supabaseFake({
  answer: {
    notifications: (ask: Ask) => {
      if (ask.op === 'select') return [];
      return mockMarks.shift() === 'taken' ? [] : { code: '', message: 'TypeError: Network request failed' };
    },
  },
});
const mockHeld = heldClient(mockHouse.client);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '77777777-7777-4777-8777-777777777777', username: 'me' } }) } }));
jest.mock('@/src/stores/resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('@/src/stores/blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const notice = (id: string, at: string): AppNotification => ({ id, user_id: ME, type: 'comment', message: 'x', read: false, created_at: at });
const board = () => useNotificationStore.getState();
const RESETS = (jest.requireMock('@/src/stores/resetAllStores') as { registerStoreReset: jest.Mock }).registerStoreReset.mock.calls
  .map(([handler]) => handler as (previous: string | null) => void);

beforeEach(() => {
  for (const forget of RESETS) forget(null);
  useNotificationStore.setState({
    notifications: [notice(N1, '2026-11-16T10:00:02Z'), notice(N2, '2026-11-16T10:00:01Z')],
    _unreadCount: 2, _hasMore: false, _cursor: null, loading: false,
  } as never);
});

/** READ ALL pressed, then N1 opened, both on their way; READ ALL is answered first. */
async function readAllThenOpen(marks: ('taken' | 'unreached')[]) {
  mockMarks = marks;
  const all = board().markAllRead();
  const opened = board().markRead(N1);
  await mockHeld.release('notifications');
  await all;
  await mockHeld.release('notifications');
  await opened;
}

it('READ ALL and a notice opened meanwhile, both unreached: both are unread again, the bell at 2', async () => {
  await readAllThenOpen(['unreached', 'unreached']);
  expect(board().notifications.map((n) => n.read)).toEqual([false, false]);
  expect(board()._unreadCount).toBe(2);
});

it('READ ALL unreached, the notice opened meanwhile taken: it alone is read, the bell at 1', async () => {
  await readAllThenOpen(['unreached', 'taken']);
  expect(board().notifications.map((n) => [n.id, n.read])).toEqual([[N1, true], [N2, false]]);
  expect(board()._unreadCount).toBe(1);
});
