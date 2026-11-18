/**
 * theLedgerIsReadOnceALaunch.test.ts — a member's marks are read in one trip, once a launch
 * (round 13), against the house as strict as it is (test-utils/supabaseFake).
 *
 * Every launch read the member's whole ledger again, a thousand rows a page, one page after
 * another: eleven trips in a row and some 3 MB for a record of 10,000 films, competing with the
 * Lobby's and the Reel's first reads. And the launch asked twice (the session's restore, then the
 * boot once RevenueCat answered): a short record, read whole before the second ask, was read again.
 * Now the house answers the ledger in one read (get_marks_ledger: each column one array), and a
 * ledger read a moment ago for the same member is not read again; a failed one is.
 */
import { act } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { LEDGER_FRESH_MS, readMarks, rowsOfLedger } from '@/src/stores/domain/marksLedger';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearOfflineQueue } from '@/src/utils/offlineQueue';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ME = '33333333-3333-4333-8333-333333333333';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NETWORK = { message: 'Failed to fetch', code: '' };

/** The house's answer for a record of `count` films, and how many times it was asked. */
let asked = 0;
const ledger = (count: number) => ({
  logs: {
    id: Array.from({ length: count }, (_, i) => uuid(i + 1)),
    film_id: Array.from({ length: count }, (_, i) => 1000 + i),
    film_title: Array.from({ length: count }, (_, i) => `Film ${i}`),
    poster_path: Array.from({ length: count }, () => null),
    year: Array.from({ length: count }, () => '1999'),
    status: Array.from({ length: count }, () => 'watched'),
    rating: Array.from({ length: count }, () => 4),
    view_count: Array.from({ length: count }, () => 1),
    watched_date: Array.from({ length: count }, () => '2026-11-01'),
  },
  saved: [7001, 7002],
});
const house = (answer: unknown) => {
  asked = 0;
  mockHouse = supabaseFake({ rpc: { get_marks_ledger: () => { asked += 1; return answer; } } });
};

let now = 1_000;
beforeEach(() => {
  now += 10 * LEDGER_FRESH_MS;
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [], watchlist: [], _loggedIndex: {}, _watchlistIndex: {}, marksKnown: 'unread' } as never);
});
afterEach(() => jest.restoreAllMocks());

it("a record of 10,000 films is read in one trip, every film known and kept", async () => {
  house(ledger(10_000));
  await act(async () => { await readMarks(); });
  expect(asked).toBe(1);
  const film = useFilmStore.getState();
  expect(film.marksKnown).toBe('held');
  expect(Object.keys(film._loggedIndex)).toHaveLength(10_000);
  expect(film._loggedIndex[1000]).toMatchObject({ id: uuid(1), filmId: 1000, title: 'Film 0', rating: 4, status: 'watched', viewCount: 1, watchedDate: '2026-11-01', light: true });
  expect(film._watchlistIndex).toEqual({ 7001: true, 7002: true });
});

it('the launch asks twice, the session then the boot: the ledger is read once', async () => {
  house(ledger(3));
  await act(async () => { await readMarks(); });
  now += 5_000;
  await act(async () => { await readMarks(); });
  expect(asked).toBe(1);
  expect(useFilmStore.getState().marksKnown).toBe('held');
});

it('read again once the moment has passed', async () => {
  house(ledger(3));
  await act(async () => { await readMarks(); });
  now += LEDGER_FRESH_MS;
  await act(async () => { await readMarks(); });
  expect(asked).toBe(2);
});

it('a ledger that could not be read is asked again at once, and then held', async () => {
  house({ error: NETWORK });
  await act(async () => { await readMarks(); });
  expect(useFilmStore.getState().marksKnown).toBe('failed');
  house(ledger(2));
  await act(async () => { await readMarks(); });
  expect([asked, useFilmStore.getState().marksKnown]).toEqual([1, 'held']);
});

it('a member signed out and in again a moment later has their ledger read for them', async () => {
  house(ledger(2));
  await act(async () => { await readMarks(); });
  // A sign-out clears the ledger; the member who signs in finds it unread.
  useFilmStore.setState({ _loggedIndex: {}, _watchlistIndex: {}, marksKnown: 'unread' } as never);
  await act(async () => { await readMarks(); });
  expect(asked).toBe(2);
  expect(Object.keys(useFilmStore.getState()._loggedIndex)).toHaveLength(2);
});

it('an answer out of shape is a ledger not read, never one with nothing in it', async () => {
  house({ logs: { id: [uuid(1)], film_id: [] }, saved: [] });
  await act(async () => { await readMarks(); });
  expect([useFilmStore.getState().marksKnown, useFilmStore.getState()._loggedIndex]).toEqual(['failed', {}]);
});

describe('rowsOfLedger', () => {
  it('lays the columns back into rows, one a log, the i-th of each column the same log', () => {
    const rows = rowsOfLedger(ledger(2));
    expect(rows).not.toBeNull();
    const second = rows!.logRows[1];
    expect(second).toBeDefined();
    expect(second).toEqual({ id: uuid(2), film_id: 1001, film_title: 'Film 1', poster_path: null, year: '1999', status: 'watched', rating: 4, view_count: 1, watched_date: '2026-11-01' });
    expect(rows!.watchRows).toEqual([{ film_id: 7001 }, { film_id: 7002 }]);
  });

  it('refuses an answer whose columns are not all as long as the ids, or are missing', () => {
    const short = ledger(2);
    short.logs.rating = [4];
    expect(rowsOfLedger(short)).toBeNull();
    const { status: _gone, ...noStatus } = ledger(1).logs;
    expect(rowsOfLedger({ logs: noStatus, saved: [] })).toBeNull();
    expect(rowsOfLedger({ logs: ledger(1).logs })).toBeNull();
    expect(rowsOfLedger(null)).toBeNull();
    expect(rowsOfLedger('[]')).toBeNull();
  });

  it('an empty record is an answer: nothing logged, nothing kept', () => {
    expect(rowsOfLedger({ ...ledger(0), saved: [] })).toEqual({ logRows: [], watchRows: [] });
  });
});
