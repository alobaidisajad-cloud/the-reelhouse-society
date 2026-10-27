/**
 * A page is current on return (P4.7).
 *
 * Coming back to the app read nothing again: React Query never heard the return, and the stores'
 * screens had no way to. A film page and a member's file left open across an afternoon still
 * showed the morning. Each is read again on return once older than a read stays fresh, silently,
 * and a short glance away reads nothing.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { useFilmDetail } from '../useFilmDetail';
import { useProfileData } from '../useProfileData';

const mockDetail = jest.fn();
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: { detail: (...a: unknown[]) => mockDetail(...a), peekDetail: () => undefined },
  obscurityScore: () => 0,
}));
const mockReviews = jest.fn();
jest.mock('@/src/services/FilmService', () => ({
  FilmService: {
    getFilmReviews: (...a: unknown[]) => mockReviews(...a),
    getFilmVerdict: async () => null,
  },
}));
const mockService: Record<string, jest.Mock> & { fetchProfile: jest.Mock } = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 3, ledger: 0, watchlist: 9, vault: 0, lists: 0, followers: 1, following: 1 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

/** One client for the life of a render, as the app's root gives every screen. */
function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return React.createElement(QueryClientProvider, { client }, children);
}

const opened = Date.now();
const awayFor = (ms: number) => jest.spyOn(Date, 'now').mockReturnValue(opened + ms);
const backInTheApp = () => act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });

afterEach(() => { jest.restoreAllMocks(); focusManager.setFocused(undefined); });

describe('a film page', () => {
  beforeEach(() => {
    mockDetail.mockResolvedValue({ id: 603, title: 'The Matrix' });
    mockReviews.mockReset();
    mockReviews.mockResolvedValueOnce({ items: [] }).mockResolvedValue({ items: [{ id: 'r1' }] });
  });

  it('is read again on return once older than it stays fresh, and draws what changed', async () => {
    const { result } = await renderHook(() => useFilmDetail(603, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.reviews).toEqual([]));
    awayFor(31 * 60_000);
    await backInTheApp();
    await waitFor(() => expect(result.current.data?.reviews).toEqual([{ id: 'r1' }]));
  });

  it('a glance away reads nothing', async () => {
    const { result } = await renderHook(() => useFilmDetail(603, true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.reviews).toEqual([]));
    awayFor(60_000);
    await backInTheApp();
    expect(mockReviews).toHaveBeenCalledTimes(1);
  });
});

describe('a member’s file', () => {
  const MEMBER = { id: 'u9', username: 'vesper', display_name: 'Vesper', tier: 'archivist', role: 'archivist', is_founding: false, is_social_private: false };
  beforeEach(() => {
    mockService.fetchProfile.mockReset();
    mockService.fetchProfile.mockResolvedValueOnce(MEMBER).mockResolvedValue({ ...MEMBER, display_name: 'Vesper Lynd' });
  });
  const openFile = async () => {
    const r = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
    await waitFor(() => expect(r.result.current.targetUser?.display_name).toBe('Vesper'));
    return r.result;
  };

  it('is read again on return once older than a read stays fresh, silently', async () => {
    const result = await openFile();
    awayFor(6 * 60_000);
    await backInTheApp();
    await waitFor(() => expect(result.current.targetUser?.display_name).toBe('Vesper Lynd'));
    expect(result.current.loading).toBe(false);
  });

  it('a glance away reads nothing', async () => {
    await openFile();
    awayFor(60_000);
    await backInTheApp();
    expect(mockService.fetchProfile).toHaveBeenCalledTimes(1);
  });
});
