/**
 * theSheetIsDrawnWhileItIsRead.test.tsx — the Darkroom opens at its floor (P4.53).
 *
 * It kept each sheet on the phone and parsed it on every draw, then hid it behind the skeleton
 * until the archives answered; it drew the skeleton over a whole sheet while its next batch
 * developed; and it asked the archives twice on opening, once while the network's state was
 * unknown and again when it was learned, throwing the first answer away.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';

let mockConnected: boolean | null = true;
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useScrollToTop: jest.fn(), useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  useNetInfo: () => ({ isConnected: mockConnected }),
  default: { configure: () => {}, addEventListener: () => () => {} },
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
import { useDiscoverStore } from '@/src/stores/discover';

const { tmdb: mockTmdb } = jest.requireMock('@/src/lib/tmdb');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((res) => setTimeout(res, 0)); };
const page = (n: number) => ({ results: [{ id: n, title: `Film ${n}`, poster_path: `/${n}.jpg`, release_date: '1927-01-01' }], total_pages: 3 });
const never = () => new Promise(() => {});
const firstPagesAsked = () => mockTmdb.discover.mock.calls.filter(([p]: [Record<string, string>]) => p.page === '1').length;

beforeEach(() => {
  mockConnected = true;
  mockTmdb.discover.mockReset();
  useDiscoverStore.setState({ page: 1, query: '', inputVal: '', mood: null, accumulatedFilms: [] } as never);
});

it('draws the sheet it kept from a visit while the archives are asked again', async () => {
  mockTmdb.discover.mockResolvedValue(page(1));
  let first!: ReturnType<typeof render>;
  await act(async () => { first = render(<DarkroomScreen />); await settle(); });
  first.unmount();

  // The next visit: the archives have not answered yet, and the kept sheet is drawn.
  mockTmdb.discover.mockReset();
  mockTmdb.discover.mockImplementation(never);
  useDiscoverStore.setState({ page: 1, accumulatedFilms: [] } as never);
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<DarkroomScreen />); await settle(); });
  expect(mockTmdb.discover).toHaveBeenCalled();
  expect(r.getAllByLabelText(/Film 1/).length).toBeGreaterThan(0);
});

it('keeps the sheet whole while its next batch develops', async () => {
  mockTmdb.discover.mockImplementation((p: Record<string, string>) => (p.page === '2' ? never() : Promise.resolve(page(1))));
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<DarkroomScreen />); await settle(); });
  await act(async () => { useDiscoverStore.getState().setPage(2); await settle(); });
  expect(mockTmdb.discover.mock.calls.some(([p]: [Record<string, string>]) => p.page === '2')).toBe(true);
  expect(r.getAllByLabelText(/Film 1/).length).toBeGreaterThan(0);
});

it('asks the archives once on opening, though the network is first unknown and then learned', async () => {
  mockTmdb.discover.mockResolvedValue(page(1));
  mockConnected = null;
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<DarkroomScreen />); await settle(); });
  mockConnected = true;
  await act(async () => { r.rerender(<DarkroomScreen />); await settle(); });
  expect(firstPagesAsked()).toBe(1);
  // A return from offline asks again.
  mockConnected = false;
  await act(async () => { r.rerender(<DarkroomScreen />); await settle(); });
  const whileAway = firstPagesAsked();
  mockConnected = true;
  await act(async () => { r.rerender(<DarkroomScreen />); await settle(); });
  expect(firstPagesAsked()).toBe(whileAway + 1);
});
