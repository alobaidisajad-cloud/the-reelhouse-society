/**
 * theLedgerIsKnownWhole.test.ts — readMarks (src/stores/domain/marksLedger.ts) against the house
 * as strict as it is (test-utils/supabaseFake), and the store around it.
 *
 * The phone knew a member's marks from the pages it had read: fifty logs, and only once they
 * opened their own file. A film logged before them was NOT YET SEEN, LOG THIS FILM filed it a
 * second viewing, a director's canon was counted short. The ledger is read whole:
 *   - every log and every save, past a page of a thousand, and then it is held;
 *   - a read that failed is said as failed, and a ledger held stays held;
 *   - a page read later is laid over the ledger, never in place of it;
 *   - the writes still queued offline are laid over it as they will land;
 *   - a read that outlived its member lands nowhere;
 *   - its light records are never handed to the editor, and a film saved before the pages
 *     can be taken off;
 *   - it is kept on the phone once held, and read back as held.
 */
import { act } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { readMarks } from '@/src/stores/domain/marksLedger';
import { ledgerFromDisk, ledgerToDisk } from '@/src/stores/domain/marksDisk';
import { heldLog } from '@/src/stores/domain/logSlice/helpers/logOperations';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearOfflineQueue, enqueueMutation } from '@/src/utils/offlineQueue';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = '77777777-7777-4777-8777-777777777777';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NETWORK = { message: 'Failed to fetch', code: '' };

/** A log of the member's, as the house holds it. */
const logRow = (n: number, owner = ME) => ({
  id: uuid(n), user_id: owner, film_id: 1000 + n, film_title: `Film ${n}`, poster_path: null, year: '1999',
  rating: 3, review: 'Words the ledger never carries.', status: 'watched', watched_date: '2024-01-01',
  created_at: '2024-01-01T00:00:00Z', view_count: 1, viewing_history: [], viewing_id: uuid(900000 + n),
});
const saveRow = (n: number, owner = ME) => ({
  id: uuid(500000 + n), user_id: owner, film_id: 2000 + n, film_title: `Saved ${n}`, created_at: '2024-01-01T00:00:00Z',
});

const house = (logs: Record<string, unknown>[], saves: Record<string, unknown>[], fail?: Record<string, typeof NETWORK>) => {
  mockHouse = supabaseFake({ rows: { logs, watchlists: saves }, fail });
};
const film = () => useFilmStore.getState();

beforeEach(() => {
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [], watchlist: [], _loggedIndex: {}, _watchlistIndex: {}, marksKnown: 'unread' } as never);
});

it('reads every log and every save, past a page of a thousand, and then holds them', async () => {
  house([...Array.from({ length: 1001 }, (_, i) => logRow(i + 1)), logRow(5000, OTHER)], [saveRow(1), saveRow(2, OTHER)]);
  await act(async () => { await readMarks(); });
  expect(film().marksKnown).toBe('held');
  expect(Object.keys(film()._loggedIndex)).toHaveLength(1001);
  expect(film()._loggedIndex[2001]).toMatchObject({ id: uuid(1001), status: 'watched', rating: 3, light: true });
  expect(film()._loggedIndex[2001]?.review).toBeUndefined();
  expect(film()._loggedIndex[6000]).toBeUndefined();
  expect(film()._watchlistIndex).toEqual({ 2001: true });
});

it('says a read that failed as failed, never as "nothing logged", and keeps a ledger held', async () => {
  house([logRow(1)], [], { logs: NETWORK });
  await act(async () => { await readMarks(); });
  expect(film().marksKnown).toBe('failed');
  house([logRow(1)], []);
  await act(async () => { await readMarks(); });
  expect(film().marksKnown).toBe('held');
  house([], [], { watchlists: NETWORK });
  await act(async () => { await readMarks(); });
  expect([film().marksKnown, !!film()._loggedIndex[1001]]).toEqual(['held', true]);
});

it('lays a page read later over the ledger, never in its place', async () => {
  house([logRow(1), logRow(2)], [saveRow(1), saveRow(2)]);
  await act(async () => { await readMarks(); });
  // The newest page holds only the second of each.
  house([logRow(2)], [saveRow(2)]);
  await act(async () => { await film().fetchLogs(); await film().fetchWatchlist(); });
  expect(Object.keys(film()._loggedIndex).sort()).toEqual(['1001', '1002']);
  expect(film()._loggedIndex[1002]?.light).toBeUndefined();
  expect(film()._watchlistIndex).toEqual({ 2001: true, 2002: true });
});

it('lays the writes still queued offline over what it read, as they will land', async () => {
  enqueueMutation({ type: 'remove_log', payload: { log_id: uuid(1), user_id: ME } } as never);
  enqueueMutation({ type: 'add_watchlist', payload: { user_id: ME, film_id: 3000 } } as never);
  enqueueMutation({ type: 'remove_watchlist', payload: { user_id: ME, film_id: 2001 } } as never);
  house([logRow(1), logRow(2)], [saveRow(1)]);
  await act(async () => { await readMarks(); });
  expect(Object.keys(film()._loggedIndex)).toEqual(['1002']);
  expect(film()._watchlistIndex).toEqual({ 3000: true });
});

it('lands nowhere when its member left while it read', async () => {
  house([logRow(1)], []);
  const read = readMarks();
  await act(async () => { useAuthStore.setState({ user: null, isAuthenticated: false } as never); await read; });
  expect([film().marksKnown, film()._loggedIndex]).toEqual(['unread', {}]);
});

it('never hands its light record to the editor; a film saved before the pages comes off', async () => {
  house([logRow(1)], [saveRow(1)]);
  await act(async () => { await readMarks(); });
  expect(heldLog(film(), uuid(1))).toBeUndefined();
  await act(async () => { await film().removeFromWatchlist(2001); await new Promise((res) => setTimeout(res, 0)); });
  expect([film()._watchlistIndex, mockHouse.rows('watchlists')]).toEqual([{}, []]);
});

it('is kept on the phone once held, and read back as it was', () => {
  expect(ledgerToDisk({ marksKnown: 'failed', _loggedIndex: {}, _watchlistIndex: {} })).toBeNull();
  const page = { id: uuid(2), filmId: 1002, title: 'Film 2', rating: 5, status: 'watched', review: 'Mine.' } as never;
  const disk = ledgerToDisk({
    marksKnown: 'held',
    _loggedIndex: { 1001: { id: uuid(1), filmId: 1001, title: 'Film 1', rating: 3, status: 'watched', review: 'Never kept.' } as never },
    _watchlistIndex: { 2001: true },
  });
  expect(JSON.stringify(disk)).not.toContain('Never kept.');
  const back = ledgerFromDisk(disk!, [page], [{ id: 2009 }]);
  expect(back._loggedIndex[1001]).toMatchObject({ id: uuid(1), light: true });
  expect(back._loggedIndex[1002]).toBe(page);
  expect(back._watchlistIndex).toEqual({ 2001: true, 2009: true });
});
