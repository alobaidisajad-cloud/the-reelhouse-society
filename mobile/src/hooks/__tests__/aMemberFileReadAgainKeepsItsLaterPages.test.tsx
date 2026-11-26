/**
 * aMemberFileReadAgainKeepsItsLaterPages.test.tsx — another member's file, come back to.
 *
 * Another member's logs are read page by page. Their file come back to after its read went stale is
 * read again; the first page alone was put in place of the logs, and every page the reader had read
 * past it left. Read again, the logs come back as far as they were read, as the house holds them.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { focusManager } from '@tanstack/react-query';
import { useProfileData } from '../useProfileData';

/** The member's logs: 130, newest first. */
const LOGS = Array.from({ length: 130 }, (_, i) => ({ id: `log-${i + 1}`, filmId: 1000 + i, filmTitle: `Film ${i + 1}` }));
let mockLogs = LOGS;
/** The house: logs past the cursor (an index), at most `limit`, with the cursor past them while more follow. */
const mockFetchOtherUserLogs = jest.fn(async (_id: string, limit: number, cursor?: string) => {
  const from = cursor === undefined ? 0 : Number(cursor);
  return { items: mockLogs.slice(from, from + limit), nextCursor: from + limit < mockLogs.length ? String(from + limit) : null };
});
const MEMBER = { id: 'u9', username: 'vesper', display_name: 'Vesper', tier: 'archivist', role: 'archivist', is_founding: false, is_social_private: false };
const mockService: Record<string, jest.Mock> = {
  fetchProfile: jest.fn(async () => MEMBER),
  fetchCounts: jest.fn(async () => ({ logs: 130, ledger: 0, watchlist: 0, vault: 0, lists: 0, followers: 1, following: 1 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: mockFetchOtherUserLogs,
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const opened = Date.now();
const awayFor = (ms: number) => jest.spyOn(Date, 'now').mockReturnValue(opened + ms);
const backInTheApp = () => act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });

afterEach(() => { jest.restoreAllMocks(); focusManager.setFocused(undefined); mockLogs = LOGS; });

it('come back to after its read went stale, the file keeps the logs read past its first page', async () => {
  const { result } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(result.current.mainLogs).toHaveLength(50));
  for (const held of [100, 130]) {
    await act(async () => { await result.current.loadMoreLogs(); });
    await waitFor(() => expect(result.current.mainLogs).toHaveLength(held));
  }

  // The second was deleted meanwhile.
  mockLogs = LOGS.filter((l) => l.id !== 'log-2');
  mockFetchOtherUserLogs.mockClear();
  awayFor(6 * 60_000);
  await backInTheApp();
  await waitFor(() => expect(mockFetchOtherUserLogs).toHaveBeenCalled());
  await waitFor(() => expect(result.current.mainLogs.map((l) => l.id)).not.toContain('log-2'));
  expect(result.current.mainLogs).toHaveLength(129);
  expect(result.current.mainLogs[128]?.id).toBe('log-130');
  expect(result.current.archiveLogs).toHaveLength(129);
  expect(result.current.ledgerLogs).toHaveLength(129);
  expect(mockFetchOtherUserLogs.mock.calls.map(([, limit, cursor]) => [limit, cursor])).toEqual([[130, undefined]]);
});
