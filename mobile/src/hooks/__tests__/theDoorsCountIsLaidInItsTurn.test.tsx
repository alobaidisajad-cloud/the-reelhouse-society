/**
 * theDoorsCountIsLaidInItsTurn.test.tsx — the count at the door lays no older answer.
 *
 * The banner's count of follow requests is read as the door opens, after a block, and after a
 * failed clearing. A count asked earlier that landed last was laid over a newer one, and a count
 * read while an admission was out put the admitted member back on the badge
 * (refreshFollowRequestCount, its turns).
 */
import { act, renderHook } from '@testing-library/react-native';
import { FollowRequestService, type FollowRequest } from '@/src/services/FollowRequestService';
import { refreshFollowRequestCount, useFollowRequests } from '@/src/hooks/useFollowRequests';
import { useSocialStore } from '@/src/stores/followStore';
import { useAuthStore } from '@/src/stores/auth';

/** A count held open until the test answers it. */
function heldCount() {
  let answer: (n: number | null) => void = () => {};
  const asked = new Promise<number | null>((r) => { answer = r; });
  return { asked, answer };
}

const before = useAuthStore.getState();
beforeEach(() => {
  useAuthStore.setState({ user: { id: 'me', username: 'kane' } as never });
  useSocialStore.getState().setPendingRequestCount(0);
});
afterEach(() => {
  jest.restoreAllMocks();
  useAuthStore.setState(before);
});

it('a count asked earlier that lands last is laid over no newer one', async () => {
  const older = heldCount();
  jest.spyOn(FollowRequestService, 'count').mockImplementationOnce(() => older.asked).mockResolvedValueOnce(2);
  const first = refreshFollowRequestCount();
  await refreshFollowRequestCount();
  expect(useSocialStore.getState().pendingRequestCount).toBe(2);

  older.answer(5);
  await first;
  expect(useSocialStore.getState().pendingRequestCount).toBe(2);
});

it('a count read while an admission was out is asked again, and the admitted member stays off the badge', async () => {
  useSocialStore.getState().setPendingRequestCount(3);
  const older = heldCount();
  const count = jest.spyOn(FollowRequestService, 'count').mockImplementationOnce(() => older.asked).mockResolvedValueOnce(2);
  jest.spyOn(FollowRequestService, 'accept').mockResolvedValue('admitted');
  const { result, unmount } = await renderHook(() => useFollowRequests(false));

  const read = refreshFollowRequestCount();
  const orson = { requesterId: 'u1', username: 'orson', createdAt: '2026-10-01T00:00:00Z' } as FollowRequest;
  await act(async () => { await result.current.accept(orson); });
  expect(useSocialStore.getState().pendingRequestCount).toBe(2);

  // Counted before the admission: three at the door.
  older.answer(3);
  await act(async () => { await read; });
  expect({ asked: count.mock.calls.length, shown: useSocialStore.getState().pendingRequestCount }).toEqual({ asked: 2, shown: 2 });
  await act(async () => { await unmount(); });
});
