/**
 * aSearchAtTheDoorIsNotMixedWithTheNextPage.test.tsx — review round 12.
 *
 * At the Door, a member with a full page of requests typed a name and, while the door read it,
 * scrolled to the list's foot. The next page was asked of the old list: it superseded the
 * search's read, whose answer was dropped, and laid the search's rows under the thirty unsearched
 * ones, the door "reading" until the words changed again. Now a next page is asked only of the
 * list shown for the words in the box, never while its top is being read again.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { FollowRequest, FollowRequestPage } from '@/src/services/FollowRequestService';

/** Each read of the door, held until the test answers it. */
const mockReads: { args: { cursor?: string | null; search?: string }; answer: (page: FollowRequestPage) => void }[] = [];
jest.mock('@/src/services/FollowRequestService', () => ({
  FollowRequestService: {
    fetchPage: (args: { cursor?: string | null; search?: string }) =>
      new Promise((resolve) => { mockReads.push({ args, answer: resolve }); }),
    count: async () => 31,
    accept: jest.fn(), decline: jest.fn(), declineAll: jest.fn(),
  },
}));
const mockAuth = { user: { id: '11111111-1111-4111-8111-111111111111', username: 'kane' } };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockAuth) : mockAuth);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockAuth;
  (useAuthStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), selection: jest.fn(), success: jest.fn(), navigate: jest.fn(), mutate: jest.fn() },
}));

// eslint-disable-next-line import/first
import { useFollowRequests } from '../useFollowRequests';

const asking = (name: string, n: number): FollowRequest =>
  ({ requesterId: `${name}-${n}`, username: `${name}${n}`, avatarUrl: null, createdAt: `2026-11-16T10:${String(59 - n).padStart(2, '0')}:00Z` });
const UNSEARCHED: FollowRequestPage = { items: Array.from({ length: 30 }, (_, i) => asking('guest', i + 1)), nextCursor: 'guest-30-cursor' };
const ANNS: FollowRequestPage = { items: [asking('ann', 1), asking('ann', 2)], nextCursor: null };

/** The oldest read still waiting, answered. */
async function answerNext(page: FollowRequestPage) {
  const read = mockReads.shift();
  expect(read).toBeDefined();
  await act(async () => { read!.answer(page); });
  return read!.args;
}

beforeEach(() => { mockReads.length = 0; jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

/** The door opened on a full page of thirty, more behind it. */
async function openDoor() {
  const door = await renderHook(() => useFollowRequests(true));
  await act(async () => { jest.advanceTimersByTime(0); });
  await answerNext(UNSEARCHED);
  expect(door.result.current.items).toHaveLength(30);
  expect(door.result.current.hasMore).toBe(true);
  return door;
}

it('a foot reached while a search is read asks nothing, and the search\'s answer is what the door shows', async () => {
  const { result } = await openDoor();
  await act(async () => { result.current.setSearch('ann'); });
  await act(async () => { jest.advanceTimersByTime(280); });
  // The search's read is out; the member reaches the old list's foot.
  expect(mockReads).toHaveLength(1);
  await act(async () => { result.current.loadMore(); });
  expect(mockReads).toHaveLength(1);

  const asked = await answerNext(ANNS);
  expect(asked).toMatchObject({ search: 'ann', cursor: null });
  // Anything else asked meanwhile is answered too, as the house would.
  while (mockReads.length) await answerNext({ items: [asking('ann', 3)], nextCursor: null });
  expect(result.current.items.map((r) => r.username)).toEqual(['ann1', 'ann2']);
  expect(result.current.loading).toBe(false);
});

it('a foot reached before the search is read asks nothing of the old list', async () => {
  const { result } = await openDoor();
  await act(async () => { result.current.setSearch('ann'); });
  // Inside the wait after the last key: no read of the words has begun.
  await act(async () => { result.current.loadMore(); });
  expect(mockReads).toHaveLength(0);
  await act(async () => { jest.advanceTimersByTime(280); });
  await answerNext(ANNS);
  expect(result.current.items.map((r) => r.username)).toEqual(['ann1', 'ann2']);
});

it('the list shown for the words in the box still reads on, from its own last row', async () => {
  const { result } = await openDoor();
  await act(async () => { result.current.loadMore(); });
  const asked = await answerNext({ items: [asking('guest', 31)], nextCursor: null });
  expect(asked).toMatchObject({ cursor: 'guest-30-cursor', search: '' });
  expect(result.current.items).toHaveLength(31);
});
