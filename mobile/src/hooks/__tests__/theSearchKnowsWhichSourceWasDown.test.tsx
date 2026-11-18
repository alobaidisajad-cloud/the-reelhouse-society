/**
 * theSearchKnowsWhichSourceWasDown.test.tsx — the house-wide search, when one
 * source could not be asked.
 *
 * The catalogue failing alone was left out of `_partial`: the result was kept
 * five minutes as a clean one, and the Films tab said "the archive returns
 * silence" to a member whose films simply had not been asked for. Now each
 * source's failure is carried with the answer, and not kept: each source is its
 * own read (review round 12), and one that failed holds no answer to be kept, so
 * it is asked again and its films arrive.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';

const mockHouse = supabaseFake({
  answer: { lists: () => [] },
  rpc: {
    search_members: [{ id: '11111111-1111-4111-8111-111111111111', username: 'kane', avatar_url: null, role: 'cinephile', closeness: 0 }],
    search_logs: [],
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
// eslint-disable-next-line import/first
import { useUniversalSearch } from '../useUniversalSearch';

/** One client for the life of a render: the wrapper is a component, and renders again. */
function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => { mockTmdb.search.mockReset().mockResolvedValue({ results: [] }); });

it('the catalogue down alone is carried with the answer, and is asked again', async () => {
  mockTmdb.search.mockRejectedValue(Object.assign(new Error('offline'), { name: 'TmdbUnreachable' }));
  const { result } = await renderHook(() => useUniversalSearch('kane'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.data?._down).toEqual({ films: true, users: false, logs: false, lists: false });
  expect(result.current.data?._partial).toBe(true);
  expect(result.current.data?.users.length).toBe(1);   // the rest of the search still works
  expect(result.current.isError).toBe(false);

  // Not kept: asked again, the catalogue that came back answers.
  mockTmdb.search.mockResolvedValue({ results: [{ id: 7, media_type: 'movie', title: 'Citizen Kane' }], page: 1, total_pages: 1 });
  await act(async () => { result.current.refetch(); });
  await waitFor(() => expect(result.current.data?._partial).toBe(false));
  expect(result.current.data?.films.map((f) => f.title)).toEqual(['Citizen Kane']);
});

it('a search every source answered is clean', async () => {
  const { result } = await renderHook(() => useUniversalSearch('kane'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.data?._down).toEqual({ films: false, users: false, logs: false, lists: false });
  expect(result.current.data?._partial).toBe(false);
});
