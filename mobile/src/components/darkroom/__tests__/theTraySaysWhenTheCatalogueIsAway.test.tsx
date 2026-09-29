/**
 * theTraySaysWhenTheCatalogueIsAway.test.tsx — the Darkroom's grid, when the
 * catalogue could not be asked.
 *
 * With the phone online and the catalogue unreachable, the tray said "Nothing
 * surfaced in the tray. Adjust your filters to develop something new." and
 * offered RESET FILTERS: a member was sent to undo choices that were never the
 * problem. Now: the house's failed state, TRY AGAIN, and the films.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}), useFocusEffect: () => {},
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({ isConnected: true }),
  default: { addEventListener: () => () => {} },
}));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
// The header's own search and moods are not what is under test.
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
import { useDiscoverStore } from '@/src/stores/discover';

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
const away = () => Promise.reject(Object.assign(new Error('offline'), { name: 'TmdbUnreachable' }));
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); };

beforeEach(() => {
  mockTmdb.discover.mockReset();
  useDiscoverStore.setState({ page: 1, query: '', inputVal: '', mood: null, accumulatedFilms: [] } as never);
});

it('says the catalogue could not be reached — not "nothing surfaced", not RESET FILTERS', async () => {
  mockTmdb.discover.mockImplementation(away);
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<DarkroomScreen />); await settle(); });
  expect(r.getByText('Transmission Interrupted')).toBeTruthy();
  expect(r.queryByText('Nothing surfaced in the tray.')).toBeNull();
  expect(r.queryByLabelText('Reset all filters')).toBeNull();
});

it('TRY AGAIN asks again, and the films are developed', async () => {
  mockTmdb.discover
    .mockImplementationOnce(away)
    .mockResolvedValue({ results: [{ id: 1, title: 'Sunrise', poster_path: '/s.jpg', release_date: '1927-09-23' }], total_pages: 1 });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<DarkroomScreen />); await settle(); });
  await act(async () => { fireEvent.press(r.getByLabelText('Try again')); await settle(); });
  expect(mockTmdb.discover).toHaveBeenCalledTimes(2);
  expect(r.queryByText('Transmission Interrupted')).toBeNull();
  expect(r.getAllByLabelText(/Sunrise/).length).toBeGreaterThan(0);
});

it('a catalogue that answered with nothing is still "nothing surfaced"', async () => {
  mockTmdb.discover.mockResolvedValue({ results: [], total_pages: 1 });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<DarkroomScreen />); await settle(); });
  expect(r.getByText('Nothing surfaced in the tray.')).toBeTruthy();
  expect(r.queryByText('Transmission Interrupted')).toBeNull();
});
