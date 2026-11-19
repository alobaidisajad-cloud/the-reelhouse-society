/**
 * aClosedRecordIsSaidClosed.test.tsx — a member's record the house will not open to the reader is
 * said to be closed (review round 14).
 *
 * The house now closes a member's file to a member across a block, as it closes a private one to a
 * stranger: the figures drawn from the record (the honours and the passport, the fingerprint and
 * the insights, the Cinema DNA reading) answer a refusal, `{ error: 'forbidden' }` or no taste at
 * all, never a failure. The phone cannot know why, and drew each refusal as a failure: "The passport
 * could not be reached." with a TRY AGAIN the house would refuse the same way for ever, and the
 * fingerprint and the insights stood at RETRIEVING for as long as the member stayed. Now each says
 * the room is not open to the reader, and offers nothing to ask again.
 */
import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { useProfileData } from '@/src/hooks/useProfileData';
import { Achievements } from '../Achievements';
import { NoirPassport } from '../NoirPassport';
import { CinemaDNACard } from '../CinemaDNACard';
import { TasteDNA } from '../TasteDNA';
import { CinematicInsights } from '../CinematicInsights';

const mockService: Record<string, jest.Mock> = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(async () => ({ logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0, followers: 0, following: 0 })),
  fetchAnalyticsSummary: jest.fn(async () => null),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
  fetchProfileAnalytics: jest.fn(),
  fetchTasteProfile: jest.fn(),
  fetchHighestRated: jest.fn(async () => []),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

const MEMBER = { id: 'u9', username: 'vesper', tier: 'auteur', role: 'auteur', is_founding: false, is_social_private: false };
const REFUSED = { error: 'forbidden' };

describe('the file, as read', () => {
  beforeEach(() => {
    mockService.fetchProfile!.mockResolvedValue(MEMBER);
    mockService.fetchProfileAnalytics!.mockReset().mockResolvedValue(REFUSED);
    mockService.fetchTasteProfile!.mockReset().mockResolvedValue(null);
  });

  it('a record the house refused is kept as refused: never a failure, never a read still out', async () => {
    const { result } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
    await waitFor(() => expect(result.current.targetUser?.id).toBe('u9'));
    await act(async () => { await result.current.loadTabData('projector'); });
    expect(result.current.tasteRefused).toBe(true);
    expect(result.current.serverAnalytics).toEqual(REFUSED);
    expect(result.current.tabFailed.projector).toBeFalsy();
  });

  it('a taste the house answered is not refused', async () => {
    mockService.fetchTasteProfile!.mockResolvedValue({ films_total: 0, films_known: 0, genres: [], actors: [], directors: [] });
    const { result } = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
    await waitFor(() => expect(result.current.targetUser?.id).toBe('u9'));
    await act(async () => { await result.current.loadTabData('projector'); });
    expect(result.current.tasteRefused).toBe(false);
  });
});

describe('each room of a refused record says it is not open, with nothing to ask again', () => {
  const closed = (r: ReturnType<typeof render>, words: string) => {
    expect(r.getByText(words)).toBeTruthy();
    expect(r.queryByText(/could not be reached/)).toBeNull();
    expect(r.queryByText(/TRY AGAIN/i)).toBeNull();
    expect(r.queryByText(/RETRIEVING/)).toBeNull();
  };

  it('the honours', () => {
    closed(render(<Achievements analytics={REFUSED} onRetry={jest.fn()} />), 'The house keeps the honours closed to you.');
  });

  it('the passport', () => {
    closed(render(<NoirPassport analytics={REFUSED} onRetry={jest.fn()} />), 'The house keeps the passport closed to you.');
  });

  it('the Cinema DNA reading', () => {
    closed(render(<CinemaDNACard user={{ username: 'vesper' }} analytics={REFUSED} onRetry={jest.fn()} onClose={jest.fn()} />), 'The house keeps the reading closed to you.');
  });

  it('the fingerprint', () => {
    closed(render(<TasteDNA isSelf={false} taste={null} refused username="vesper" onRetry={jest.fn()} />), 'The house keeps the fingerprint closed to you.');
  });

  it('the insights', () => {
    closed(render(<CinematicInsights isSelf={false} taste={null} refused onRetry={jest.fn()} />), 'The house keeps the insights closed to you.');
  });

  it('a record not yet read is still said as being read, and one that failed as unreached', () => {
    expect(render(<NoirPassport analytics={null} />).getByLabelText('Retrieving the passport')).toBeTruthy();
    expect(render(<TasteDNA isSelf={false} taste={null} username="vesper" />).getByLabelText('Retrieving the fingerprint')).toBeTruthy();
    expect(render(<CinematicInsights isSelf={false} taste={null} failed onRetry={jest.fn()} />).getByText('The insights could not be reached.')).toBeTruthy();
  });
});
