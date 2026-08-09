import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAsyncMMKVStorage, storage } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';

import { ArchiveSlice, createArchiveSlice, archiveSliceInitialState } from './domain/archiveSlice';
import { InteractionSlice, createInteractionSlice, interactionSliceInitialState } from './domain/interactionSlice';
import { ListSlice, createListSlice, listSliceInitialState } from './domain/listSlice';
import { LogSlice, createLogSlice, logSliceInitialState } from './domain/logSlice';
import { WatchlistSlice, createWatchlistSlice, watchlistSliceInitialState } from './domain/watchlistSlice';
import { clearAllMutexes } from './domain/helpers/promiseMutex';

import type { DomainLog, Interaction, WatchlistItem } from '../types';
import { createSelectors } from './createSelectors';

export type FilmState = LogSlice & WatchlistSlice & ListSlice & InteractionSlice & ArchiveSlice;

const useFilmStoreBase = create<FilmState>()(
    persist(
        (set, get, store) => ({
            ...createLogSlice(set, get, store),
            ...createWatchlistSlice(set, get, store),
            ...createListSlice(set, get, store),
            ...createInteractionSlice(set, get, store),
            ...createArchiveSlice(set, get, store),
        }),
        {
            name: 'reelhouse-films',
            storage: createAsyncMMKVStorage(),
            // Deferred hydration until the encryption key is resolved (LIB-5).
            skipHydration: true,
            // Explicit allowlist instead of fragile `_` prefix filter
            partialize: (state) => {
                const PERSISTED_KEYS = ['logs', 'watchlist', 'lists', 'interactions', 'physicalArchive'];
                // The large, server-paginated arrays are persisted only as a recent
                // window so MMKV stays well under its size budget; the full arrays
                // remain in session memory and are refreshed by fetch* on launch.
                // This window exists purely for instant cold-start display.
                const PERSIST_WINDOW = 150;
                const WINDOWED_KEYS = new Set(['logs', 'watchlist']);
                return Object.fromEntries(
                    Object.entries(state)
                        .filter(([key]) => PERSISTED_KEYS.includes(key))
                        .map(([key, value]) =>
                            WINDOWED_KEYS.has(key) && Array.isArray(value)
                                ? [key, value.slice(0, PERSIST_WINDOW)]
                                : [key, value]
                        )
                );
            },
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // Rebuild derived indices from persisted logs
                    // Without this, isRewatchMode returns false on cold start until fetchLogs() completes
                    if (state.logs && state.logs.length > 0) {
                        const logIndex: Record<number, DomainLog> = {};
                        state.logs.forEach((log: DomainLog) => { 
                            if (log.filmId && !logIndex[log.filmId]) {
                                logIndex[log.filmId] = log; 
                            }
                        });
                        useFilmStore.setState({ _loggedIndex: logIndex });
                    }

                    if (state.watchlist && state.watchlist.length > 0) {
                        const watchIndex: Record<number, true> = {};
                        state.watchlist.forEach((w: WatchlistItem) => { watchIndex[w.id] = true; });
                        useFilmStore.setState({ _watchlistIndex: watchIndex });
                    }

                    if (state.interactions && state.interactions.length > 0) {
                        const endorseIdx: Record<string, Interaction> = {};
                        const listEndorseIdx: Record<string, Interaction> = {};
                        state.interactions.forEach((i: Interaction) => {
                            if (i.type === 'endorse') endorseIdx[i.targetId] = i;
                            if (i.type === 'endorse_list') listEndorseIdx[i.targetId] = i;
                        });
                        useFilmStore.setState({ _endorsedIndex: endorseIdx, _listEndorsedIndex: listEndorseIdx });
                    }

                    try {
                         
                        const { ImagePrefetcher } = require('../utils/imagePrefetcher');
                        if (state.watchlist && state.watchlist.length > 0) {
                            ImagePrefetcher.preloadFilmBatch(state.watchlist.slice(0, 10));
                        }
                        if (state.physicalArchive && state.physicalArchive.length > 0) {
                            ImagePrefetcher.preloadFilmBatch(state.physicalArchive.slice(0, 10));
                        }
                    } catch { /* prefetch is best-effort */ }
                    try {
                         
                        const { tmdb } = require('../lib/tmdb');
                        tmdb.trending('week').then((res: any) => {
                            try {
                                 
                                const { ImagePrefetcher } = require('../utils/imagePrefetcher');
                                ImagePrefetcher.preloadFilmBatch((res?.results ?? []).slice(0, 15));
                            } catch { /* prefetch is best-effort */ }
                        }).catch((err: unknown) => { if (__DEV__) console.warn('[Hydration] trending prefetch error:', err); });
                    } catch { /* tmdb prefetch is best-effort */ }
                }
            }
        }
    )
);

export const useFilmStore = createSelectors(useFilmStoreBase);

export const rehydrateFilmStore = () => useFilmStoreBase.persist.rehydrate();

// Re-export aliases to satisfy components that were migrated to the split architecture
export const useLogStore = useFilmStore;
export const useWatchlistStore = useFilmStore;
export const useListStore = useFilmStore;
export const useInteractionStore = useFilmStore;
export const useArchiveStore = useFilmStore;

// Register cleanup handler for centralized logout
registerStoreReset(() => {
    // Every slice's OWN starting values, not a list maintained by hand. The
    // hand-written list named 10 of the 28 fields this store holds — it missed
    // every cursor, every `hasMore`, every in-flight flag, two mutexes, and the
    // stacks slice entirely. A `hasMore: false` inherited from the previous
    // member disabled "load more" for the next one, and a stale `_fetching: true`
    // would have blocked the fetch that repairs it.
    //
    // Each factory returns FRESH objects, so no two sessions share an array —
    // `sortLogs` sorts in place, and a shared constant would let one member's
    // session mutate the pristine copy the next reset depends on.
    useFilmStore.setState({
        ...logSliceInitialState(),
        ...watchlistSliceInitialState(),
        ...listSliceInitialState(),
        ...interactionSliceInitialState(),
        ...archiveSliceInitialState(),
    });

    // The queued-write map outlives the store, so it is cleared here too —
    // otherwise the next member's first write to a key chains onto a promise
    // belonging to the previous one.
    clearAllMutexes();

    // Delete the persisted copy rather than trusting the overwrite above to
    // reach disk. This store's writes are DEFERRED (up to 1.5s, or until
    // animations settle), so a logout followed by the app closing would leave
    // the previous member's last 150 logs — private notes included — on the
    // device, to be loaded on next launch before anyone signs in.
    //
    // `removeItem` is synchronous AND drops the pending write, so it closes the
    // window rather than racing it. notificationStore does exactly this, for
    // exactly this reason.
    try { storage.delete('reelhouse-films'); } catch { /* noop */ }
});
