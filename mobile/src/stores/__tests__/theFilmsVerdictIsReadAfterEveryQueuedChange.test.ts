/**
 * theFilmsVerdictIsReadAfterEveryQueuedChange.test.ts — round 11 (updateLogOp and removeLogOp in
 * src/stores/domain/logSlice/helpers/logOperations.ts, and executeMutation in
 * src/utils/mutationExecutor.ts), against the house as strict as it is (test-utils/supabaseFake).
 *
 * A record filed offline has its film read again once the queue delivers it (the house moves the
 * film's verdict with the record). A rewatch, an amendment or a removal made offline did not: their
 * queued replays named no film, and the film's page kept the old average and VOICES after the
 * queue had delivered them. Each now names its film as it is queued, and the film is read again
 * once it is delivered; one an older build queued, naming only its record, is matched to its film
 * by the record the phone holds.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { queryClient } from '@/src/lib/queryClient';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearOfflineQueue, getOfflineQueue, type QueuedMutation } from '@/src/utils/offlineQueue';
import { executeMutation } from '@/src/utils/mutationExecutor';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ME = '33333333-3333-4333-8333-333333333333';
const RECORD = '00000000-0000-4000-8000-000000000843';
const FIRST_VIEWING = '00000000-0000-4000-8000-0000000008a1';
const NETWORK = { message: 'Failed to fetch', code: '' };
const FILM = 843;

/** The member's record of the film, as the phone holds it: seen once. */
const RECORD_HELD = {
  id: RECORD, filmId: FILM, title: 'In the Mood for Love', rating: 3, review: '', status: 'watched',
  watchedDate: '2026-11-01T12:00:00Z', createdAt: '2026-11-01T12:00:00Z', viewCount: 1, viewingHistory: [],
  viewingId: FIRST_VIEWING, isSpoiler: false,
};
/** The record as the house holds it. */
const RECORD_ROW = { id: RECORD, user_id: ME, film_id: FILM, film_title: 'In the Mood for Love', rating: 3, watched_date: '2026-11-01' };

/** The film's page as the phone holds it, read and fresh. */
const holdTheFilmsPage = () => queryClient.setQueryData(['film', FILM], { detail: { id: FILM }, reviews: [], reviewsError: null, similar: [], verdict: null });
/** Whether the film's page is to be read again. */
const filmAskedAgain = () => !!queryClient.getQueryState(['film', FILM])?.isInvalidated;

/** The one thing queued, checked. */
function theQueued(): QueuedMutation {
  const queued = getOfflineQueue();
  expect(queued).toHaveLength(1);
  const sent = queued[0];
  expect(sent).toBeDefined();
  return sent!;
}

beforeEach(() => {
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [RECORD_HELD], _loggedIndex: { [FILM]: RECORD_HELD }, _addLogMutex: false, _updateLogMutex: false } as never);
});
afterEach(() => {
  clearOfflineQueue(ME);
  queryClient.removeQueries({ queryKey: ['film'] });
  queryClient.removeQueries({ queryKey: ['feed'] });
  queryClient.removeQueries({ queryKey: ['log'] });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
});

it('a rewatch made offline names its film, and the film is read again once the queue delivers it', async () => {
  mockHouse = supabaseFake({ rows: { logs: [] }, rpc: { log_viewing_add: { error: NETWORK } } });
  await useFilmStore.getState().addLog({ filmId: FILM, title: 'In the Mood for Love', rating: 5, status: 'watched' });
  const sent = theQueued();
  expect(sent.type).toBe('add_viewing');
  expect(sent.payload.film_id).toBe(FILM);

  holdTheFilmsPage();
  mockHouse = supabaseFake({ rpc: { log_viewing_add: 'new-viewing' } });
  await executeMutation(sent, {});
  expect(filmAskedAgain()).toBe(true);
});

it('an amendment made offline names its film, and the film is read again once the queue delivers it', async () => {
  mockHouse = supabaseFake({ fail: { logs: NETWORK } });
  await useFilmStore.getState().updateLog(RECORD, { rating: 5 });
  const sent = theQueued();
  expect(sent.type).toBe('update_log');
  expect(sent.payload.film_id).toBe(FILM);

  holdTheFilmsPage();
  mockHouse = supabaseFake({ rows: { logs: [{ ...RECORD_ROW }] } });
  // Delivered as written before edits carried what the member saw: the house takes it whole.
  await executeMutation({ ...sent, payload: { id: RECORD, user_id: ME, updates: { rating: 5 }, film_id: FILM } }, {});
  expect(mockHouse.rows('logs').map((r) => r.rating)).toEqual([5]);
  expect(filmAskedAgain()).toBe(true);
});

it('a removal made offline names its film, and the film is read again once the queue delivers it', async () => {
  mockHouse = supabaseFake({ fail: { logs: NETWORK } });
  await useFilmStore.getState().removeLog(RECORD, true);
  const sent = theQueued();
  expect(sent.type).toBe('remove_log');
  expect(sent.payload.film_id).toBe(FILM);

  holdTheFilmsPage();
  mockHouse = supabaseFake({ rows: { logs: [{ ...RECORD_ROW }] } });
  await executeMutation(sent, {});
  expect(mockHouse.rows('logs')).toEqual([]);
  expect(filmAskedAgain()).toBe(true);
});

it('an amendment an older build queued names only its record: its film is the one the phone holds it under', async () => {
  holdTheFilmsPage();
  mockHouse = supabaseFake({ rows: { logs: [{ ...RECORD_ROW }] } });
  await executeMutation({ type: 'update_log', payload: { id: RECORD, user_id: ME, updates: { rating: 4 } } } as unknown as QueuedMutation, {});
  expect(filmAskedAgain()).toBe(true);
});
