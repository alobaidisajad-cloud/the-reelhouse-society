/**
 * theSearchReadsPastItsFirstPage.test.tsx — review round 12.
 *
 * The house-wide search read each source once, cut at a fixed number (twenty records, twelve
 * stacks, fifteen members of thirty, one page of the catalogue), and offered nothing past it: a
 * record or a stack older than the newest few that held the words was found nowhere. And PEOPLE
 * read the first thirty members holding the words in the order of their handles, so a member
 * whose handle BEGINS with them was left out once thirty others sorted first. Now each source is
 * read page after page, says whether it holds more, and the members are chosen by the house,
 * closest first; every word typed goes through buildSearchPattern.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';

/** A uuid of its own for each row: the n-th of a kind. */
const uuid = (kind: number, n: number) => `${String(kind).repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Newest first: the n-th row of a page is n minutes older than the first. */
const at = (n: number) => new Date(Date.UTC(2026, 10, 10, 12, 0) - n * 60_000).toISOString();

const record = (n: number) => ({
  id: uuid(3, n), user_id: uuid(2, n), film_title: `Kubrick ${n}`, review: `Words ${n}`, rating: 3,
  poster_path: null, status: 'watched', abandoned_reason: null, is_spoiler: false, created_at: at(n),
  username: `member${n}`, role: 'cinephile',
});
const member = (n: number, closeness: number) => ({ id: uuid(4, n), username: `sam${n}`, avatar_url: null, role: 'cinephile', closeness });
const stack = (n: number) => ({
  id: uuid(5, n), user_id: uuid(2, n), title: `Kubrick stack ${n}`, description: 'kubrick', is_private: false, is_ranked: false, created_at: at(n),
});

/** Every call the house was asked to answer, in order. */
const mockAsked: { fn: string; args: Record<string, unknown> }[] = [];
const FIRST_RECORDS = Array.from({ length: 21 }, (_, i) => record(i + 1));
const NEXT_RECORDS = [record(22), record(23), record(24)];
const FIRST_MEMBERS = Array.from({ length: 21 }, (_, i) => member(i + 1, i === 0 ? 0 : 1));
const NEXT_MEMBERS = [member(22, 3), member(23, 3)];
const FIRST_STACKS = Array.from({ length: 21 }, (_, i) => stack(i + 1));
const NEXT_STACKS = [stack(22)];
/** The stacks each read asked for, as the phone wrote its filters. */
const mockListsAsked: Ask[] = [];

const mockHouse = supabaseFake({
  answer: {
    lists: (ask) => {
      mockListsAsked.push(ask);
      return (ask.ors ?? []).length > 1 ? NEXT_STACKS : FIRST_STACKS;
    },
  },
  rpc: {
    search_logs: (args: Record<string, unknown>) => {
      mockAsked.push({ fn: 'search_logs', args });
      return args.p_cursor_at ? NEXT_RECORDS : FIRST_RECORDS;
    },
    search_members: (args: Record<string, unknown>) => {
      mockAsked.push({ fn: 'search_members', args });
      return args.p_cursor_username ? NEXT_MEMBERS : FIRST_MEMBERS;
    },
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

const film = (id: number) => ({ id, media_type: 'movie', title: `Film ${id}`, release_date: '1968-04-02', poster_path: null });

beforeEach(() => {
  mockAsked.length = 0;
  mockListsAsked.length = 0;
  mockTmdb.search.mockReset().mockImplementation(async (_words: string, page = 1) => (
    page === 1
      ? { results: [film(1), film(2)], page: 1, total_pages: 2 }
      : { results: [film(3)], page: 2, total_pages: 2 }
  ));
});

async function search(words: string) {
  const r = await renderHook(() => useUniversalSearch(words), { wrapper: Wrapper });
  await waitFor(() => expect(r.result.current.data).toBeDefined());
  return r;
}

describe('each source is read past its first page', () => {
  it('the records: twenty shown, more said, and the next twenty asked from the last one shown', async () => {
    const { result } = await search('kubrick');
    expect(result.current.data?.logs).toHaveLength(20);
    expect(result.current.more.logs).toBe(true);

    await act(async () => { result.current.loadMore('logs'); });
    await waitFor(() => expect(result.current.data?.logs).toHaveLength(23));
    const twentieth = FIRST_RECORDS[19];
    expect(twentieth).toBeDefined();
    const next = mockAsked.filter((a) => a.fn === 'search_logs')[1];
    expect(next).toBeDefined();
    expect(next!.args).toMatchObject({ p_cursor_at: twentieth!.created_at, p_cursor_id: twentieth!.id, p_limit: 21 });
    // The last page holds no more: the count is now the whole of it.
    expect(result.current.more.logs).toBe(false);
  });

  it('the stacks: past the first page, the next asked after the last one shown', async () => {
    const { result } = await search('kubrick');
    expect(result.current.data?.lists).toHaveLength(20);
    expect(result.current.more.lists).toBe(true);

    await act(async () => { result.current.loadMore('lists'); });
    await waitFor(() => expect(result.current.data?.lists).toHaveLength(21));
    const twentieth = FIRST_STACKS[19];
    expect(twentieth).toBeDefined();
    const asked = mockListsAsked[1];
    expect(asked).toBeDefined();
    expect(asked!.ors?.[1]).toContain(`created_at.lt."${twentieth!.created_at}"`);
    expect(asked!.ors?.[1]).toContain(`id.lt."${twentieth!.id}"`);
    expect(result.current.more.lists).toBe(false);
  });

  it('the catalogue: its next page asked by its own page number', async () => {
    const { result } = await search('kubrick');
    expect(result.current.data?.films.map((f) => f.title)).toEqual(['Film 1', 'Film 2']);
    expect(result.current.more.films).toBe(true);

    await act(async () => { result.current.loadMore('films'); });
    await waitFor(() => expect(result.current.data?.films).toHaveLength(3));
    expect(mockTmdb.search).toHaveBeenLastCalledWith('kubrick', 2);
    expect(result.current.more.films).toBe(false);
  });

  it('a source with no next page asks nothing more', async () => {
    const { result } = await search('kubrick');
    await act(async () => { result.current.loadMore('logs'); });
    await waitFor(() => expect(result.current.more.logs).toBe(false));
    const asked = mockAsked.filter((a) => a.fn === 'search_logs').length;
    await act(async () => { result.current.loadMore('logs'); });
    expect(mockAsked.filter((a) => a.fn === 'search_logs')).toHaveLength(asked);
  });
});

describe('PEOPLE are chosen by the house, closest first', () => {
  it('the words go through buildSearchPattern, and the members come in the house\'s order', async () => {
    const { result } = await search('sam_');
    const first = mockAsked.find((a) => a.fn === 'search_members');
    expect(first).toBeDefined();
    // `_` is LIKE's wildcard: escaped, as every search escapes it.
    expect(first!.args).toMatchObject({ p_pattern: 'sam\\_', p_handles_only: false, p_cursor_closeness: null, p_cursor_username: null });
    expect(result.current.data?.users.slice(0, 3).map((u) => u.title)).toEqual(['@sam1', '@sam2', '@sam3']);
    expect(result.current.data?.users).toHaveLength(20);
    expect(result.current.more.users).toBe(true);
  });

  it('"@sam" asks for handles alone, without its @', async () => {
    await search('@sam');
    const first = mockAsked.find((a) => a.fn === 'search_members');
    expect(first).toBeDefined();
    expect(first!.args).toMatchObject({ p_pattern: 'sam', p_handles_only: true });
  });

  it('the next members are asked after the last one shown, by how close it was and its handle', async () => {
    const { result } = await search('sam');
    await act(async () => { result.current.loadMore('users'); });
    await waitFor(() => expect(result.current.data?.users).toHaveLength(22));
    const next = mockAsked.filter((a) => a.fn === 'search_members')[1];
    expect(next).toBeDefined();
    expect(next!.args).toMatchObject({ p_cursor_closeness: 1, p_cursor_username: 'sam20' });
    expect(result.current.more.users).toBe(false);
  });
});
