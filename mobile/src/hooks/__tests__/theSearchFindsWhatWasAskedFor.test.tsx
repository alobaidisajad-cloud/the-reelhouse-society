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
import { supabaseFake } from '@/test-utils/supabaseFake';

/** Every call the house was asked, by name, with its arguments. */
const mockAsked: { fn: string; args: Record<string, unknown> }[] = [];
const mockHouse = supabaseFake({
  answer: { lists: () => [] },
  rpc: {
    // The house's own order, closest first: the handle itself, then one that begins with it, then one holding it.
    search_members: (args: Record<string, unknown>) => {
      mockAsked.push({ fn: 'search_members', args });
      return [
        { id: '11111111-1111-4111-8111-111111111111', username: 'kane', avatar_url: null, role: 'cinephile', closeness: 0 },
        { id: '22222222-2222-4222-8222-222222222222', username: 'kanefan', avatar_url: null, role: 'cinephile', closeness: 1 },
        { id: '33333333-3333-4333-8333-333333333333', username: 'akane', avatar_url: null, role: 'cinephile', closeness: 3 },
      ];
    },
    search_logs: (args: Record<string, unknown>) => {
      mockAsked.push({ fn: 'search_logs', args });
      return [{
        id: '44444444-4444-4444-8444-444444444444', user_id: '55555555-5555-4555-8555-555555555555', film_title: 'Vertigo',
        review: '<p>Tom &amp; Jerry</p>', rating: 3.5, poster_path: null, status: 'watched', abandoned_reason: null,
        is_spoiler: false, created_at: '2026-01-01T00:00:00+00:00', username: 'kane', role: 'cinephile',
      }];
    },
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
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
  mockAsked.length = 0;
  mockTmdb.search.mockReset().mockResolvedValue({ results: [] });
});

describe('the search asks for what the member typed', () => {
  // The house chooses the members now, closest first (review round 12): the phone keeps its order.
  it('"@kane" asks for the handle without its @, and the exact handle comes first', async () => {
    const { result } = await renderHook(() => useUniversalSearch('@kane'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const members = mockAsked.filter((a) => a.fn === 'search_members');
    expect(JSON.stringify(members)).not.toContain('@');
    const asked = members[0];
    expect(asked).toBeDefined();
    expect(asked!.args).toMatchObject({ p_pattern: 'kane', p_handles_only: true });
    expect(result.current.data.users.map((u: { title: string }) => u.title)).toEqual(['@kane', '@kanefan', '@akane']);
  });

  it('a review is quoted as plain words, and not marked as cut when it is whole', async () => {
    const { result } = await renderHook(() => useUniversalSearch('vertigo'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const first = result.current.data.logs[0];
    expect(first).toBeDefined();
    expect(first.extra).toBe('"Tom & Jerry"');
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
  /** Each source read to its end: no next page, none being read, none failed (review round 12). */
  const none = { films: false, users: false, logs: false, lists: false };
  const paging = { more: none, readingMore: none, moreFailed: none, loadMore: jest.fn() };
  const answer = (over: Record<string, unknown> = {}) => ({
    data: {
      films: [], actors: [], directors: [], logs: [], lists: [],
      users: [{ id: 'user-k', type: 'user', title: '@kane', subtitle: '', image: null, _nav: '/user/kane' }],
      _partial: false,
      _down: { films: false, users: false, logs: false, lists: false },
      ...over,
    },
    isFetching: false, isError: false, refetch: jest.fn(), ...paging,
  });

  async function open() {
    const r = await render(<SearchModal />, { wrapper: Wrapper });
    await fireEvent.changeText(r.getByLabelText('Search the archives'), 'kane');
    return r;
  }

  it('opens ready to be typed into: the keys are up at once (review round 4)', async () => {
    mockSearchResult.mockReturnValue(answer());
    const r = await render(<SearchModal />, { wrapper: Wrapper });
    expect(r.getByLabelText('Search the archives').props.autoFocus).toBe(true);
  });

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

  // Review round 7: a source that could not be asked, or a search that failed, was counted
  // "0 RESULTS", and each tab "0 results", while the search was still out too: a count nobody had.
  it('a source that could not be asked: the count line says NOT REACHED, never 0 RESULTS, and its tab says so', async () => {
    mockSearchResult.mockReturnValue(answer({ users: [], _partial: true, _down: { films: false, users: true, logs: false, lists: false } }));
    const r = await open();
    await waitFor(() => expect(r.getByText('NOT REACHED')).toBeTruthy());
    expect(r.queryByText('0 RESULTS')).toBeNull();
    expect(r.getByRole('tab', { name: 'All, not reached' })).toBeTruthy();
    expect(r.getByRole('tab', { name: 'People, not reached' })).toBeTruthy();
    // A source that answered keeps its count: none found is a count it has.
    expect(r.getByRole('tab', { name: 'Films, 0 results' })).toBeTruthy();
  });

  it('a search that failed: the count line says NOT REACHED, and every tab says not reached', async () => {
    mockSearchResult.mockReturnValue({ data: undefined, isFetching: false, isError: true, refetch: jest.fn(), ...paging });
    const r = await open();
    await waitFor(() => expect(r.getByText('NOT REACHED')).toBeTruthy());
    expect(r.queryByText('0 RESULTS')).toBeNull();
    for (const name of ['All', 'Films', 'Actors', 'Directors', 'People', 'Logs', 'Lists']) {
      expect(r.getByRole('tab', { name: `${name}, not reached` })).toBeTruthy();
    }
  });

  it('while the search is out, a tab is named without a count', async () => {
    mockSearchResult.mockReturnValue({ data: undefined, isFetching: true, isError: false, refetch: jest.fn(), ...paging });
    const r = await open();
    await waitFor(() => expect(r.getByRole('tab', { name: 'All' })).toBeTruthy());
    expect(r.getAllByText('SCANNING ARCHIVES…').length).toBeGreaterThanOrEqual(1);
    expect(r.getByRole('tab', { name: 'People' })).toBeTruthy();
    expect(r.queryByRole('tab', { name: /result/ })).toBeNull();
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
