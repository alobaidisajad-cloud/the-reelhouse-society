/**
 * aSpoilerIsNeverQuotedInSearch.test.tsx — review round 12.
 *
 * The house-wide search quoted the first words of every review it found, a review its author had
 * marked as spoilers among them, and a screen reader read them aloud: search "fight club" and the
 * LOGS row gave the ending away. Every other reader of a record veils such a review, and the wall
 * leaves it out. Now the row says the record holds spoilers in place of the words; the author
 * still reads their own; the record's page veils it as it always has.
 */
import React from 'react';
import { render, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';

const ME = '11111111-1111-4111-8111-111111111111';
const TYLER = '22222222-2222-4222-8222-222222222222';

/** A record as the logs hold it. */
const record = (over: Record<string, unknown>) => ({
  id: '33333333-3333-4333-8333-333333333331', user_id: TYLER, film_title: 'Fight Club',
  review: 'Tyler is the narrator, all along.', rating: 4, poster_path: null, status: 'watched',
  abandoned_reason: null, is_spoiler: true, created_at: '2026-11-10T10:00:00+00:00', ...over,
});
const LOGS = [
  record({}),
  record({ id: '33333333-3333-4333-8333-333333333332', user_id: ME, review: 'My own twist, mine to read.', created_at: '2026-11-09T10:00:00+00:00' }),
  record({ id: '33333333-3333-4333-8333-333333333333', status: 'abandoned', abandoned_reason: 'bored', review: 'Left before the reveal: he was dead.', created_at: '2026-11-08T10:00:00+00:00' }),
  record({ id: '33333333-3333-4333-8333-333333333334', is_spoiler: false, review: 'Loud and long.', created_at: '2026-11-07T10:00:00+00:00' }),
];
const MEMBERS = [{ id: TYLER, username: 'tyler', role: 'cinephile' }, { id: ME, username: 'kane', role: 'cinephile' }];
/** The same records as the house's search answers them, each with its author's handle and rank. */
const FOUND = LOGS.map((l) => {
  const author = MEMBERS.find((m) => m.id === l.user_id);
  return { ...l, username: author?.username ?? null, role: author?.role ?? null };
});

const mockHouse = supabaseFake({
  rows: { profiles: MEMBERS },
  // The phone's own reads of the logs and members, as the search made them before this round,
  // answered with the same records.
  answer: { logs: () => LOGS, profiles: () => [], lists: () => [] },
  rpc: { search_logs: FOUND, search_members: [] },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
const mockAuth = { user: { id: '11111111-1111-4111-8111-111111111111', username: 'kane' } };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(mockAuth) : mockAuth);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => mockAuth;
  (useAuthStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
// eslint-disable-next-line import/first
import { useUniversalSearch, type SR } from '../useUniversalSearch';
// eslint-disable-next-line import/first
import { SearchResultRow } from '@/src/components/search/SearchResultRow';

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => { mockTmdb.search.mockReset().mockResolvedValue({ results: [] }); });

async function searched(words: string): Promise<SR[]> {
  const { result } = await renderHook(() => useUniversalSearch(words), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data).toBeDefined());
  return result.current.data?.logs ?? [];
}

describe('a review marked as spoilers, found by the search', () => {
  it('is never quoted to another member: the row says it holds spoilers', async () => {
    const logs = await searched('fight club');
    const theirs = logs.find((l) => l.id === 'log-33333333-3333-4333-8333-333333333331');
    expect(theirs).toBeDefined();
    expect(theirs!.extra).toBe('[CONTAINS SPOILERS]');
    expect(JSON.stringify(logs)).not.toContain('Tyler is the narrator');
  });

  it('nor when the record was abandoned: the reason stays, the words do not', async () => {
    const logs = await searched('fight club');
    const left = logs.find((l) => l.id === 'log-33333333-3333-4333-8333-333333333333');
    expect(left).toBeDefined();
    expect(left!.extra).toBe('[ABANDONED — BORED] [CONTAINS SPOILERS]');
  });

  it('is quoted to its own author, whose words they are', async () => {
    const logs = await searched('fight club');
    const mine = logs.find((l) => l.id === 'log-33333333-3333-4333-8333-333333333332');
    expect(mine).toBeDefined();
    expect(mine!.extra).toBe('"My own twist, mine to read."');
  });

  it('a review not marked is quoted as before', async () => {
    const logs = await searched('fight club');
    const plain = logs.find((l) => l.id === 'log-33333333-3333-4333-8333-333333333334');
    expect(plain).toBeDefined();
    expect(plain!.extra).toBe('"Loud and long."');
  });

  it('the row neither shows nor speaks the words, only that it holds spoilers', async () => {
    const logs = await searched('fight club');
    const theirs = logs.find((l) => l.id === 'log-33333333-3333-4333-8333-333333333331');
    expect(theirs).toBeDefined();
    const r = await render(<SearchResultRow item={theirs!} index={0} onPress={() => {}} />, { wrapper: Wrapper });
    expect(r.getByText('[CONTAINS SPOILERS]')).toBeTruthy();
    expect(r.queryByText(/narrator/)).toBeNull();
    expect(r.getByRole('button', { name: 'Log of Fight Club by @tyler, rated 4 of 5. [CONTAINS SPOILERS]' })).toBeTruthy();
  });
});
