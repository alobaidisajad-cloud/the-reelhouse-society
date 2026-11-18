/**
 * theSearchDrawsEachSourceAsItAnswers.test.tsx — the house-wide search draws each source as it
 * answers (round 13).
 *
 * The search drew nothing until its slowest source answered: the members, records and stacks the
 * house had found waited behind a catalogue still out (or the catalogue's films behind the house),
 * SCANNING ARCHIVES… on the screen the whole time. Now what has answered is drawn, and the screen
 * still says the search is out (isFetching) until the last source answers and joins.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';

const STACK = { id: '55555555-5555-4555-8555-555555555555', user_id: '22222222-2222-4222-8222-222222222222', title: 'Tarkovsky, slowly', description: 'Seven films', is_ranked: false, created_at: '2026-11-10T12:00:00+00:00' };
const mockHouse = supabaseFake({
  rpc: {
    search_members: [{ id: '11111111-1111-4111-8111-111111111111', username: 'tarkovskyfan', avatar_url: null, role: 'cinephile', closeness: 1 }],
    search_logs: [],
    search_stacks: [STACK],
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
// eslint-disable-next-line import/first
import { useUniversalSearch } from '../useUniversalSearch';

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => { mockTmdb.search.mockReset().mockResolvedValue({ results: [] }); });

it("the house's members and stacks are drawn while the catalogue is still out, and its films join when it answers", async () => {
  let answer: (v: unknown) => void = () => {};
  mockTmdb.search.mockReset().mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  const { result } = await renderHook(() => useUniversalSearch('tarkovsky'), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.data?.lists.map((l) => l.title)).toEqual(['Tarkovsky, slowly']));
  expect(result.current.data?.users.map((u) => u.title)).toEqual(['@tarkovskyfan']);
  expect(result.current.data?.films).toEqual([]);
  // Still out: the screen says so, and no count is final.
  expect(result.current.isFetching).toBe(true);

  await act(async () => { answer({ results: [{ id: 1398, media_type: 'movie', title: 'Stalker', release_date: '1979-05-25' }], page: 1, total_pages: 1 }); });
  await waitFor(() => expect(result.current.data?.films.map((f) => f.title)).toEqual(['Stalker']));
  expect(result.current.isFetching).toBe(false);
  expect(result.current.data?.lists).toHaveLength(1);
});

it('the stacks are asked of the house by their words, one page at a time', async () => {
  const { result } = await renderHook(() => useUniversalSearch('tarkovsky'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isFetching).toBe(false));
  const stack = result.current.data?.lists[0];
  expect(stack).toBeDefined();
  expect(stack).toMatchObject({ id: `list-${STACK.id}`, type: 'list', title: 'Tarkovsky, slowly', subtitle: 'Seven films', _nav: `/stacks/${STACK.id}` });
  expect(result.current.more.lists).toBe(false);
});
