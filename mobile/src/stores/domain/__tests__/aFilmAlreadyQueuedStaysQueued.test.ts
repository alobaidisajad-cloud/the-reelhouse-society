/**
 * aFilmAlreadyQueuedStaysQueued.test.ts — adding a film the watchlist already holds.
 *
 * The phone holds the watchlist a page at a time, so a film saved further down
 * is not in its copy, and its heart reads empty. Adding it met the database's
 * duplicate refusal (23505): the app said "Failed to add to watchlist", took
 * the film back off the screen, and offered to add it again — a film the
 * member could then neither add nor remove.
 */
import { create } from 'zustand';
import { createWatchlistSlice, type WatchlistSlice } from '../watchlistSlice';

let mockInsertError: unknown = null;
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: () => Promise.resolve({ error: mockInsertError }) }),
  },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: 'me' } }) } }));
jest.mock('@/src/stores/domain/helpers/sessionGuard', () => ({ stillSignedIn: () => true }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const mockToast = jest.requireMock('@/src/utils/reelToast').default as jest.Mock & { error: jest.Mock };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => { mockToast.mockClear(); mockToast.error.mockClear(); });

it('a film already on the watchlist stays on it, and is said to be', async () => {
  mockInsertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
  const s = create<WatchlistSlice>()((...a) => createWatchlistSlice(...a));
  await s.getState().addToWatchlist({ id: 19, title: 'Vertigo' });
  await settle();
  expect(s.getState()._watchlistIndex[19]).toBe(true);
  expect(mockToast.error).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('"Vertigo" is already on your watchlist.');
});

it('a real refusal still takes it back off, and says so', async () => {
  mockInsertError = { code: '42501', message: 'refused' };
  const s = create<WatchlistSlice>()((...a) => createWatchlistSlice(...a));
  await s.getState().addToWatchlist({ id: 20, title: 'Rope' });
  await settle();
  expect(s.getState()._watchlistIndex[20]).toBeUndefined();
  expect(mockToast.error).toHaveBeenCalledWith('Failed to add to watchlist.');
});
