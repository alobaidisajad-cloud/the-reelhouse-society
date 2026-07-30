/**
 * Telemetry gating — EXECUTED, not read.
 *
 * Batch 2 added ~23 `if (!isNetworkError(e)) captureError(...)` lines across the
 * store layer. Not one of them was covered by a test: the suite mocked
 * `captureError` and never asserted on it, so every claim about this work
 * ("only genuine defects are reported", "offline members generate no noise",
 * "recovery still runs") rested on reading the diff.
 *
 * This drives the REAL slices with REAL error shapes through the REAL
 * isNetworkError, and asserts three things per path:
 *   1. a genuine defect IS reported, with the right scope
 *   2. an offline failure is NOT reported, and IS queued instead
 *   3. the recovery underneath the reporting call still runs either way
 *
 * (3) is the one that matters most: batch 2 put reporting ABOVE rollback, so a
 * throw there would cost the member their data. See src/lib/sentry.ts.
 */
import { useFilmStore } from '../films';
import { captureError } from '@/src/lib/sentry';
import { enqueueMutation } from '@/src/utils/offlineQueue';

/** Flipped per-test; the supabase mock returns whatever this holds. */
let mockDbError: unknown = null;
/** Flipped per-test; InteractionService rejects with whatever this holds. */
let mockEndorseError: unknown = null;

jest.mock('react-native', () => ({
    InteractionManager: { runAfterInteractions: jest.fn((cb: () => void) => cb()) },
    AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
    Platform: { OS: 'ios', select: jest.fn((o: Record<string, unknown>) => o.ios) },
    NativeModules: {},
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn() },
    AccessibilityInfo: { announceForAccessibility: jest.fn() },
}));
jest.mock('react-native-mmkv', () => ({
    MMKV: jest.fn().mockImplementation(() => ({
        getString: jest.fn(), set: jest.fn(), delete: jest.fn(),
        contains: jest.fn(() => false), getAllKeys: jest.fn(() => []),
    })),
}));
jest.mock('../mmkv-storage', () => ({
    storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn(), contains: jest.fn(() => false), getAllKeys: jest.fn(() => []), clearAll: jest.fn() },
    zustandMMKVStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
    createAsyncMMKVStorage: jest.fn(() => ({ getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() })),
    getSecureStorage: jest.fn().mockResolvedValue({ getString: jest.fn(), set: jest.fn(), delete: jest.fn(), contains: jest.fn(() => false) }),
}));

/** insert/delete resolve with mockDbError; everything else is inert. */
jest.mock('@/src/lib/supabase', () => {
    const result = () => Promise.resolve({ error: mockDbError, data: null });
    const chain: Record<string, unknown> = {};
    ['select', 'eq', 'order', 'limit', 'or', 'in'].forEach((m) => { chain[m] = jest.fn(() => chain); });
    chain.then = (res: (v: unknown) => unknown) => result().then(res);
    return {
        supabase: {
            from: jest.fn(() => ({
                ...chain,
                insert: jest.fn(() => result()),
                delete: jest.fn(() => chain),
                update: jest.fn(() => chain),
                upsert: jest.fn(() => result()),
            })),
            auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
        },
    };
});
jest.mock('../auth', () => ({
    useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1', username: 'cinephile', role: 'member' } })) },
}));
jest.mock('@/src/utils/reelToast', () => {
    const fn = jest.fn();
    (fn as unknown as { error: jest.Mock }).error = jest.fn();
    (fn as unknown as { success: jest.Mock }).success = jest.fn();
    return { __esModule: true, default: fn };
});
jest.mock('@/src/utils/offlineQueue', () => ({
    enqueueMutation: jest.fn(), getOfflineQueue: jest.fn(() => []), flushOfflineQueue: jest.fn(),
}));
jest.mock('@/src/lib/sentry', () => ({ addBreadcrumb: jest.fn(), captureError: jest.fn(), Sentry: { captureException: jest.fn() } }));
jest.mock('@/src/utils/imagePrefetcher', () => ({ ImagePrefetcher: { preloadFilmBatch: jest.fn() } }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { trending: jest.fn().mockResolvedValue({ results: [] }) } }));
jest.mock('@/src/services/InteractionService', () => ({
    InteractionService: {
        addEndorsement: jest.fn(() => Promise.reject(mockEndorseError)),
        removeEndorsement: jest.fn(() => Promise.reject(mockEndorseError)),
    },
}));
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn(() => Promise.resolve()) } }));

// NOTE: networkError is deliberately NOT mocked. The real classifier runs.

const FILM = { id: 550, title: 'Fight Club', poster_path: '/p.jpg', release_date: '1999-01-01' };
const GENUINE_DEFECT = { message: 'permission denied for table watchlists', code: '42501' };
const OFFLINE = { message: 'Network request failed' };

/** addToWatchlist returns before its write settles; the chain is parked here. */
const settle = async (filmId: number) => {
    const p = (useFilmStore.getState() as unknown as { _watchlistPromises: Record<number, Promise<void>> })._watchlistPromises[filmId];
    if (p) await p;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockDbError = null;
    mockEndorseError = null;
    useFilmStore.setState({ watchlist: [], _watchlistIndex: {}, _watchlistPromises: {} });
});

describe('watchlist add — a genuine defect', () => {
    beforeEach(() => { mockDbError = GENUINE_DEFECT; });

    it('IS reported, with the scope batch 2 claimed', async () => {
        await useFilmStore.getState().addToWatchlist(FILM);
        await settle(FILM.id);
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT,
            expect.objectContaining({ scope: 'watchlistSlice.addToWatchlist', filmId: 550 }),
        );
    });

    it('still rolls the optimistic film back OUT of the watchlist', async () => {
        await useFilmStore.getState().addToWatchlist(FILM);
        expect(useFilmStore.getState().watchlist).toHaveLength(1); // optimistic
        await settle(FILM.id);
        // The rollback sits BELOW the captureError call. If reporting ever threw,
        // this is the assertion that would catch the member's data being stranded.
        expect(useFilmStore.getState().watchlist).toHaveLength(0);
        expect(useFilmStore.getState()._watchlistIndex[550]).toBeUndefined();
    });

    it('is NOT queued for offline retry — it would fail again', async () => {
        await useFilmStore.getState().addToWatchlist(FILM);
        await settle(FILM.id);
        expect(enqueueMutation).not.toHaveBeenCalled();
    });
});

describe('watchlist add — an offline member', () => {
    beforeEach(() => { mockDbError = OFFLINE; });

    it('is NOT reported — this is the noise batch 2 set out to avoid', async () => {
        await useFilmStore.getState().addToWatchlist(FILM);
        await settle(FILM.id);
        expect(captureError).not.toHaveBeenCalled();
    });

    it('IS queued, and the film STAYS in the watchlist', async () => {
        await useFilmStore.getState().addToWatchlist(FILM);
        await settle(FILM.id);
        expect(enqueueMutation).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'add_watchlist' }),
        );
        expect(useFilmStore.getState().watchlist).toHaveLength(1);
    });
});

describe('watchlist remove — same two rules on the delete path', () => {
    beforeEach(() => {
        useFilmStore.setState({
            watchlist: [{ id: 550, title: 'Fight Club', poster: '/p.jpg', poster_path: '/p.jpg', year: 1999 }],
            _watchlistIndex: { 550: true }, _watchlistPromises: {},
        });
    });

    it('reports a genuine defect and restores the film', async () => {
        mockDbError = GENUINE_DEFECT;
        await useFilmStore.getState().removeFromWatchlist(550);
        await settle(550);
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT,
            expect.objectContaining({ scope: 'watchlistSlice.removeFromWatchlist', filmId: 550 }),
        );
        expect(useFilmStore.getState().watchlist).toHaveLength(1);
    });

    it('stays silent and queues when offline', async () => {
        mockDbError = OFFLINE;
        await useFilmStore.getState().removeFromWatchlist(550);
        await settle(550);
        expect(captureError).not.toHaveBeenCalled();
        expect(enqueueMutation).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'remove_watchlist' }),
        );
    });
});

describe('a clean write reports nothing at all', () => {
    it('no error means no telemetry and no queue', async () => {
        mockDbError = null;
        await useFilmStore.getState().addToWatchlist(FILM);
        await settle(FILM.id);
        expect(captureError).not.toHaveBeenCalled();
        expect(enqueueMutation).not.toHaveBeenCalled();
        expect(useFilmStore.getState().watchlist).toHaveLength(1);
    });
});

describe('endorsements — the 23505 rule batch 2 claimed but never proved', () => {
    const DUPLICATE = { code: '23505', message: 'duplicate key value violates unique constraint' };

    beforeEach(() => {
        useFilmStore.setState({ interactions: [], _endorsedIndex: {} });
    });

    it('a duplicate row is NOT reported — it is idempotent success, not a defect', async () => {
        mockEndorseError = DUPLICATE;
        await useFilmStore.getState().toggleEndorse('log-1');
        expect(captureError).not.toHaveBeenCalled();
    });

    it('and the certification STAYS applied, because the row does exist', async () => {
        mockEndorseError = DUPLICATE;
        await useFilmStore.getState().toggleEndorse('log-1');
        expect(useFilmStore.getState().hasEndorsed('log-1')).toBe(true);
    });

    it('a genuine failure IS reported with the endorsement scope', async () => {
        mockEndorseError = { code: '42501', message: 'permission denied' };
        await expect(useFilmStore.getState().toggleEndorse('log-2')).rejects.toBeDefined();
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ code: '42501' }),
            expect.objectContaining({ scope: 'interactionSlice.toggleEndorsement' }),
        );
    });

    it('an offline endorsement is silent and rolls nothing back', async () => {
        mockEndorseError = { message: 'Network request failed' };
        await useFilmStore.getState().toggleEndorse('log-3');
        expect(captureError).not.toHaveBeenCalled();
        expect(useFilmStore.getState().hasEndorsed('log-3')).toBe(true);
    });
});
