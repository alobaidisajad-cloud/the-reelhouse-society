/**
 * roomSearchWiring.test.tsx — the fix reached the ROOMS, not just the component.
 *
 * The Ledger and the Watchlist each had a hand-rolled copy of the search box,
 * and the copies left autoCorrect, autoCapitalize and spellCheck ON — so iOS
 * could turn a film title into a different word and the room would answer
 * "nothing under that name" about a film the member owns.
 *
 * Swapping them to the shared <RoomSearch> is only a fix if the swapped rooms
 * really render it. A guard on RoomSearch alone would pass while a room kept
 * its copy; a source scan would pass while the wiring was wrong. So these mount
 * the actual rooms and read the props off the actual input.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

const film = (over: Record<string, unknown> = {}) => ({
  id: 'l1', filmId: 42, title: 'Stalker', poster: '/s.jpg',
  year: 1979, rating: 4, status: 'watched', ...over,
});

/** The Watchlist keeps its search row hidden until there are more than five. */
const SHELF = Array.from({ length: 6 }, (_, i) => film({ id: `l${i}`, filmId: 40 + i })) as never[];

const mount = async (node: React.ReactElement) => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(node); });
  return r;
};

const ROOMS = [
  {
    name: 'the Ledger',
    placeholder: 'Search the ledger…',
    load: () => require('../ProfileLedgerTab').default,
    setter: 'setLedgerSearch',
    props: (set: jest.Mock) => ({
      isSelf: true, ledgerSearch: '', setLedgerSearch: set,
      ledgerRatingFilter: 'all', setLedgerRatingFilter: jest.fn(),
      ledgerFiltered: SHELF, logs: SHELF,
      halfLifeMap: {}, groupByMonth: () => ({}),
    }),
  },
  {
    name: 'the Watchlist',
    placeholder: 'Search the queue…',
    load: () => require('../ProfileWatchlistTab').default,
    setter: 'setWatchlistSearch',
    props: (set: jest.Mock) => ({
      isSelf: true, watchlist: SHELF, watchlistSearch: '', setWatchlistSearch: set,
      watchlistSort: 'default', setWatchlistSort: jest.fn(),
      watchlistDecade: 'all', setWatchlistDecade: jest.fn(), decades: [],
      setRouletteOpen: jest.fn(),
      watchlistFiltered: SHELF, renderPosterCard: () => null,
    }),
  },
] as const;

describe.each(ROOMS)('$name search box', (room) => {
  const build = async () => {
    const set = jest.fn();
    // Each room takes a different prop shape, so the component is the loose
    // side here, not the props — spreading `never` is not a thing.
    const Room = room.load() as React.ComponentType<Record<string, unknown>>;
    const r = await mount(<Room {...room.props(set)} />);
    return { r, set };
  };

  it('renders the shared box', async () => {
    const { r } = await build();
    expect(r.getByPlaceholderText(room.placeholder)).toBeTruthy();
  });

  it('will not autocorrect a film title into a different word', async () => {
    // THE defect, checked on the room's own input rather than on RoomSearch.
    const { r } = await build();
    const input = r.getByPlaceholderText(room.placeholder);
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.spellCheck).toBe(false);
    expect(input.props.autoCapitalize).toBe('none');
  });

  it('still debounces what is typed, as the hand-rolled copy did', async () => {
    // The copies debounced by 300ms before touching the screen's state. Losing
    // that in the swap would put a filter pass on the JS thread per keystroke.
    jest.useFakeTimers();
    try {
      const { r, set } = await build();
      const input = r.getByPlaceholderText(room.placeholder);
      await act(async () => { fireEvent.changeText(input, 'nosferatu'); });
      expect(set).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(set).toHaveBeenCalledWith('nosferatu');
    } finally {
      jest.useRealTimers();
    }
  });

  it('offers a clear only once something is typed, and clearing empties it', async () => {
    jest.useFakeTimers();
    try {
      const { r, set } = await build();
      expect(r.queryByLabelText('Clear the search')).toBeNull();

      const input = r.getByPlaceholderText(room.placeholder);
      await act(async () => { fireEvent.changeText(input, 'ozu'); });

      const clear = r.getByLabelText('Clear the search');
      await act(async () => { fireEvent.press(clear); });
      expect(set).toHaveBeenCalledWith('');
    } finally {
      jest.useRealTimers();
    }
  });

  it('is announced to a screen reader', async () => {
    const { r } = await build();
    expect(r.getByPlaceholderText(room.placeholder).props.accessibilityLabel).toBeTruthy();
  });
});
