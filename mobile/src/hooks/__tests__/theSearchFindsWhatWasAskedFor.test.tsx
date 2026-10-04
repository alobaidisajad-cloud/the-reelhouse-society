/**
 * theSearchFindsWhatWasAskedFor.test.tsx — the house-wide search, read as a
 * member uses it.
 *
 * "@kane" found no one (no username holds the @), and the exact handle could
 * be left out among near matches. A half rating was drawn half a reel short.
 * Every tab was announced as "Switch search tab". Results that came back while
 * one source was down did not say so, and an emptied box showed the last
 * search's results until the debounce ran out.
 */
import React from 'react';
import { fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';

type Op = [string, ...unknown[]];
const mockReads: { table: string; ops: Op[] }[] = [];

function mockAnswer(table: string, ops: Op[]) {
  if (table === 'profiles') {
    const exact = ops.some(([k, col]) => k === 'ilike' && col === 'username');
    return exact
      ? [{ id: 'k', username: 'kane', role: 'cinephile' }]
      : [
          { id: 'a', username: 'akane', role: 'cinephile' },
          { id: 'b', username: 'kanefan', role: 'cinephile' },
        ];
  }
  if (table === 'logs') {
    return [{ id: 'l1', user_id: 'u9', film_title: 'Vertigo', review: '<p>Tom &amp; Jerry</p>', rating: 3.5, created_at: '2026-01-01', profiles: { username: 'kane', role: 'cinephile' } }];
  }
  return [];
}

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const read = { table, ops: [] as Op[] };
      mockReads.push(read);
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'or', 'not', 'neq', 'order', 'limit', 'eq', 'ilike', 'abortSignal']) {
        chain[k] = (...args: unknown[]) => { read.ops.push([k, ...args]); return chain; };
      }
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: mockAnswer(table, read.ops), error: null }).then(res);
      return chain;
    },
  },
}));
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const mockSearchResult = jest.fn();
jest.mock('@/src/hooks/useUniversalSearch', () => {
  const actual = jest.requireActual('@/src/hooks/useUniversalSearch');
  return { ...actual, useUniversalSearch: (q: string) => (q === '__real__' ? actual.useUniversalSearch : mockSearchResult)(q) };
});

const { useUniversalSearch } = jest.requireActual('@/src/hooks/useUniversalSearch');
const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
// Loaded with the file, not inside a test: on a cold cache the search screen
// takes seconds to load, and a test has five.
const { SearchResultRow } = require('@/src/components/search/SearchResultRow');
const SearchModal = require('@/app/(modals)/search-modal').default;

/** One client for the life of a render: the wrapper is a component, and renders again. */
function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockReads.length = 0;
  mockTmdb.search.mockReset().mockResolvedValue({ results: [] });
});

describe('the search asks for what the member typed', () => {
  it('"@kane" asks for the handle without its @, and the exact handle comes first', async () => {
    const { result } = await renderHook(() => useUniversalSearch('@kane'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const profileOps = mockReads.filter((r) => r.table === 'profiles').flatMap((r) => r.ops);
    expect(JSON.stringify(profileOps)).not.toContain('@');
    expect(result.current.data.users.map((u: { title: string }) => u.title)).toEqual(['@kane', '@kanefan', '@akane']);
  });

  it('a review is quoted as plain words, and not marked as cut when it is whole', async () => {
    const { result } = await renderHook(() => useUniversalSearch('vertigo'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.logs[0].extra).toBe('"Tom & Jerry"');
  });
});

describe('a row says what it is', () => {
  it('a half rating is drawn as one, and spoken', async () => {
    const r = await render(
      <SearchResultRow
        index={0}
        onPress={() => {}}
        item={{ id: 'log-1', type: 'log', title: 'Vertigo', subtitle: '@KANE', image: null, rating: 3.5, extra: '"Tom & Jerry"', _nav: '/log/1' }}
      />,
      { wrapper: Wrapper },
    );
    expect(r.queryByText(/◉/, { includeHiddenElements: true })).toBeNull();
    expect(r.getByRole('button', { name: 'Log of Vertigo by @kane, rated 3.5 of 5. "Tom & Jerry"' })).toBeTruthy();
    // Drawn: the five reels as they are painted — three whole, one half, one empty.
    const reels: string[] = [];
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const node = n as { props?: { source?: { testUri?: string } }; children?: unknown[] };
      const kind = /rating-(full|half|empty)\.png$/.exec(node.props?.source?.testUri ?? '');
      if (kind) reels.push(kind[1]);
      (node.children ?? []).forEach(walk);
    };
    walk(r.toJSON());
    expect(reels).toEqual(['full', 'full', 'full', 'half', 'empty']);
  });
});

describe('the search room', () => {
  const answer = (over: Record<string, unknown> = {}) => ({
    data: {
      films: [], actors: [], directors: [], logs: [], lists: [],
      users: [{ id: 'user-k', type: 'user', title: '@kane', subtitle: '', image: null, _nav: '/user/kane' }],
      _partial: false,
      _down: { films: false, users: false, logs: false, lists: false },
      ...over,
    },
    isFetching: false, isError: false, refetch: jest.fn(),
  });

  async function open() {
    const r = await render(<SearchModal />, { wrapper: Wrapper });
    await fireEvent.changeText(r.getByLabelText('Search the archives'), 'kane');
    return r;
  }

  it('names each tab, its results and which is chosen', async () => {
    mockSearchResult.mockReturnValue(answer());
    const r = await open();
    await waitFor(() => expect(r.getByRole('tab', { name: 'All, 1 result' })).toBeTruthy());
    expect(r.getByRole('tab', { name: 'All, 1 result' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(r.getByRole('tab', { name: 'People, 1 result' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('says when what is shown is not all there is', async () => {
    mockSearchResult.mockReturnValue(answer({ _partial: true, _down: { films: true, users: false, logs: false, lists: false } }));
    const r = await open();
    await waitFor(() => expect(r.getByText('Part of the archive could not be reached.')).toBeTruthy());
    expect(r.getByText('@kane')).toBeTruthy();
  });

  it('a search that finds nothing shows Buster, who stays through the next letter while it is searched', async () => {
    const empty = answer({ users: [] });
    mockSearchResult.mockReturnValue(empty);
    const r = await open();
    await waitFor(() => expect(r.getByText('THE ARCHIVE RETURNS SILENCE')).toBeTruthy());
    expect(r.getByTestId('buster-suspicious', { includeHiddenElements: true })).toBeTruthy();

    // The next letter is being searched: he stays where he is; only the line changes.
    await fireEvent.changeText(r.getByLabelText('Search the archives'), 'kanex');
    expect(r.getByTestId('buster-suspicious', { includeHiddenElements: true })).toBeTruthy();
    expect(r.queryByText('THE ARCHIVE RETURNS SILENCE')).toBeNull();
    expect(r.getAllByText('SCANNING ARCHIVES…').length).toBeGreaterThanOrEqual(2);

    // Something is found: he goes, and the results stand in his place.
    mockSearchResult.mockReturnValue(answer());
    await waitFor(() => expect(r.getByText('@kane')).toBeTruthy());
    expect(r.queryByTestId('buster-suspicious', { includeHiddenElements: true })).toBeNull();
  });

  it('an emptied box is empty at once', async () => {
    mockSearchResult.mockReturnValue(answer());
    const r = await open();
    await waitFor(() => expect(r.getByText('@kane')).toBeTruthy());
    await fireEvent.press(r.getByLabelText('Clear search'));
    expect(r.getByText('The Archive Awaits')).toBeTruthy();
    expect(r.queryByText('@kane')).toBeNull();
  });
});
