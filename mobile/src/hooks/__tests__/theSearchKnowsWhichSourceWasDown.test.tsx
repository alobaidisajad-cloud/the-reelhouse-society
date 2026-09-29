/**
 * theSearchKnowsWhichSourceWasDown.test.tsx — the house-wide search, when one
 * source could not be asked.
 *
 * The catalogue failing alone was left out of `_partial`: the result was kept
 * five minutes as a clean one, and the Films tab said "the archive returns
 * silence" to a member whose films simply had not been asked for. Now each
 * source's failure is carried with the answer, and not kept.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUniversalSearch } from '../useUniversalSearch';

jest.mock('@/src/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const k of ['select', 'or', 'not', 'neq', 'order', 'limit', 'eq', 'ilike', 'abortSignal']) chain[k] = self;
  chain.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: 'u1', username: 'kane', role: 'cinephile' }], error: null }).then(res);
  return { supabase: { from: () => chain } };
});
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => { mockTmdb.search.mockReset().mockResolvedValue({ results: [] }); });

it('the catalogue down alone is carried with the answer, and the answer is not kept', async () => {
  mockTmdb.search.mockRejectedValue(Object.assign(new Error('offline'), { name: 'TmdbUnreachable' }));
  const { result } = await renderHook(() => useUniversalSearch('kane'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?._down).toEqual({ films: true, users: false, logs: false, lists: false });
  expect(result.current.data?._partial).toBe(true);
  expect(result.current.data?.users.length).toBe(1);   // the rest of the search still works
});

it('a search every source answered is clean', async () => {
  const { result } = await renderHook(() => useUniversalSearch('kane'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?._down).toEqual({ films: false, users: false, logs: false, lists: false });
  expect(result.current.data?._partial).toBe(false);
});
