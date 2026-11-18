/**
 * theProjectorDrawsOnTheHousesThreeReads.test.tsx — an Auteur's Projector and Passport draw once
 * the house's three summaries answer (round 13).
 *
 * The room waited on a fourth read beside them: the member's whole history, walked in serial pages
 * of a thousand (ten for a long record, some 490 ms of database time and 3 MB), whose rows fed only
 * a fallback for the run that the summary leaves unused. Here every read but the three summaries
 * never answers once the file is open: the room still draws.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '../useProfileData';

/** Once the file is open, a read this test did not answer never answers. */
const mockHold = { reads: false };
const mockService: Record<string, jest.Mock> = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 10_000, ledger: 0, watchlist: 0, vault: 0, lists: 0, followers: 1, following: 1 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
  fetchProfileAnalytics: jest.fn(async () => ({ total_films: 10_000 })),
  fetchTasteProfile: jest.fn(async () => ({ films_total: 10_000 })),
  fetchHighestRated: jest.fn(async () => [{ id: 'h1', filmId: 1, rating: 5 }]),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, {
    get: (_t, k: string) => mockService[k] ?? jest.fn(() => (mockHold.reads ? new Promise(() => {}) : Promise.resolve(null))),
  }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const AUTEUR = { id: 'u7', username: 'whale', tier: 'auteur', role: 'auteur', is_founding: false, is_social_private: false };

beforeEach(() => {
  mockHold.reads = false;
  mockService.fetchProfile!.mockResolvedValue(AUTEUR);
});

const drawsOnTheThreeReads = async (room: 'projector' | 'passport') => {
  const r = await renderHook(() => useProfileData({ username: 'whale', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(r.result.current.targetUser?.id).toBe('u7'));
  mockHold.reads = true;

  let read: Promise<void> | undefined;
  await act(async () => { read = r.result.current.loadTabData(room); });
  await act(async () => { await read; });

  expect(r.result.current.serverAnalytics).toEqual({ total_films: 10_000 });
  expect(r.result.current.taste).toEqual({ films_total: 10_000 });
  expect(r.result.current.highestRated).toEqual([{ id: 'h1', filmId: 1, rating: 5 }]);
  expect(r.result.current.tabFailed[room]).toBeFalsy();
  await act(async () => { await r.unmount(); });
};

it("an Auteur's projector draws once the house's three summaries answer", () => drawsOnTheThreeReads('projector'));

it("an Auteur's passport draws once the house's three summaries answer", () => drawsOnTheThreeReads('passport'));
