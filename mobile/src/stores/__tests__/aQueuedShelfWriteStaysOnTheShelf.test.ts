/**
 * aQueuedShelfWriteStaysOnTheShelf.test.ts — a shelf read again keeps the member's writes still queued.
 *
 * An entry filed, taken off or changed offline waits in the queue. The shelf showed it at once, but
 * a read of the shelf again (the profile reopened, a pull, a relaunch) laid the house's page over it:
 * an entry filed offline vanished, one taken off came back, a change was undone, all while the write
 * still waited to be sent.
 */
import { supabase } from '../../lib/supabase';
import { useFilmStore } from '../films';

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ user: { id: 'u1', username: 'vesper', role: 'archivist' } })),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

let mockQueue: { type: string; payload: Record<string, unknown>; timestamp: number }[] = [];
jest.mock('../../utils/offlineQueue', () => ({ getOfflineQueue: () => mockQueue, enqueueMutation: jest.fn(() => true) }));

/** The shelf's read, answered with these rows. */
function answering(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit', 'or']) chain[k] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  (supabase.from as unknown) = jest.fn(() => chain);
}

const row = (filmId: number, over: Record<string, unknown> = {}) => ({
  id: `r${filmId}`, user_id: 'u1', film_id: filmId, film_title: `Film ${filmId}`, poster_path: null, year: 1950,
  formats: ['DVD'], notes: '', condition: 'good', created_at: '2026-11-01T00:00:00Z', ...over,
});

beforeEach(() => {
  mockQueue = [];
  useFilmStore.setState({ physicalArchive: [], _fetchingArchive: false, archiveHasMore: false } as never);
});

const shelf = () => useFilmStore.getState().physicalArchive.map((i) => ({ filmId: i.filmId, formats: i.formats, notes: i.notes }));

describe('a shelf read again', () => {
  it('keeps an entry filed offline, keeps one taken off away, and keeps a change made, while each waits', async () => {
    mockQueue = [
      { type: 'add_archive', timestamp: 1, payload: { user_id: 'u1', film_id: 9, film_title: 'Late Spring', poster_path: null, year: 1949, formats: ['Blu-ray'] } },
      { type: 'remove_archive', timestamp: 2, payload: { user_id: 'u1', film_id: 2 } },
      { type: 'update_archive', timestamp: 3, payload: { user_id: 'u1', film_id: 3, updates: { notes: 'Criterion spine 11' } } },
      // Another member's, left on this phone: never laid on this shelf.
      { type: 'add_archive', timestamp: 4, payload: { user_id: 'u2', film_id: 7, film_title: 'Not mine', formats: ['VHS'] } },
    ];
    answering([row(2), row(3)]);
    await expect(useFilmStore.getState().fetchPhysicalArchive()).resolves.toBe(true);
    expect(shelf()).toEqual([
      { filmId: 9, formats: ['Blu-ray'], notes: '' },
      { filmId: 3, formats: ['DVD'], notes: 'Criterion spine 11' },
    ]);
  });

  it('adds a queued format to an entry the house holds, and lays it in the order the member made it', async () => {
    mockQueue = [
      { type: 'remove_archive', timestamp: 1, payload: { user_id: 'u1', film_id: 4 } },
      { type: 'add_archive', timestamp: 2, payload: { user_id: 'u1', film_id: 4, film_title: 'Film 4', formats: ['4K'] } },
      { type: 'add_archive', timestamp: 3, payload: { user_id: 'u1', film_id: 5, film_title: 'Film 5', formats: ['VHS'] } },
    ];
    answering([row(4), row(5)]);
    await useFilmStore.getState().fetchPhysicalArchive();
    // Taken off, then filed again: on the shelf, as filed. Film 5 gains the format.
    expect(shelf()).toEqual([
      { filmId: 4, formats: ['4K'], notes: '' },
      { filmId: 5, formats: ['DVD', 'VHS'], notes: '' },
    ]);
  });

  it('a later page drops an entry taken off and never repeats one the shelf already shows', async () => {
    useFilmStore.setState({ physicalArchive: [{ id: '-1', filmId: 9, title: 'Late Spring', poster: null, formats: ['Blu-ray'] }], archiveHasMore: true } as never);
    mockQueue = [{ type: 'remove_archive', timestamp: 1, payload: { user_id: 'u1', film_id: 6 } }];
    answering([row(9), row(6), row(8)]);
    await useFilmStore.getState().fetchPhysicalArchive(undefined, true);
    expect(shelf().map((i) => i.filmId)).toEqual([9, 8]);
  });
});
