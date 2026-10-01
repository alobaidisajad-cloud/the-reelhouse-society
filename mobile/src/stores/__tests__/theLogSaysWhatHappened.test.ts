/**
 * THE LOG SAYS WHAT HAPPENED — once, and truly. EXECUTED, not read.
 *
 * Filing, amending and removing a record each end in something the member is
 * TOLD: a screen-reader announcement (a success has no toast — the screen's
 * "RECORD SEALED" cannot be read by VoiceOver) or a toast (which is spoken on
 * both platforms). Batch 22 found that account wrong in five ways: a failure
 * announced as a success, an offline write announced as an archived one, a
 * rewatch announced as "Record amended", a removal narrated twice, a broken
 * statement filed as a duplicate. logScreenPolish.guard pinned each fix by
 * reading the CODE with regexes — fifteen edits in its life, most of them to
 * keep up with correct changes. This drives the real operations through every
 * path instead and listens to what the member hears.
 *
 *   heard  — every announceForAccessibility, in order
 *   shown  — every toast, in order (reelToast and its .error/.success)
 */
import { useFilmStore } from '../films';
import { LOG_BUSY } from '../domain/logSlice/helpers/logOperations';
import { enqueueMutation } from '@/src/utils/offlineQueue';
import reelToast from '@/src/utils/reelToast';
import { VaultService } from '@/src/services/VaultService';
import type { DomainLog } from '@/src/types';

const mockAnnounce = jest.fn();
jest.mock('react-native', () => ({
  InteractionManager: { runAfterInteractions: jest.fn((cb: () => void) => cb()) },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
  Platform: { OS: 'ios', select: jest.fn((o: Record<string, unknown>) => o.ios) },
  NativeModules: {},
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
  AccessibilityInfo: { announceForAccessibility: (m: string) => mockAnnounce(m) },
}));

/** Each database call takes the next answer from this queue. */
let mockDb: { data?: unknown; error?: unknown }[] = [];
jest.mock('@/src/lib/supabase', () => {
  const make = () => {
    const chain: Record<string, unknown> = {};
    ['select', 'eq', 'neq', 'order', 'limit', 'in', 'insert', 'delete', 'update', 'upsert', 'single', 'maybeSingle']
      .forEach((m) => { chain[m] = jest.fn(() => chain); });
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(mockDb.length ? mockDb.shift() : { data: null, error: null }).then(res, rej);
    return chain;
  };
  return { supabase: { from: jest.fn(() => make()), rpc: jest.fn(() => make()) } };
});
jest.mock('@/src/lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: jest.fn(), setQueryData: jest.fn(),
    getQueryData: jest.fn(() => undefined), cancelQueries: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1', username: 'cinephile', role: 'member', tier: 'free' } })) },
}));
jest.mock('@/src/utils/reelToast', () => {
  const fn = jest.fn();
  Object.assign(fn, { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), getOfflineQueue: jest.fn(() => []), flushOfflineQueue: jest.fn(),
}));
jest.mock('@/src/lib/sentry', () => ({ addBreadcrumb: jest.fn(), captureError: jest.fn(), Sentry: { captureException: jest.fn() } }));
jest.mock('@/src/services/VaultService', () => ({ VaultService: { addViewing: jest.fn(), removeViewing: jest.fn() } }));
jest.mock('@/src/stores/vaultStore', () => ({
  useVaultStore: { getState: () => ({ saveNote: jest.fn(async () => ({ queuedOffline: false })), forgetNote: jest.fn() }) },
}));
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn(() => Promise.resolve()) } }));
// networkError is NOT mocked: the real classifier decides what "offline" is.

const OFFLINE = { message: 'Network request failed' };
const DEFECT = { message: 'permission denied for table logs', code: '42501' };
const DUPLICATE = { message: 'duplicate key value violates unique constraint "logs_user_film"', code: '23505' };
// Reads "UNIQUE" — the old substring test filed this broken statement as a duplicate.
const NO_CONSTRAINT = { message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification', code: '42P10' };

const row = (o: Record<string, unknown> = {}) => ({
  id: 'log-1', viewing_id: 'v-1', user_id: 'u1', film_id: 550, film_title: 'Fight Club', rating: 4, review: '',
  status: 'watched', is_spoiler: false, watched_date: '2026-09-01', created_at: '2026-09-01T12:00:00Z',
  view_count: 1, viewing_history: [], ...o,
});
const FILM = { filmId: 550, title: 'Fight Club', rating: 4, status: 'watched' as const };

const heard = () => mockAnnounce.mock.calls.map(([m]) => m);
const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock };
const shown = () => [...toast.mock.calls, ...toast.error.mock.calls, ...toast.success.mock.calls].map(([m]) => m);
const store = () => useFilmStore.getState();
const settleThrow = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e; } };

/** A log already in the archive, as the store holds it. */
const held = (o: Partial<DomainLog> = {}): DomainLog => ({
  id: 'log-1', viewingId: 'v-1', filmId: 550, title: 'Fight Club', rating: 4, review: '', status: 'watched',
  watchedDate: '2026-09-01T12:00:00Z', createdAt: '2026-09-01T12:00:00Z', viewCount: 1, viewingHistory: [],
  ...o,
} as DomainLog);
const hold = (log: DomainLog) => useFilmStore.setState({ logs: [log], _loggedIndex: { [log.filmId!]: log } });

beforeEach(() => {
  jest.clearAllMocks();
  mockDb = [];
  useFilmStore.setState({ logs: [], _loggedIndex: {}, _addLogMutex: false, _updateLogMutex: false });
  (VaultService.addViewing as jest.Mock).mockResolvedValue('v-new');
  (VaultService.removeViewing as jest.Mock).mockResolvedValue('v-0');
});

describe('filing a record', () => {
  it('a success is announced once, as a success, and toasts nothing', async () => {
    mockDb = [{ data: [] }, { data: row() }]; // not logged before; the insert lands
    await store().addLog(FILM);
    expect(heard()).toEqual(['Film logged to your archive']);
    expect(shown()).toEqual([]);
  });

  it('a failure is never announced as a success — and the store adds no toast of its own', async () => {
    // The announcement used to sit in a `finally`, so VoiceOver said "Film
    // logged" at the moment the log FAILED. The caller shows the one toast.
    mockDb = [{ data: [] }, { data: null, error: DEFECT }];
    expect(await settleThrow(store().addLog(FILM))).toBe(DEFECT);
    expect(heard()).toEqual([]);
    expect(shown()).toEqual([]);
  });

  it('offline, it says it was queued — and never that the archive holds it', async () => {
    mockDb = [{ data: [] }, { data: null, error: OFFLINE }];
    await store().addLog(FILM);
    expect(shown()).toEqual(['Archived offline. Will sync when connected.']);
    expect(heard()).toEqual([]);
    expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'add_log' }));
  });

  it('a film already in the archive is a REWATCH, and is called one — not "Record amended"', async () => {
    hold(held());
    await store().addLog(FILM);
    expect(heard()).toEqual(['Rewatch added to your archive']);
    expect(shown()).toEqual([]);
  });

  it('a rewatch queued offline claims nothing — its step does not say "Saved offline" either', async () => {
    hold(held());
    (VaultService.addViewing as jest.Mock).mockRejectedValue(OFFLINE);
    await store().addLog(FILM);
    expect(heard()).toEqual([]);
    expect(shown()).not.toContain('Saved offline. Will sync when connected.');
    expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'add_viewing' }));
  });

  it('another device winning the race (a real duplicate key) is merged as a rewatch and announced as one', async () => {
    mockDb = [{ data: [] }, { data: null, error: DUPLICATE }, { data: [row()] }];
    await store().addLog(FILM);
    expect(heard()).toEqual(['Rewatch added to your archive']);
    expect(VaultService.addViewing).toHaveBeenCalledTimes(1);
  });

  it('a broken statement whose message merely says "unique" is a FAILURE, not a duplicate', async () => {
    // The server HAS a row to merge into, so a loose "duplicate" test would find
    // it and file this failure as a rewatch; the real one never asks.
    mockDb = [{ data: [] }, { data: null, error: NO_CONSTRAINT }, { data: [row()] }];
    expect(await settleThrow(store().addLog(FILM))).toBe(NO_CONSTRAINT);
    expect(VaultService.addViewing).not.toHaveBeenCalled();
    expect(heard()).toEqual([]);
  });

  it('a second press while the first is saving says "busy" as a CODE, and toasts nothing', async () => {
    useFilmStore.setState({ _addLogMutex: true });
    const e = await settleThrow(store().addLog(FILM)) as { code?: string };
    expect(e?.code).toBe(LOG_BUSY);
    expect(shown()).toEqual([]);
    expect(heard()).toEqual([]);
  });
});

describe('amending a record', () => {
  beforeEach(() => hold(held()));

  it('is confirmed aloud, as filing is — the same flow, the same seal', async () => {
    mockDb = [{ error: null }];
    await store().updateLog('log-1', { rating: 5 });
    expect(heard()).toEqual(['Record amended']);
    expect(shown()).toEqual([]);
  });

  it('offline, it says it was saved to send later — and does not claim it is amended', async () => {
    mockDb = [{ error: OFFLINE }];
    await store().updateLog('log-1', { rating: 5 });
    expect(shown()).toEqual(['Saved offline. Will sync when connected.']);
    expect(heard()).toEqual([]);
    expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'update_log' }));
  });

  it('a failure is not announced, not toasted here, and the edit is taken back', async () => {
    mockDb = [{ error: DEFECT }];
    expect(await settleThrow(store().updateLog('log-1', { rating: 5 }))).toBe(DEFECT);
    expect(heard()).toEqual([]);
    expect(shown()).toEqual([]);
    expect(store().logs[0].rating).toBe(4);
  });

  it('the store action keeps its void contract — the queued flag is for its own steps', async () => {
    mockDb = [{ error: null }];
    await expect(store().updateLog('log-1', { rating: 5 })).resolves.toBeUndefined();
  });

  it('a second edit while one is saving says "busy" as a code', async () => {
    useFilmStore.setState({ _updateLogMutex: true });
    const e = await settleThrow(store().updateLog('log-1', { rating: 5 })) as { code?: string };
    expect(e?.code).toBe(LOG_BUSY);
  });
});

describe('removing a record', () => {
  const rewatched = () => held({
    viewingId: 'v-2', viewCount: 2, status: 'rewatched',
    viewingHistory: [{ viewingId: 'v-1', date: '2026-01-01', rating: 3, review: '', status: 'watched' }] as DomainLog['viewingHistory'],
  });

  it('removing a rewatch says so ONCE, in the member\'s verb — never "Record amended" first', async () => {
    hold(rewatched());
    await store().removeLog('log-1');
    expect(shown()).toEqual(['Rewatch removed. Reverted to previous viewing.']);
    expect(heard()).toEqual([]);
    expect(VaultService.removeViewing).toHaveBeenCalledWith('log-1', 'v-2');
  });

  it('removing a rewatch offline says it will sync — once, not "Saved offline" as well', async () => {
    hold(rewatched());
    (VaultService.removeViewing as jest.Mock).mockRejectedValue(OFFLINE);
    await store().removeLog('log-1');
    expect(shown()).toEqual(['Rewatch removed offline. Will sync when connected.']);
    expect(heard()).toEqual([]);
  });

  it('a rewatch with no name for its viewing, and no signal to ask, is refused honestly', async () => {
    hold({ ...rewatched(), viewingId: undefined });
    mockDb = [{ data: null, error: OFFLINE }];
    await store().removeLog('log-1');
    expect(shown()).toEqual(['Removing a rewatch needs a connection.']);
    expect(VaultService.removeViewing).not.toHaveBeenCalled();
  });

  it('deleting a record toasts its title and announces nothing — the toast speaks', async () => {
    hold(held());
    mockDb = [{ error: null }];
    await store().removeLog('log-1');
    expect(shown()).toEqual(['"Fight Club" removed.']);
    expect(heard()).toEqual([]);
  });

  it('deleting offline says it was removed to send later', async () => {
    hold(held());
    mockDb = [{ error: OFFLINE }];
    await store().removeLog('log-1');
    expect(shown()).toEqual(['Removed offline. Will sync when connected.']);
    expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'remove_log' }));
  });

  it('a failed delete puts the record back and leaves the one toast to the caller', async () => {
    hold(held());
    mockDb = [{ error: DEFECT }];
    expect(await settleThrow(store().removeLog('log-1'))).toBe(DEFECT);
    expect(shown()).toEqual([]);
    expect(store().logs.map((l) => l.id)).toEqual(['log-1']);
  });
});

describe('the watchlist says what happened — once', () => {
  const FILM_W = { id: 550, title: 'Fight Club', poster_path: '/p.jpg', release_date: '1999-01-01' };
  /** The write runs behind a per-film queue; a no-op on the same key waits for it. */
  const settle = async () => {
    const { runWithMutex } = jest.requireActual('../domain/helpers/promiseMutex');
    await runWithMutex('watchlist:550', async () => {}).catch(() => {});
  };
  beforeEach(() => {
    useFilmStore.setState({ watchlist: [], _watchlistIndex: {} });
    jest.requireActual('../domain/helpers/promiseMutex').clearAllMutexes();
  });

  it('adding toasts the title and does not ALSO announce it — the toast is spoken', async () => {
    mockDb = [{ data: { id: 'w1' }, error: null }];
    await store().addToWatchlist(FILM_W);
    await settle();
    expect(shown()).toEqual(['"Fight Club" added to watchlist.']);
    expect(heard()).toEqual([]);
  });

  it('adding offline has no toast, so it is announced instead — once', async () => {
    mockDb = [{ data: null, error: OFFLINE }];
    await store().addToWatchlist(FILM_W);
    await settle();
    expect(heard()).toEqual(['Added to watchlist']);
    expect(shown()).toEqual([]);
  });

  it('removing is not silent while adding speaks', async () => {
    useFilmStore.setState({ watchlist: [{ id: 550, title: 'Fight Club' } as never], _watchlistIndex: { 550: true } as never });
    mockDb = [{ error: null }];
    await store().removeFromWatchlist(550);
    await settle();
    expect(heard()).toEqual(['Removed from watchlist']);
    expect(shown()).toEqual([]);
  });
});
