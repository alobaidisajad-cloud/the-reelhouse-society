/**
 * aMemberFileIsReadInOneTrip.test.tsx — a member's file, read in one round trip when its member is known (P4.53).
 *
 * The file read the member's row by name, and only then (needing its id) the counts, the summary and
 * the first logs: two round trips in a row on every opening, your own file's included. The own file
 * knows its member, and nearly every link to a file starts from a row that holds the member's id;
 * with it, the four reads go out together, each under its own rule. Without one (a shared address),
 * the row is read first, as before. A name now held by another member is read again by its own id.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';
import { memberPath } from '@/src/utils/memberPath';
import { noticeRoute } from '@/src/utils/noticeRoute';

/** A read that answers when told to. */
function held<T>() {
  const answers: ((v: T) => void)[] = [];
  const fn = jest.fn(() => new Promise<T>((resolve) => { answers.push(resolve); }));
  return { fn, answer: (v: T) => answers.shift()?.(v) };
}

const COUNTS = { logs: 12, ledger: 4, watchlist: 9, vault: 5, lists: 2, followers: 7, following: 3 };
const LOGS = { items: [{ id: 'l1', film_id: 1, film_title: 'Stalker' }], nextCursor: null };
const mockService: Record<string, jest.Mock> = {};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const member = (over: Record<string, unknown> = {}) =>
  ({ id: ID, username: 'vesper', tier: 'archivist', role: 'archivist', is_founding: false, is_social_private: false, ...over });

let profile: ReturnType<typeof held<unknown>>;
beforeEach(() => {
  profile = held<unknown>();
  mockService.fetchProfile = profile.fn;
  mockService.fetchCounts = jest.fn(async () => ({ ...COUNTS, logs: 99 }));
  mockService.fetchCountsOf = jest.fn(async () => COUNTS);
  mockService.fetchAnalyticsSummary = jest.fn(async () => null);
  mockService.fetchOtherUserLogs = jest.fn(async () => LOGS);
});

const open = (knownId?: string) =>
  renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null, knownId }));

it("asks the counts, the summary and the first logs with the member's row when the link holds their id", async () => {
  const { result } = await open(ID);
  // The row is still out, and the rest is already asked.
  expect(mockService.fetchCountsOf).toHaveBeenCalledWith(ID, false, expect.any(AbortSignal));
  expect(mockService.fetchAnalyticsSummary).toHaveBeenCalledWith({ id: ID }, expect.any(AbortSignal));
  expect(mockService.fetchOtherUserLogs).toHaveBeenCalledWith(ID, 50, undefined, expect.any(AbortSignal), undefined);
  await act(async () => { profile.answer(member()); });
  await waitFor(() => expect(result.current.targetUser?.id).toBe(ID));
  expect(result.current.counts.logs).toBe(12);
  expect(result.current.mainLogs.map((l: { id: string }) => l.id)).toEqual(['l1']);
  expect(mockService.fetchCounts).not.toHaveBeenCalled();
});

it("reads the member's row first when the link holds no id, as a shared address does", async () => {
  const { result } = await open();
  expect(mockService.fetchCountsOf).not.toHaveBeenCalled();
  expect(mockService.fetchOtherUserLogs).not.toHaveBeenCalled();
  await act(async () => { profile.answer(member()); });
  await waitFor(() => expect(result.current.targetUser?.id).toBe(ID));
  expect(mockService.fetchCounts).toHaveBeenCalledTimes(1);
  expect(result.current.counts.logs).toBe(99);
});

it('reads again by its own id a name now held by another member, and keeps nothing of the first', async () => {
  const { result } = await open(OTHER_ID);
  await act(async () => { profile.answer(member()); });
  await waitFor(() => expect(result.current.targetUser?.id).toBe(ID));
  expect(mockService.fetchCounts).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), false, expect.any(AbortSignal));
  expect(mockService.fetchOtherUserLogs).toHaveBeenLastCalledWith(ID, 50, undefined, expect.any(AbortSignal), undefined);
  expect(result.current.counts.logs).toBe(99);
});

it("shows the shelf's count only for a rank that keeps one, once the rank is read", async () => {
  const { result } = await open(ID);
  await act(async () => { profile.answer(member({ tier: 'cinephile', role: 'cinephile' })); });
  await waitFor(() => expect(result.current.targetUser?.id).toBe(ID));
  expect(result.current.counts.vault).toBe(0);
  expect(result.current.counts.logs).toBe(12);
});

it("carries the member's id in a link that holds it, a notice from them among them", () => {
  expect(memberPath('vesper', ID)).toBe(`/user/vesper?id=${ID}`);
  expect(memberPath('vesper', null)).toBe('/user/vesper');
  expect(noticeRoute({ group_key: undefined, film_id: undefined, from_username: 'vesper', from_user_id: ID })).toBe(`/user/vesper?id=${ID}`);
  expect(noticeRoute({ group_key: undefined, film_id: undefined, from_username: 'vesper' })).toBe('/user/vesper');
});

it("draws a sealed file's counts and none of its logs, though they were asked with its row", async () => {
  const { result } = await open(ID);
  await act(async () => { profile.answer(member({ is_social_private: true })); });
  await waitFor(() => expect(result.current.counts.logs).toBe(12));
  expect(result.current.targetUser?.is_social_private).toBe(true);
  expect(result.current.mainLogs).toEqual([]);
});
