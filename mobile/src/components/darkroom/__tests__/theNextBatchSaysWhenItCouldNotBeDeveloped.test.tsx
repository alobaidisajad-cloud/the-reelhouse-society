/**
 * theNextBatchSaysWhenItCouldNotBeDeveloped.test.tsx — the Darkroom's grid,
 * past its first page, and its moods.
 *
 * A later page that could not be read rolled the page back and the grid
 * simply ended: no word, and no way to ask again, since the end was already
 * reached. The moods were drawn without keys, and said "selected" as a word
 * rather than as the state a screen reader reports.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({ isConnected: true }),
  default: { addEventListener: () => () => {} },
}));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
jest.mock('@/src/components/darkroom/DarkroomHeader', () => ({ DarkroomHeader: () => null }));
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    discover: jest.fn(),
    search: jest.fn(),
    poster: (p: string, s: string) => `https://image.tmdb.org/t/p/${s}${p}`,
    profile: (p: string, s: string) => `https://image.tmdb.org/t/p/${s}${p}`,
  },
}));

// eslint-disable-next-line import/first
import DarkroomScreen from '@/app/(tabs)/darkroom';
// eslint-disable-next-line import/first
import { DarkroomMoodBar } from '../DarkroomMoodBar';
// eslint-disable-next-line import/first
import { MOODS } from '../constants';
// eslint-disable-next-line import/first
import { useDiscoverStore } from '@/src/stores/discover';

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
const away = () => Promise.reject(Object.assign(new Error('offline'), { name: 'TmdbUnreachable' }));
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((res) => setTimeout(res, 0)); };
const page = (n: number) => ({ results: [{ id: n, title: `Film ${n}`, poster_path: `/${n}.jpg`, release_date: '1927-01-01' }], total_pages: 3 });

beforeEach(() => {
  mockTmdb.discover.mockReset();
  useDiscoverStore.setState({ page: 1, query: '', inputVal: '', mood: null, accumulatedFilms: [] } as never);
});

it('a next batch that could not be read is said, and asked for again', async () => {
  // Page 1 always answers; page 2 fails once, then answers.
  let pageTwoAsked = 0;
  mockTmdb.discover.mockImplementation((p: Record<string, string>) => {
    if (p.page === '2') return ++pageTwoAsked === 1 ? away() : Promise.resolve(page(2));
    return Promise.resolve(page(1));
  });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<DarkroomScreen />); await settle(); });
  // As onEndReached does: the next page.
  await act(async () => { useDiscoverStore.getState().setPage(2); await settle(); });
  expect(r.getByText('THE NEXT BATCH COULD NOT BE DEVELOPED.')).toBeTruthy();
  expect(r.getAllByLabelText(/Film 1/).length).toBeGreaterThan(0);

  await act(async () => { fireEvent.press(r.getByLabelText('Develop the next batch again')); await settle(); });
  const asked = mockTmdb.discover.mock.calls.map(([p]: [Record<string, string>]) => p.page);
  expect(asked.filter((p: string) => p === '2')).toHaveLength(2);
  expect(r.queryByText('THE NEXT BATCH COULD NOT BE DEVELOPED.')).toBeNull();
  expect(r.getAllByLabelText(/Film 2/).length).toBeGreaterThan(0);
});

it('each mood is a button with its meaning, its choice a state, and a key of its own', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const r = render(<DarkroomMoodBar mood={MOODS[0]} handleSelectMood={() => {}} />);
  const chosen = r.getByRole('button', { name: 'Emotional mood. Heavy, profound stories' });
  expect(chosen.props.accessibilityState).toMatchObject({ selected: true });
  expect(r.getByRole('button', { name: 'Terrifying mood. Dark nightmares' }).props.accessibilityState).toMatchObject({ selected: false });
  expect(error.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('unique "key"'))).toEqual([]);
  error.mockRestore();
});
