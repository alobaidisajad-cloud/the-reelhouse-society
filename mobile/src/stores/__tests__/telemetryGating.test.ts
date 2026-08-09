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
import { clearAllMutexes, runWithMutex } from '../domain/helpers/promiseMutex';
import { captureError } from '@/src/lib/sentry';
import { enqueueMutation } from '@/src/utils/offlineQueue';
import { followUser, unfollowUser, hydrateFollowing } from '../domain/socialSlice';

/** Flipped per-test; the supabase mock returns whatever this holds. */
let mockDbError: unknown = null;
let mockDbData: unknown = null;
let mockDbQueue: { data: unknown; error: unknown }[] = [];
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

/**
 * Every builder method returns the same thenable chain, so ANY call shape the
 * slices use — .insert(), .delete().eq().eq(), .update().eq(), .upsert().select(),
 * .rpc() — resolves to { data: mockDbData, error: mockDbError }.
 */
jest.mock('@/src/lib/supabase', () => {
    const make = () => {
        const chain: Record<string, unknown> = {};
        ['select', 'eq', 'neq', 'order', 'limit', 'or', 'in', 'insert', 'delete',
            'update', 'upsert', 'single', 'maybeSingle'].forEach((m) => { chain[m] = jest.fn(() => chain); });
        chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
            // A queued response wins, so multi-step flows (resolve profile →
            // check existing → write) can be steered call by call.
            const next = mockDbQueue.length ? mockDbQueue.shift() : { data: mockDbData, error: mockDbError };
            return Promise.resolve(next).then(res, rej);
        };
        return chain;
    };
    return {
        supabase: {
            from: jest.fn(() => make()),
            rpc: jest.fn(() => make()),
            auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
        },
    };
});
jest.mock('@/src/lib/queryClient', () => ({
    queryClient: {
        invalidateQueries: jest.fn(), setQueryData: jest.fn(),
        getQueryData: jest.fn(() => undefined), cancelQueries: jest.fn(() => Promise.resolve()),
    },
}));
// tier matters: the physical-archive writes are gated on isArchivistPlusTier,
// so a plain member never reaches supabase and would fake a passing test.
jest.mock('../auth', () => ({
    useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1', username: 'cinephile', role: 'member', tier: 'auteur' } })) },
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
jest.mock('../followStore', () => ({
    useSocialStore: {
        getState: jest.fn(() => ({
            isFollowing: () => false,
            isRequested: () => false,
            addFollowing: jest.fn(),
            addRequested: jest.fn(),
            removeFollowing: jest.fn(),
            removeRequested: jest.fn(),
            persistFollowing: jest.fn(),
            following: [],
            requested: [],
            setFollowing: jest.fn(),
            setRequested: jest.fn(),
        })),
    },
}));
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn(() => Promise.resolve()) } }));

// NOTE: networkError is deliberately NOT mocked. The real classifier runs.

const FILM = { id: 550, title: 'Fight Club', poster_path: '/p.jpg', release_date: '1999-01-01' };
const GENUINE_DEFECT = { message: 'permission denied for table watchlists', code: '42501' };
const OFFLINE = { message: 'Network request failed' };

/**
 * deleteList and removeLog RETHROW after rolling back, by design, so the caller
 * can react. We are asserting on telemetry and rollback, not on the throw, so
 * swallow it here rather than let it fail the test as an unhandled rejection.
 */
const attempt = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { /* rethrown by design — see above */ }
};

/**
 * addToWatchlist returns before its write settles, so tests have to wait for it.
 *
 * This used to reach into `_watchlistPromises` in store state. That map now
 * lives in the shared mutex helper and deletes its own entries, so instead we
 * queue a no-op on the SAME key: the queue is FIFO, so it cannot run until the
 * real write has settled. That waits through the actual ordering guarantee
 * rather than around it, and it works whether or not the entry still exists.
 */
const settle = async (filmId: number) => {
    await runWithMutex(`watchlist:${filmId}`, async () => {}).catch(() => {});
};

beforeEach(() => {
    jest.clearAllMocks();
    mockDbError = null;
    mockDbData = null;
    mockEndorseError = null;
    mockDbQueue = [];
    // The queued-write chain moved out of store state into a shared module map,
    // so isolating tests from each other means clearing that instead. Same
    // intent as the `_watchlistPromises: {}` this replaces: no test inherits a
    // pending promise from the one before it.
    useFilmStore.setState({ watchlist: [], _watchlistIndex: {} });
    clearAllMutexes();
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
            _watchlistIndex: { 550: true },
        });
        clearAllMutexes();
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

// ── The remaining sites, driven the same way ────────────────────────────────

describe('physical archive — all three write paths', () => {
    const FILM_IN = { id: 550, title: 'Fight Club', poster_path: '/p.jpg', release_date: '1999-01-01' };

    // Seeded, NOT empty: removeFromPhysicalArchive early-returns when the item
    // is absent, so an empty archive makes the "stays silent" assertions pass
    // for the wrong reason — nothing runs at all.
    beforeEach(() => {
        useFilmStore.setState({
            physicalArchive: [{ id: 'pa-1', filmId: 550, title: 'Fight Club', poster: '/p.jpg', formats: ['4K'] }],
        } as never);
    });

    it('addToPhysicalArchive reports a genuine defect', async () => {
        mockDbError = GENUINE_DEFECT;
        await useFilmStore.getState().addToPhysicalArchive(FILM_IN, ['4K']);
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'archiveSlice.addToPhysicalArchive' }),
        );
    });

    it('addToPhysicalArchive stays silent and queues when offline', async () => {
        mockDbError = OFFLINE;
        await useFilmStore.getState().addToPhysicalArchive(FILM_IN, ['4K']);
        expect(captureError).not.toHaveBeenCalled();
        expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'add_archive' }));
    });

    it('removeFromPhysicalArchive reports a genuine defect', async () => {
        mockDbError = GENUINE_DEFECT;
        await useFilmStore.getState().removeFromPhysicalArchive(550);
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'archiveSlice.removeFromPhysicalArchive' }),
        );
    });

    it('removeFromPhysicalArchive stays silent when offline', async () => {
        mockDbError = OFFLINE;
        await useFilmStore.getState().removeFromPhysicalArchive(550);
        expect(captureError).not.toHaveBeenCalled();
    });

    it('updatePhysicalArchiveItem reports a genuine defect', async () => {
        mockDbError = GENUINE_DEFECT;
        await useFilmStore.getState().updatePhysicalArchiveItem(550, { condition: 'Mint' });
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'archiveSlice.updatePhysicalArchiveItem' }),
        );
    });

    it('updatePhysicalArchiveItem stays silent when offline', async () => {
        mockDbError = OFFLINE;
        await useFilmStore.getState().updatePhysicalArchiveItem(550, { condition: 'Mint' });
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('lists — the RPC path and the item path', () => {
    const LIST = {
        id: 'list-1', title: 'Noir', description: '', isRanked: false, isPrivate: false,
        createdAt: '2026-01-01T00:00:00Z', userId: 'u1', films: [],
    };

    beforeEach(() => { useFilmStore.setState({ lists: [LIST] } as never); });

    it('deleteList reports a genuine defect from the cascade RPC', async () => {
        mockDbError = GENUINE_DEFECT;
        await attempt(() => useFilmStore.getState().deleteList('list-1'));
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'listSlice.deleteList' }),
        );
    });

    it('deleteList stays silent and queues when offline', async () => {
        mockDbError = OFFLINE;
        await attempt(() => useFilmStore.getState().deleteList('list-1'));
        expect(captureError).not.toHaveBeenCalled();
        expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'delete_list' }));
    });

    it('addFilmToList reports a genuine defect', async () => {
        mockDbError = GENUINE_DEFECT;
        await useFilmStore.getState().addFilmToList('list-1', { id: 550, title: 'Fight Club' });
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'listSlice.addFilmToList' }),
        );
    });

    it('addFilmToList stays silent when offline', async () => {
        mockDbError = OFFLINE;
        await useFilmStore.getState().addFilmToList('list-1', { id: 550, title: 'Fight Club' });
        expect(captureError).not.toHaveBeenCalled();
    });

    it('removeFilmFromList reports a genuine defect', async () => {
        useFilmStore.setState({
            lists: [{ ...LIST, films: [{ id: 550, title: 'Fight Club', poster: null }] }],
        } as never);
        mockDbError = GENUINE_DEFECT;
        await useFilmStore.getState().removeFilmFromList('list-1', 550);
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'listSlice.removeFilmFromList' }),
        );
    });
});

describe('log delete — the core write path', () => {
    const LOG = {
        id: 'log-1', filmId: 550, title: 'Fight Club', poster: '/p.jpg', year: 1999,
        rating: 8, review: '', status: 'watched', viewCount: 1, viewingHistory: [],
        createdAt: '2026-01-01T00:00:00Z',
    };

    beforeEach(() => {
        useFilmStore.setState({ logs: [LOG], _loggedIndex: { 550: LOG } } as never);
    });

    it('reports a genuine defect with the log id attached', async () => {
        mockDbError = GENUINE_DEFECT;
        await attempt(() => useFilmStore.getState().removeLog('log-1'));
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'removeLogOp', logId: 'log-1' }),
        );
    });

    it('restores the log after a genuine defect — rollback runs below the report', async () => {
        mockDbError = GENUINE_DEFECT;
        await attempt(() => useFilmStore.getState().removeLog('log-1'));
        expect(useFilmStore.getState().logs.some((l) => l.id === 'log-1')).toBe(true);
    });

    it('stays silent and queues when offline', async () => {
        mockDbError = OFFLINE;
        await attempt(() => useFilmStore.getState().removeLog('log-1'));
        expect(captureError).not.toHaveBeenCalled();
        expect(enqueueMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'remove_log' }));
    });
});

describe('lists — updateList', () => {
    beforeEach(() => {
        useFilmStore.setState({
            lists: [{
                id: 'list-9', title: 'Noir', description: '', isRanked: false, isPrivate: false,
                createdAt: '2026-01-01T00:00:00Z', userId: 'u1', films: [],
            }],
        } as never);
    });

    it('reports a genuine defect', async () => {
        mockDbError = GENUINE_DEFECT;
        await attempt(() => useFilmStore.getState().updateList('list-9', { title: 'Neo-Noir' }));
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'listSlice.updateList' }),
        );
    });

    it('stays silent when offline', async () => {
        mockDbError = OFFLINE;
        await attempt(() => useFilmStore.getState().updateList('list-9', { title: 'Neo-Noir' }));
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('log update — the other half of the core write path', () => {
    const LOG = {
        id: 'log-9', filmId: 551, title: 'Se7en', poster: '/s.jpg', year: 1995,
        rating: 9, review: '', status: 'watched', viewCount: 1, viewingHistory: [],
        createdAt: '2026-01-01T00:00:00Z',
    };

    beforeEach(() => {
        useFilmStore.setState({ logs: [LOG], _loggedIndex: { 551: LOG } } as never);
    });

    it('reports a genuine defect with the log id', async () => {
        mockDbError = GENUINE_DEFECT;
        await attempt(() => useFilmStore.getState().updateLog('log-9', { rating: 10 }));
        expect(captureError).toHaveBeenCalledWith(
            GENUINE_DEFECT, expect.objectContaining({ scope: 'updateLogOp', logId: 'log-9' }),
        );
    });

    it('stays silent when offline', async () => {
        mockDbError = OFFLINE;
        await attempt(() => useFilmStore.getState().updateLog('log-9', { rating: 10 }));
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('follows — the last uncovered store paths', () => {
    const profileRow = { data: { id: 't1', is_social_private: false }, error: null };
    const empty = { data: null, error: null };

    it('followUser reports a genuine defect', async () => {
        mockDbQueue = [profileRow, empty, { data: null, error: GENUINE_DEFECT }];
        await followUser('alpha');
        expect(captureError).toHaveBeenCalledWith(
            expect.anything(), expect.objectContaining({ scope: 'socialSlice', targetUsername: 'alpha' }),
        );
    });

    it('followUser stays silent and queues when offline', async () => {
        mockDbQueue = [profileRow, empty, { data: null, error: OFFLINE }];
        await followUser('bravo');
        expect(captureError).not.toHaveBeenCalled();
        expect(enqueueMutation).toHaveBeenCalled();
    });

    it('unfollowUser reports a genuine defect', async () => {
        mockDbQueue = [profileRow, { data: null, error: GENUINE_DEFECT }];
        await unfollowUser('charlie');
        expect(captureError).toHaveBeenCalledWith(
            expect.anything(), expect.objectContaining({ scope: 'socialSlice', targetUsername: 'charlie' }),
        );
    });

    it('unfollowUser stays silent when offline', async () => {
        mockDbQueue = [profileRow, { data: null, error: OFFLINE }];
        await unfollowUser('delta');
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('the last two store paths', () => {
    it('toggleListEndorse excludes 23505 exactly like toggleEndorse', async () => {
        useFilmStore.setState({ interactions: [], _listEndorsedIndex: {} } as never);
        mockEndorseError = { code: '23505', message: 'duplicate key value' };
        await useFilmStore.getState().toggleListEndorse('list-x');
        expect(captureError).not.toHaveBeenCalled();
        expect(useFilmStore.getState().hasListEndorsed('list-x')).toBe(true);
    });

    it('toggleListEndorse reports a genuine failure', async () => {
        useFilmStore.setState({ interactions: [], _listEndorsedIndex: {} } as never);
        mockEndorseError = { code: '42501', message: 'permission denied' };
        await attempt(() => useFilmStore.getState().toggleListEndorse('list-y'));
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ code: '42501' }),
            expect.objectContaining({ scope: 'interactionSlice.toggleEndorsement' }),
        );
    });

    it('hydrateFollowing reports an unexpected shape from the server', async () => {
        // Malformed payload => a TypeError inside the try, which is precisely
        // the "Unexpected error" this catch was labelled for.
        mockDbData = 'not-an-array';
        await hydrateFollowing();
        expect(captureError).toHaveBeenCalledWith(
            expect.anything(), expect.objectContaining({ scope: 'socialSlice.hydrateFollowing' }),
        );
    });
});
