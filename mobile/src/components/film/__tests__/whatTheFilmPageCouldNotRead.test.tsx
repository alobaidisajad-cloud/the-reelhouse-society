/**
 * whatTheFilmPageCouldNotRead.test.tsx — a film whose critiques or verdict
 * could not be read.
 *
 * The critiques' failure was carried in the query's result and dropped by the
 * page: a film with critiques, opened on a bad signal, said "No transmissions
 * yet. Log this film to be the first voice". The verdict's failure was answered
 * as silence: "THE HOUSE HAS NOT SPOKEN" of a film the house had rated. Now the
 * failed critiques reach the section, and an unread verdict is null (unknown).
 */
import React from 'react';
import { render, renderHook } from '@testing-library/react-native';

import FilmDetailScreen from '@/app/film/[id]';
import { useFilmDetail } from '@/src/hooks/useFilmDetail';
import { useFilmDetailContext } from '@/src/providers/FilmDetailProvider';

let mockOptions: { queryFn: () => Promise<unknown>; placeholderData: () => unknown } | null = null;
let mockResult: Record<string, unknown> = {};
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: (o: never) => { mockOptions = o; return mockResult; },
}));

const mockDetail = jest.fn();
const mockPeek = jest.fn();
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: { detail: (...a: unknown[]) => mockDetail(...a), peekDetail: (...a: unknown[]) => mockPeek(...a) },
  obscurityScore: () => 0,
}));
const mockReviews = jest.fn();
const mockVerdict = jest.fn();
jest.mock('@/src/services/FilmService', () => ({
  FilmService: {
    getFilmReviews: (...a: unknown[]) => mockReviews(...a),
    getFilmVerdict: (...a: unknown[]) => mockVerdict(...a),
  },
}));

let mockSeen: ReturnType<typeof useFilmDetailContext> | null = null;
jest.mock('@/src/components/film/FilmDetailLayout', () => ({
  FilmDetailLayout: () => { mockSeen = jest.requireActual('@/src/providers/FilmDetailProvider').useFilmDetailContext(); return null; },
}));
jest.mock('@/src/components/film/ShareCardModal', () => ({ ShareCardModal: () => null }));
jest.mock('@/src/components/film/TrailerModal', () => ({ TrailerModal: () => null }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '603' }), useFocusEffect: () => {}, router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

const FILM = { id: 603, title: 'The Matrix' };
const VERDICT = { avg_rating: 4.2, rating_count: 9, log_count: 12 };

beforeEach(() => {
  mockDetail.mockReset().mockResolvedValue(FILM);
  mockPeek.mockReset().mockReturnValue(undefined);
  mockReviews.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mockVerdict.mockReset().mockResolvedValue(VERDICT);
});

/** The options the page's query is built with. */
const optionsOf = async () => {
  await renderHook(() => useFilmDetail(603, true));
  return mockOptions!;
};
/** The query's own read, run as React Query would run it. */
const read = async () => (await (await optionsOf()).queryFn()) as Record<string, unknown>;

describe('the film read', () => {
  it('keeps the film, and calls a verdict it could not read unknown, never silence', async () => {
    mockVerdict.mockRejectedValue(new Error('network'));
    const r = await read();
    expect(r.detail).toBe(FILM);
    expect(r.verdict).toBeNull();
  });

  it('keeps the failure of the critiques, beside an empty page of them', async () => {
    const lost = new Error('network');
    mockReviews.mockRejectedValue(lost);
    const r = await read();
    expect(r.reviews).toEqual([]);
    expect(r.reviewsError).toBe(lost);
  });

  it('carries a verdict it read', async () => {
    expect((await read()).verdict).toEqual(VERDICT);
  });

  it('paints a warm film with its verdict unknown, never "not spoken"', async () => {
    mockPeek.mockReturnValue(FILM);
    expect(((await optionsOf()).placeholderData() as { verdict: unknown }).verdict).toBeNull();
  });
});

describe('the page', () => {
  const open = (data: Record<string, unknown>) => {
    mockResult = { data, isLoading: false, isError: false, refetch: jest.fn() };
    render(<FilmDetailScreen />);
    return mockSeen!;
  };

  it('hands the section the critiques’ failure', () => {
    expect(open({ detail: FILM, reviews: [], reviewsError: new Error('x'), similar: [], verdict: VERDICT }).reviewsFailed).toBe(true);
  });

  it('and nothing when they were read', () => {
    expect(open({ detail: FILM, reviews: [], reviewsError: null, similar: [], verdict: VERDICT }).reviewsFailed).toBe(false);
  });
});
