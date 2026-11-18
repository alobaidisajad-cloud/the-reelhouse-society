/**
 * theSearchShowsOneCountAndTheWayOn.test.tsx — review round 12.
 *
 * The search room stopped every source at a fixed number and offered no way past it, and ALL
 * printed two totals at once: the tab's badge counted every source, the line under it the twenty
 * rows of the sampler. Now ALL is a sampler with a head for each section, carrying that section's
 * count and opening its tab; each tab counts its own rows ("20+" while its source holds more, the
 * total once it has none) and reads on at its foot.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import type { SR } from '@/src/hooks/useUniversalSearch';

const mockSearch = jest.fn();
jest.mock('@/src/hooks/useUniversalSearch', () => ({
  ...jest.requireActual('@/src/hooks/useUniversalSearch'),
  useUniversalSearch: (q: string) => mockSearch(q),
}));

// eslint-disable-next-line import/first
import SearchModal from '@/app/(modals)/search-modal';

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const log = (n: number): SR => ({ id: `log-${n}`, type: 'log', title: `Kubrick ${n}`, subtitle: '@KANE', image: null, extra: `"Words ${n}"`, _nav: `/log/${n}` });
const stack = (n: number): SR => ({ id: `list-${n}`, type: 'list', title: `Stack ${n}`, subtitle: 'PUBLIC STACK', image: null, _nav: `/stacks/${n}` });
const none = { films: false, users: false, logs: false, lists: false };
const loadMore = jest.fn();

/** Twenty records with more to read, and three stacks that are all there are. */
function answer(over: Record<string, unknown> = {}) {
  return {
    data: {
      films: [], actors: [], directors: [], users: [],
      logs: Array.from({ length: 20 }, (_, i) => log(i + 1)),
      lists: [stack(1), stack(2), stack(3)],
      _partial: false, _down: none,
    },
    isFetching: false, isError: false, refetch: jest.fn(),
    more: { ...none, logs: true }, readingMore: none, moreFailed: none, loadMore,
    ...over,
  };
}

async function searched() {
  const r = await render(<SearchModal />, { wrapper: Wrapper });
  await fireEvent.changeText(r.getByLabelText('Search the archives'), 'kubrick');
  await waitFor(() => expect(r.getByText('Kubrick 1')).toBeTruthy());
  // The words have reached the search (the box waits 400 ms after the last key): counts are said.
  await waitFor(() => expect(r.queryByText('SCANNING ARCHIVES…')).toBeNull());
  return r;
}

beforeEach(() => { loadMore.mockClear(); mockSearch.mockReturnValue(answer()); });

describe('ALL is a sampler, each section under its own head', () => {
  it('a head names its section and its own count, "20+" while more remain', async () => {
    const r = await searched();
    expect(r.getByText('LOGS · 20+')).toBeTruthy();
    expect(r.getByText('LISTS · 3')).toBeTruthy();
    expect(r.getByRole('button', { name: 'Logs, 20 or more results: show them all' })).toBeTruthy();
    // The sampler's first four records, not twenty.
    expect(r.queryByText('Kubrick 5')).toBeNull();
  });

  it('there is one number a section: no count line totals the sampler beside the badges', async () => {
    const r = await searched();
    expect(r.queryByText(/^\d+ RESULTS?$/)).toBeNull();
    expect(r.getByRole('tab', { name: 'All, 23 or more results' })).toBeTruthy();
  });

  it('a head opens its section, where every row read so far is shown', async () => {
    const r = await searched();
    await fireEvent.press(r.getByRole('button', { name: 'Logs, 20 or more results: show them all' }));
    expect(r.getByRole('tab', { name: 'Logs, 20 or more results' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(r.getByText('20+ RESULTS')).toBeTruthy();
    expect(r.getByText('Kubrick 20')).toBeTruthy();
  });
});

describe('a section reads on at its foot', () => {
  async function logsTab() {
    const r = await searched();
    await fireEvent.press(r.getByRole('tab', { name: 'Logs, 20 or more results' }));
    return r;
  }

  it('while its source holds more, the foot offers it, and asks that source', async () => {
    const r = await logsTab();
    await fireEvent.press(r.getByRole('button', { name: 'More from the archive' }));
    expect(loadMore).toHaveBeenCalledWith('logs');
  });

  it('while the next page is read, the foot says so', async () => {
    mockSearch.mockReturnValue(answer({ readingMore: { ...none, logs: true } }));
    const r = await logsTab();
    expect(r.getByLabelText('Reading more of the archive')).toBeTruthy();
    expect(r.queryByRole('button', { name: 'More from the archive' })).toBeNull();
  });

  it('a next page that could not be read is said, and asked again', async () => {
    mockSearch.mockReturnValue(answer({ moreFailed: { ...none, logs: true } }));
    const r = await logsTab();
    expect(r.getByText('The rest could not be reached.')).toBeTruthy();
    await fireEvent.press(r.getByText('TRY AGAIN'));
    expect(loadMore).toHaveBeenCalledWith('logs');
  });

  it('a section read to its end counts exactly, and offers nothing more', async () => {
    const r = await searched();
    await fireEvent.press(r.getByRole('tab', { name: 'Lists, 3 results' }));
    expect(r.getByText('3 RESULTS')).toBeTruthy();
    expect(r.queryByRole('button', { name: 'More from the archive' })).toBeNull();
  });
});
