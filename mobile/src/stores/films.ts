import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAsyncMMKVStorage } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';

import { ArchiveSlice, createArchiveSlice } from './domain/archiveSlice';
import { InteractionSlice, createInteractionSlice } from './domain/interactionSlice';
import { ListSlice, createListSlice } from './domain/listSlice';
import { LogSlice, createLogSlice } from './domain/logSlice';
import { WatchlistSlice, createWatchlistSlice } from './domain/watchlistSlice';

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
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                        const { ImagePrefetcher } = require('../utils/imagePrefetcher');
                        if (state.watchlist && state.watchlist.length > 0) {
                            ImagePrefetcher.preloadFilmBatch(state.watchlist.slice(0, 10));
                        }
                        if (state.physicalArchive && state.physicalArchive.length > 0) {
                            ImagePrefetcher.preloadFilmBatch(state.physicalArchive.slice(0, 10));
                        }
                    } catch { /* prefetch is best-effort */ }
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                        const { tmdb } = require('../lib/tmdb');
                        tmdb.trending('week').then((res: any) => {
                            try {
                                // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    useFilmStore.setState({
        logs: [], watchlist: [], lists: [], interactions: [], physicalArchive: [],
        _loggedIndex: {}, _watchlistIndex: {}, _endorsedIndex: {}, _listEndorsedIndex: {},
        _addLogMutex: false,
    });
});
