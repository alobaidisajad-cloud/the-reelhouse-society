/**
 * aMemberFileIsFoundByItsId.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * Another member's file, opened from a link that carries their id, is asked for by that id: a
 * rename since the link was drawn still opens the member it names. Your own file (no id is passed
 * for it) and a shared address are asked for by their handle. When the route then takes the
 * renamed member's new handle, the file drawn stays and is read again behind it, never from nothing.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';

const mockService: Record<string, jest.Mock> = {};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const ID = '11111111-1111-4111-8111-111111111111';
const COUNTS = { logs: 12, ledger: 4, watchlist: 9, vault: 5, lists: 2, followers: 7, following: 3 };
const bobby = { id: ID, username: 'bobby', tier: 'archivist', role: 'archivist', is_founding: false, is_social_private: false };

beforeEach(() => {
  mockService.fetchProfile = jest.fn(async () => bobby);
  mockService.fetchCounts = jest.fn(async () => COUNTS);
  mockService.fetchCountsOf = jest.fn(async () => COUNTS);
  mockService.fetchAnalyticsSummary = jest.fn(async () => null);
  mockService.fetchOtherUserLogs = jest.fn(async () => ({ items: [], nextCursor: null }));
});

it("asks for another member's file by the id the link carried", async () => {
  const { result } = await renderHook(() => useProfileData({ username: 'bob', isSelf: false, isFollowing: false, activeTab: null, knownId: ID }));
  await waitFor(() => expect(result.current.targetUser?.id).toBe(ID));
  expect(mockService.fetchProfile).toHaveBeenCalledWith('bob', false, expect.any(AbortSignal), ID);
});

it('asks for a shared address by its handle', async () => {
  const shared = await renderHook(() => useProfileData({ username: 'bobby', isSelf: false, isFollowing: false, activeTab: null }));
  await waitFor(() => expect(shared.result.current.targetUser?.id).toBe(ID));
  expect(mockService.fetchProfile).toHaveBeenLastCalledWith('bobby', false, expect.any(AbortSignal), undefined);
});

it('keeps the file drawn when the route takes the renamed handle, and reads it again behind it', async () => {
  const { result, rerender } = await renderHook(
    ({ username }: { username: string }) => useProfileData({ username, isSelf: false, isFollowing: false, activeTab: null, knownId: ID }),
    { initialProps: { username: 'bob' } },
  );
  await waitFor(() => expect(result.current.targetUser?.id).toBe(ID));
  expect(mockService.fetchProfile).toHaveBeenCalledTimes(1);

  await act(async () => { await rerender({ username: 'bobby' }); });
  // Never a frame from nothing: the member stays drawn, and no spinner stands over them.
  expect(result.current.targetUser?.id).toBe(ID);
  expect(result.current.loading).toBe(false);
  await waitFor(() => expect(mockService.fetchProfile).toHaveBeenCalledTimes(2));
  expect(mockService.fetchProfile).toHaveBeenLastCalledWith('bobby', false, expect.any(AbortSignal), ID);
});
