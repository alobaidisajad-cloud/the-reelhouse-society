/**
 * aMemberHiddenLeavesTheFilmsPages.test.tsx — a member blocked or muted leaves a film's pages at once.
 *
 * The film page keeps its critiques half an hour, and the Log Archive filtered its rows once, as
 * they arrived: a member blocked from the archive's own ··· (the toast: their words are hidden),
 * or from anywhere else, stayed on both pages until they were read again.
 */
import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { useFilmDetail } from '../useFilmDetail';
import { useBlockStore } from '@/src/stores/blockStore';
import { supabaseFake } from '@/test-utils/supabaseFake';

const BEN = '22222222-2222-4222-8222-222222222222';

jest.mock('@/src/lib/tmdb', () => ({
  tmdb: { detail: jest.fn(async () => ({ id: 603, title: 'The Matrix' })), peekDetail: () => undefined },
  obscurityScore: () => 0,
}));
jest.mock('@/src/services/FilmService', () => ({
  FilmService: {
    getFilmReviews: async () => ({ items: [{ id: 'r1', user_id: '11111111-1111-4111-8111-111111111111' }, { id: 'r2', user_id: '22222222-2222-4222-8222-222222222222' }] }),
    getFilmVerdict: async () => null,
  },
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const ANA = '11111111-1111-4111-8111-111111111111';
const log = (id: string, user: string, name: string) => ({
  id, user_id: user, film_id: 603, film_title: 'The Matrix', poster_path: null, rating: 4, review: `${name} wrote.`,
  drop_cap: false, status: 'watched', created_at: '2026-11-15T09:00:00.000Z', year: 1999,
});
const LOGS = [log('00000000-0000-4000-8000-000000000001', ANA, 'ana'), log('00000000-0000-4000-8000-000000000002', BEN, 'ben')];
const mockHouse = supabaseFake({
  // Answered whole: the archive asks for the film by its id as text (PostgREST casts it), which
  // the fake's strict filter would not match against the integer column.
  answer: { logs: () => LOGS },
  rows: {
    profiles: [{ id: ANA, username: 'ana', avatar_url: null, role: 'cinephile' }, { id: BEN, username: 'ben', avatar_url: null, role: 'cinephile' }],
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/components/feed/ActivityCard', () => ({
  ActivityCard: ({ item }: { item: { username: string } }) => require('react').createElement(require('react-native').Text, null, item.username),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => { useBlockStore.getState().clearOnLogout(null); });
// The archive's code is loaded once before the cases, so no case pays for the load.
beforeAll(() => { require('@/app/film-reviews/[id]'); }, 30_000);

it('the film page: a reviewer blocked since its read leaves it at once', async () => {
  const { result } = await renderHook(() => useFilmDetail(603, true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data?.reviews.map((r) => r.id)).toEqual(['r1', 'r2']));
  await act(async () => { useBlockStore.setState({ blocked: [BEN], _blockedIndex: new Set([BEN]) } as never); });
  expect(result.current.data?.reviews.map((r) => r.id)).toEqual(['r1']);
});

it('the Log Archive: a member blocked since its read leaves it at once', async () => {
  const { useLocalSearchParams } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };
  useLocalSearchParams.mockReturnValue({ id: '603', title: 'The Matrix' });
  const Archive = require('@/app/film-reviews/[id]').default as React.ComponentType;
  const r = await render(<Wrapper><Archive /></Wrapper>);
  const drawn = () => ['ana', 'ben'].filter((name) => r.queryByText(name) !== null);
  await waitFor(() => expect(drawn()).toEqual(['ana', 'ben']), { timeout: 5000 });
  await act(async () => { useBlockStore.setState({ blocked: [BEN], _blockedIndex: new Set([BEN]) } as never); });
  expect(drawn()).toEqual(['ana']);
  expect(r.queryByText('ben')).toBeNull();
  r.unmount();
}, 15_000);
