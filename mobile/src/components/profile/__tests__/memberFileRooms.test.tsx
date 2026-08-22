/**
 * memberFileRooms.test.tsx — the seven rooms, mounted.
 *
 * The names and the growth ceilings in these files were applied by SCRIPT, to
 * 24 files nobody had read. A script that inserts "into the first tag
 * containing X" can insert into the wrong tag, and neither the compiler nor a
 * source scan would notice: the label would be syntactically perfect and
 * attached to the wrong control.
 *
 * The only thing that can tell you is rendering it and reading what came out.
 * These do that — and they check the thing that matters most about a filter,
 * which is not its name but whether it announces that it is ON.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
// `jest.mock` factories are hoisted above every import, so the mock below
// still applies to this component.
import { ProfilePosterCard } from '../ProfilePosterCard';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

const film = (over: Record<string, unknown> = {}) => ({
  id: 'l1', filmId: 42, title: 'Stalker', poster: '/s.jpg',
  year: 1979, rating: 4, status: 'watched', ...over,
});

/**
 * Each room hides its filter header when the room is EMPTY — a sensible
 * design, and the reason four of these tests failed the first time against
 * code that was right. Every mount below gets something on the shelf.
 */
const ONE = [film()] as never[];
/**
 * The watchlist keeps its search and sort row hidden until there are more than
 * FIVE films — no point offering to sort three things. Anything testing that
 * row has to clear the room's own threshold.
 */
const SHELF = Array.from({ length: 6 }, (_, i) => film({ id: `l${i}`, filmId: 40 + i })) as never[];

const mount = async (node: React.ReactElement) => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(node); });
  return r;
};

describe('every film tile names the film it shows', () => {
  it('reads the title, the year and the rating', async () => {
    const r = await mount(<ProfilePosterCard item={film() as never} showRating />);
    expect(r.getByLabelText('Stalker, 1979, rated 4 of 5')).toBeTruthy();
  });

  it('omits the rating when the card is not showing one', async () => {
    // The label must describe what is ON the card, not what exists in the data
    // — announcing a rating that is not drawn is its own kind of lie.
    const r = await mount(<ProfilePosterCard item={film() as never} />);
    expect(r.getByLabelText('Stalker, 1979')).toBeTruthy();
  });

  it('says when a film was abandoned or rewatched, since the tile shows a badge', async () => {
    const r = await mount(<ProfilePosterCard item={film({ status: 'abandoned' }) as never} />);
    expect(r.getByLabelText('Stalker, 1979, abandoned')).toBeTruthy();
  });

  it('survives a film with no title, year or rating at all', async () => {
    const r = await mount(<ProfilePosterCard item={{ id: 'x', filmId: 1 } as never} />);
    expect(r.getByLabelText('Untitled film')).toBeTruthy();
  });

  it('tells you where the tap goes — the log, or the film', async () => {
    const toLog = await mount(<ProfilePosterCard item={film() as never} navigateToLog />);
    expect(toLog.getByLabelText(/Stalker/).props.accessibilityHint).toBe('Opens your log');
    const toFilm = await mount(<ProfilePosterCard item={film() as never} />);
    expect(toFilm.getByLabelText(/Stalker/).props.accessibilityHint).toBe('Opens the film');
  });

  it('is announced as a button, not as an image', async () => {
    const r = await mount(<ProfilePosterCard item={film() as never} />);
    expect(r.getByLabelText(/Stalker/).props.accessibilityRole).toBe('button');
  });
});

describe('a filter says whether it is ON, not just what it is called', () => {
  // The gap that mattered more than the missing names: a blind member could
  // hear every filter option and have no way to know the list in front of them
  // was already filtered.
  const selectedOf = (r: ReturnType<typeof render>, label: RegExp | string) =>
    r.getByLabelText(label).props.accessibilityState?.selected;

  it('the archive sieve marks the active one and only that one', async () => {
    const ProfileArchiveTab = require('../ProfileArchiveTab').default;
    const props = {
      logs: ONE, isSelf: true, archiveSieve: 'all', setArchiveSieve: jest.fn(),
      archiveFiltered: ONE, renderPosterCard: () => null,
      groupByMonth: () => ({}), POSTER_COL_4: 100,
    };
    const r = await mount(<ProfileArchiveTab {...props} />);
    const chips = r.queryAllByLabelText(/^Filter the archive by /);
    expect(chips.length).toBeGreaterThan(1);
    const on = chips.filter((c) => c.props.accessibilityState?.selected);
    expect(on).toHaveLength(1);
  });

  it('and moves the mark when a different sieve is active', async () => {
    const ProfileArchiveTab = require('../ProfileArchiveTab').default;
    const base = {
      logs: ONE, isSelf: true, setArchiveSieve: jest.fn(),
      archiveFiltered: ONE, renderPosterCard: () => null,
      groupByMonth: () => ({}), POSTER_COL_4: 100,
    };
    const a = await mount(<ProfileArchiveTab {...base} archiveSieve="all" />);
    const first = a.queryAllByLabelText(/^Filter the archive by /)
      .findIndex((c) => c.props.accessibilityState?.selected);

    const b = await mount(<ProfileArchiveTab {...base} archiveSieve="rewatched" />);
    const second = b.queryAllByLabelText(/^Filter the archive by /)
      .findIndex((c) => c.props.accessibilityState?.selected);

    // If the state were hard-wired rather than derived, both would be the same
    // chip and this test would be the only thing that noticed.
    expect(second).not.toBe(first);
    expect(second).toBeGreaterThan(-1);
  });

  it('the watchlist sort marks exactly one', async () => {
    const ProfileWatchlistTab = require('../ProfileWatchlistTab').default;
    const props = {
      isSelf: true, watchlist: SHELF, watchlistSearch: '', setWatchlistSearch: jest.fn(),
      watchlistSort: 'az' as const, setWatchlistSort: jest.fn(),
      setRouletteOpen: jest.fn(),
      watchlistFiltered: SHELF, renderPosterCard: () => null, POSTER_COL_3: 100,
    };
    const r = await mount(<ProfileWatchlistTab {...(props as any)} />);
    const chips = r.queryAllByLabelText(/^Sort the queue: /);
    expect(chips.length).toBe(3);
    expect(chips.filter((c) => c.props.accessibilityState?.selected)).toHaveLength(1);
    expect(selectedOf(r, 'Sort the queue: A–Z')).toBe(true);
    expect(selectedOf(r, 'Sort the queue: RECENT')).toBe(false);
  });

  it('the ledger rating filter names the rating rather than reading out stars', async () => {
    // These chips draw reel IMAGES for 1–5, so before this they announced
    // nothing at all for every option except "ALL".
    const ProfileLedgerTab = require('../ProfileLedgerTab').default;
    const props = {
      isSelf: true, ledgerSearch: '', setLedgerSearch: jest.fn(),
      ledgerRatingFilter: 3 as const, setLedgerRatingFilter: jest.fn(),
      ledgerFiltered: SHELF, logs: SHELF, renderPosterCard: () => null,
      halfLifeMap: {}, groupByMonth: () => ({}), POSTER_COL_4: 100,
    };
    const r = await mount(<ProfileLedgerTab {...(props as any)} />);
    expect(r.getByLabelText('Show every rating')).toBeTruthy();
    expect(selectedOf(r, 'Show entries rated 3 of 5')).toBe(true);
    expect(selectedOf(r, 'Show entries rated 5 of 5')).toBe(false);
  });
});
