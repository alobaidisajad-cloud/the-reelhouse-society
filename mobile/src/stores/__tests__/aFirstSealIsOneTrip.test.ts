/**
 * aFirstSealIsOneTrip.test.ts — a film's first record, sealed with the member's ledger held, goes
 * to the house in one round trip (round 13), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * The seal asked the house first for an earlier record of the film, and only then inserted: two
 * trips in a row on every first seal, the sheet waiting on both. With the ledger held (every film
 * the member has logged is known on the phone), a film it does not hold was never logged, and the
 * insert goes at once; a record filed meanwhile on another phone is met by the insert's own
 * duplicate path, which files this seal as its rewatch. Until the ledger is known, the house is
 * still asked first. Either way, a seal filed as the rewatch of a record the phone held nowhere
 * leaves the film known as logged at once (it was known only at the next launch).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { clearOfflineQueue } from '@/src/utils/offlineQueue';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ME = '33333333-3333-4333-8333-333333333333';
const ELSEWHERE = '00000000-0000-4000-8000-000000000077';
/** A record of the film the member filed on another phone, after this phone read its ledger. */
const filedElsewhere = {
  id: ELSEWHERE, user_id: ME, film_id: 843, film_title: 'In the Mood for Love', poster_path: null, year: 2000,
  rating: 4, review: '', status: 'watched', watched_date: '2026-11-01', created_at: '2026-11-01T20:00:00Z',
  view_count: 1, viewing_history: [], viewing_id: '00000000-0000-4000-8000-000000000078',
};
const DUPLICATE = { code: '23505', message: 'duplicate key value violates unique constraint "logs_user_id_film_id_key"' };

/** Each viewing the house was asked to add to a record: a rewatch filed. */
const viewingsAdded: Record<string, unknown>[] = [];
const RPC = { log_viewing_add: (args: Record<string, unknown>) => { viewingsAdded.push(args); return args.p_viewing_id; } };

/** The trips the seal made to the logs table, in order. */
const logTrips = () => mockHouse.asked.filter((a) => a.table === 'logs').map((a) => a.op);

beforeEach(() => {
  viewingsAdded.length = 0;
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, _addLogMutex: false, marksKnown: 'held' } as never);
});
afterEach(() => {
  clearOfflineQueue(ME);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, marksKnown: 'unread' } as never);
});

it("a film's first record, the ledger held, is one trip to the house: the insert", async () => {
  mockHouse = supabaseFake({ rows: { logs: [] }, rpc: RPC });
  await useFilmStore.getState().addLog({ filmId: 843, title: 'In the Mood for Love', rating: 5, status: 'watched' });
  expect(logTrips()).toEqual(['insert']);
  expect(mockHouse.rows('logs').map((r) => r.film_id)).toEqual([843]);
  expect(useFilmStore.getState()._loggedIndex[843]).toBeDefined();
});

it('a record of the film filed meanwhile on another phone is met by the insert, and the seal is filed as its rewatch', async () => {
  // The insert meets the record filed elsewhere; every other ask is answered by the table as it stands.
  mockHouse = supabaseFake({ rows: { logs: [filedElsewhere] }, rpc: RPC, answer: { logs: (ask) => (ask.op === 'insert' ? DUPLICATE : (undefined as never)) } });
  await useFilmStore.getState().addLog({ filmId: 843, title: 'In the Mood for Love', rating: 5, status: 'watched' });
  const trips = logTrips();
  expect(trips[0]).toBe('insert');
  // One record of the film, the earlier one, now with this viewing on it.
  const held = mockHouse.rows('logs');
  expect(held.map((r) => r.id)).toEqual([ELSEWHERE]);
  expect(viewingsAdded.map((v) => v.p_log_id)).toEqual([ELSEWHERE]);
  // The film is known as logged at once, by the record it was filed on.
  expect(useFilmStore.getState()._loggedIndex[843]).toMatchObject({ id: ELSEWHERE, filmId: 843, viewCount: 2 });
});

it('with the ledger not yet known, the house is asked first, and a record of the film there is filed as its rewatch', async () => {
  useFilmStore.setState({ marksKnown: 'unread' } as never);
  mockHouse = supabaseFake({ rows: { logs: [filedElsewhere] }, rpc: RPC });
  await useFilmStore.getState().addLog({ filmId: 843, title: 'In the Mood for Love', rating: 5, status: 'watched' });
  const trips = logTrips();
  expect(trips[0]).toBe('select');
  expect(trips).not.toContain('insert');
  expect(mockHouse.rows('logs').map((r) => r.id)).toEqual([ELSEWHERE]);
  expect(viewingsAdded.map((v) => v.p_log_id)).toEqual([ELSEWHERE]);
  expect(useFilmStore.getState()._loggedIndex[843]).toMatchObject({ id: ELSEWHERE, filmId: 843, viewCount: 2 });
});
