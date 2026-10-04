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
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
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

/** One client for the life of a render: the wrapper is a component, and renders again. */
function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => { mockTmdb.search.mockReset().mockResolvedValue({ results: [] }); });

it('the catalogue down alone is carried with the answer, and the answer is not kept', async () => {
  mockTmdb.search.mockRejectedValue(Object.assign(new Error('offline'), { name: 'TmdbUnreachable' }));
  const { result } = await renderHook(() => useUniversalSearch('kane'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?._down).toEqual({ films: true, users: false, logs: false, lists: false });
  expect(result.current.data?._partial).toBe(true);
  expect(result.current.data?.users.length).toBe(1);   // the rest of the search still works
  // Not kept: a partial answer is stale at once, so the next look asks again.
  expect(result.current.isStale).toBe(true);
});

it('a search every source answered is clean', async () => {
  const { result } = await renderHook(() => useUniversalSearch('kane'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?._down).toEqual({ films: false, users: false, logs: false, lists: false });
  expect(result.current.data?._partial).toBe(false);
  // A clean answer is worth keeping.
  expect(result.current.isStale).toBe(false);
});
