/**
 * theFilmsVerdictIsReadAfterLogging.test.ts — round 11 (addLogOp in
 * src/stores/domain/logSlice/helpers/logOperations.ts, and the queue's replay of add_log in
 * src/utils/mutationExecutor.ts), against the house as strict as it is (test-utils/supabaseFake).
 *
 * A member logged a film from its page, gave it four reels and sealed it: their critique was in
 * the page's list at once, but the hero still said "THE HOUSE HAS NOT SPOKEN" (or the old average
 * and VOICES) for up to thirty minutes. The house moves the film's verdict with the record
 * (refresh_film_verdict), and the verdict rides the film's query, which an amendment, a rewatch and
 * a deletion each read again; a record filed did not. Now a record the house files has its film
 * read again; one queued offline is read again once the queue delivers it.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { queryClient } from '@/src/lib/queryClient';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { executeMutation } from '@/src/utils/mutationExecutor';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ME = '33333333-3333-4333-8333-333333333333';
const NETWORK = { message: 'Failed to fetch', code: '' };
const FILM = 843;

/** The film's page as the phone holds it: read once, the house not yet spoken on it. */
const holdTheFilmsPage = () => queryClient.setQueryData(['film', FILM], { detail: { id: FILM }, reviews: [], reviewsError: null, similar: [], verdict: null });
/** Whether the film's page is to be read again. */
const filmAskedAgain = () => !!queryClient.getQueryState(['film', FILM])?.isInvalidated;

beforeEach(() => {
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, _addLogMutex: false } as never);
  holdTheFilmsPage();
});
afterEach(() => {
  clearOfflineQueue(ME);
  queryClient.removeQueries({ queryKey: ['film'] });
  queryClient.removeQueries({ queryKey: ['feed'] });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
});

it('a record the house files has its film read again, the verdict with it', async () => {
  mockHouse = supabaseFake({ rows: { logs: [] } });
  await useFilmStore.getState().addLog({ filmId: FILM, title: 'In the Mood for Love', rating: 4, status: 'watched', review: 'Every corridor.' });
  expect(mockHouse.rows('logs').map((r) => r.film_id)).toEqual([FILM]);
  expect(filmAskedAgain()).toBe(true);
});

it('a record queued offline is not read for yet; once the queue delivers it, its film is read again', async () => {
  mockHouse = supabaseFake({ rows: { logs: [] }, fail: { logs: NETWORK } });
  await useFilmStore.getState().addLog({ filmId: FILM, title: 'In the Mood for Love', rating: 4, status: 'watched' });
  const queued = getOfflineQueue();
  expect(queued.map((m) => m.type)).toEqual(['add_log']);
  // The house has nothing yet: asking for the film again would only read the old verdict.
  expect(filmAskedAgain()).toBe(false);

  // The connection back, the queue sends it.
  mockHouse = supabaseFake({ rows: { logs: [] } });
  const sent = queued[0];
  expect(sent).toBeDefined();
  await executeMutation(sent!, {});
  expect(mockHouse.rows('logs').map((r) => r.film_id)).toEqual([FILM]);
  expect(filmAskedAgain()).toBe(true);
});
