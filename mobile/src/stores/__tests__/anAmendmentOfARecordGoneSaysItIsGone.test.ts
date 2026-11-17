/**
 * AN AMENDMENT OF A RECORD GONE SAYS IT IS GONE (review round 9, updateLogOp,
 * src/stores/domain/logSlice/helpers/logOperations.ts), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * An amendment is laid only over what it changed (keepLogEdit), which answers 'gone' for a record
 * deleted elsewhere since the sheet was opened and 'refused' for one a rule kept. The store read
 * neither: nothing was written, and the member heard "Record amended", the sheet sealed, the diary
 * holding the amendment of a record that is no longer anywhere. Now 'gone' throws LOG_GONE and the
 * record leaves the phone (never put back onto it); 'refused' throws LOG_REFUSED and the record is
 * put back as it was.
 */
import { AccessibilityInfo } from 'react-native';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { captureError } from '@/src/lib/sentry';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { LOG_GONE, LOG_REFUSED } from '@/src/stores/domain/logSlice/helpers/logOperations';
import { clearOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { mapLogRow } from '@/src/utils/mappers';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const READ = '2026-11-01T09:00:00.000000+00:00';

/** The record, as the house held it when the sheet was opened. */
const row = {
  id: LOG_ID, user_id: ME, film_id: 655, film_title: 'Paris, Texas', poster_path: '/p.jpg', year: '1984',
  rating: 4, review: 'The peep-show booth.', status: 'watched', watched_date: '2026-09-01',
  created_at: '2026-09-01T20:00:00Z', view_count: 1, viewing_history: [], updated_at: READ,
  viewing_id: '55555555-5555-4555-8555-555555555555',
};

const announced = () => (AccessibilityInfo.announceForAccessibility as jest.Mock).mock.calls.map(([m]) => m);
const amend = async () => {
  try { await useFilmStore.getState().updateLog(LOG_ID, { rating: 5 }); return null; } catch (e) { return e as { code?: string }; }
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  clearOfflineQueue(ME);
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  const held = mapLogRow(row as never);
  useFilmStore.setState({ logs: [held], _loggedIndex: { 655: held }, _updateLogMutex: false } as never);
});
afterEach(() => {
  clearOfflineQueue(ME);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, _updateLogMutex: false } as never);
});

it('a record deleted elsewhere: the amendment is refused as gone, the record leaves the phone, and nothing says "Record amended"', async () => {
  // Deleted from the website after the sheet was opened.
  mockHouse = supabaseFake({ rows: { logs: [] } });

  const thrown = await amend();

  expect(thrown?.code).toBe(LOG_GONE);
  expect(announced()).not.toContain('Record amended');
  // Gone from the diary and from the film's index: not put back as it was, nor kept as amended.
  expect(useFilmStore.getState().logs.map((l) => l.id)).toEqual([]);
  expect(useFilmStore.getState()._loggedIndex[655]).toBeUndefined();
  // An answer, not a fault; and not kept to be sent again.
  expect(captureError).not.toHaveBeenCalled();
  expect(getOfflineQueue()).toEqual([]);
  expect(mockHouse.rows('logs')).toEqual([]);
});

it('a record a rule keeps: the amendment is refused, the record stays as it was, and nothing says "Record amended"', async () => {
  // The house holds it unmoved, and its write matches no row (a policy kept it).
  mockHouse = supabaseFake({
    answer: { logs: (ask: Ask) => (ask.op === 'update' ? [] : [{ ...row }]) },
  });

  const thrown = await amend();

  expect(thrown?.code).toBe(LOG_REFUSED);
  expect(announced()).not.toContain('Record amended');
  // Put back as it was before the amendment, in the diary and in the film's index.
  const kept = useFilmStore.getState().logs;
  expect(kept.map((l) => [l.id, l.rating])).toEqual([[LOG_ID, 4]]);
  expect(useFilmStore.getState()._loggedIndex[655]?.rating).toBe(4);
  expect(getOfflineQueue()).toEqual([]);
});
