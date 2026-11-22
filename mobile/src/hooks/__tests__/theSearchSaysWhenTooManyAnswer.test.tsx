/**
 * theSearchSaysWhenTooManyAnswer.test.tsx — the members' search, for words it cannot narrow.
 *
 * search_members reads a bounded list for words many members hold (20261122_62), and when the page lies
 * past every list it could read it answers TOO_WIDE rather than read the whole house. That is an answer:
 * the members are not down and not silent; more letters would narrow them. Any other failure is the
 * source down, as before.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';

let mockMembers: unknown = [];
const mockHouse = supabaseFake({
  rpc: { search_stacks: [], search_logs: [], search_members: () => mockMembers },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
// eslint-disable-next-line import/first
import { saysTooWide, useUniversalSearch } from '../useUniversalSearch';

/** One client for the life of a render: the wrapper is a component, and renders again. */
function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => { mockTmdb.search.mockReset().mockResolvedValue({ results: [] }); });

it('words the members\' search cannot narrow are an answer, not a failure: said wide, never down', async () => {
  mockMembers = { error: { code: '54000', message: 'TOO_WIDE' } };
  const { result } = await renderHook(() => useUniversalSearch('mber 95'), { wrapper: Wrapper });
  await waitFor(() => expect([result.current.data !== undefined, result.current.isFetching]).toEqual([true, false]));
  expect(result.current.data?._down.users).toBe(false);
  expect(result.current.data?.users).toEqual([]);
  expect(result.current.wide).toEqual({ films: false, users: true, logs: false, lists: false });
  expect(result.current.more.users).toBe(false);
  expect(result.current.isError).toBe(false);
});

it('any other failure of the members\' search is the source down, not wide', async () => {
  mockMembers = { error: { code: '57014', message: 'canceling statement due to statement timeout' } };
  const { result } = await renderHook(() => useUniversalSearch('mber 95'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data?._down.users).toBe(true));
  expect(result.current.wide.users).toBe(false);
});

it('members found are never wide', async () => {
  mockMembers = [{ id: '11111111-1111-4111-8111-111111111111', username: 'kane', avatar_url: null, role: 'cinephile', closeness: 0 }];
  const { result } = await renderHook(() => useUniversalSearch('kane'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data?.users.length).toBe(1));
  expect(result.current.wide.users).toBe(false);
});

it('only the house\'s own TOO_WIDE is wide: the same code with other words, or the words with another code, is not', () => {
  expect(saysTooWide({ code: '54000', message: 'TOO_WIDE' })).toBe(true);
  expect(saysTooWide({ code: '54000', message: 'Daily log limit reached' })).toBe(false);
  expect(saysTooWide({ code: 'P0001', message: 'TOO_WIDE' })).toBe(false);
  expect(saysTooWide(null)).toBe(false);
});
