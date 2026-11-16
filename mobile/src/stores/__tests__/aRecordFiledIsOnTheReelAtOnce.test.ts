/**
 * aRecordFiledIsOnTheReelAtOnce.test.ts — review round 7 (addLogOp,
 * src/stores/domain/logSlice/helpers/logOperations.ts), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * A record amended or withdrawn told the Reel and the Lobby's wall; a record FILED told neither.
 * Coming back from the sheet is not a focus, so the Reel held its old pages until a pull, and the
 * new record was not on it. Now a record the house has filed asks the Reel's two feeds and the
 * wall again; one still queued offline is not there yet, and asks nothing.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { queryClient } from '@/src/lib/queryClient';
import { WALL_KEY } from '@/src/components/lobby/wallRead';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ME = '33333333-3333-4333-8333-333333333333';
const NETWORK = { message: 'Failed to fetch', code: '' };

const COMMUNITY = ['feed', 'community'];
const FOLLOWING = ['feed', 'following', ME];
const KEYS: readonly (readonly unknown[])[] = [COMMUNITY, FOLLOWING, WALL_KEY];
/** The Reel's two feeds and the wall, each as the phone holds it: read once, not yet asked again. */
const holdTheReelAndTheWall = () => {
  queryClient.setQueryData(COMMUNITY, { pages: [[]], pageParams: [undefined] });
  queryClient.setQueryData(FOLLOWING, { pages: [[]], pageParams: [undefined] });
  queryClient.setQueryData(WALL_KEY, { pieces: [] });
};
/** For each of the community Reel, the following Reel and the wall: whether it is to be read again. */
const askedAgain = () => KEYS.map((key) => !!queryClient.getQueryState(key)?.isInvalidated);

beforeEach(() => {
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, _addLogMutex: false } as never);
});
afterEach(() => {
  clearOfflineQueue(ME);
  queryClient.removeQueries({ queryKey: ['feed'] });
  queryClient.removeQueries({ queryKey: WALL_KEY });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
});

it('a record filed with no connection asks nothing of the Reel or the wall; one the house files is on both at once', async () => {
  // Queued offline: it is not on the house's Reel yet.
  holdTheReelAndTheWall();
  mockHouse = supabaseFake({ rows: { logs: [] }, fail: { logs: NETWORK } });
  await useFilmStore.getState().addLog({ filmId: 655, title: 'Paris, Texas', rating: 4, status: 'watched' });
  expect(getOfflineQueue().map((m) => m.type)).toEqual(['add_log']);
  expect(askedAgain()).toEqual([false, false, false]);

  // Filed by the house: the community Reel, the following Reel and the wall are each read again.
  clearOfflineQueue(ME);
  holdTheReelAndTheWall();
  mockHouse = supabaseFake({ rows: { logs: [] } });
  await useFilmStore.getState().addLog({ filmId: 843, title: 'In the Mood for Love', rating: 5, status: 'watched' });
  expect(mockHouse.rows('logs').map((r) => r.film_id)).toEqual([843]);
  expect(askedAgain()).toEqual([true, true, true]);
});
