import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandMMKVStorage } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';

import { LogSlice, createLogSlice } from './domain/logSlice';
import { WatchlistSlice, createWatchlistSlice } from './domain/watchlistSlice';
import { ListSlice, createListSlice } from './domain/listSlice';
import { InteractionSlice, createInteractionSlice } from './domain/interactionSlice';
import { ArchiveSlice, createArchiveSlice } from './domain/archiveSlice';

export type FilmState = LogSlice & WatchlistSlice & ListSlice & InteractionSlice & ArchiveSlice;

export const useFilmStore = create<FilmState>()(
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
            storage: createJSONStorage(() => zustandMMKVStorage),
            // D-02 AUDIT FIX: Explicit allowlist instead of fragile `_` prefix filter
            partialize: (state) => {
                const PERSISTED_KEYS = ['logs', 'watchlist', 'lists', 'interactions', 'physicalArchive'];
                return Object.fromEntries(
                    Object.entries(state).filter(([key]) => PERSISTED_KEYS.includes(key))
                );
            },
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // #6 AUDIT FIX: Rebuild derived indices from persisted logs
                    // Without this, isRewatchMode returns false on cold start until fetchLogs() completes
                    if (state.logs && state.logs.length > 0) {
                        const logIndex: Record<number, any> = {};
                        state.logs.forEach((log: any) => { logIndex[log.filmId] = log; });
                        useFilmStore.setState({ _loggedIndex: logIndex });
                    }

                    import('../utils/imagePrefetcher').then(({ ImagePrefetcher }) => {
                        if (state.watchlist && state.watchlist.length > 0) {
                            ImagePrefetcher.preloadFilmBatch(state.watchlist.slice(0, 10));
                        }
                        if (state.physicalArchive && state.physicalArchive.length > 0) {
                            ImagePrefetcher.preloadFilmBatch(state.physicalArchive.slice(0, 10));
                        }
                    });
                    import('../lib/tmdb').then(({ tmdb }) => {
                        tmdb.trending('week').then((res: any) => {
                            import('../utils/imagePrefetcher').then(({ ImagePrefetcher }) => {
                                ImagePrefetcher.preloadFilmBatch((res?.results ?? []).slice(0, 15));
                            });
                        }).catch((err: unknown) => { if (__DEV__) console.warn('[Hydration] trending prefetch error:', err); });
                    });
                }
            }
        }
    )
);

// F-10 FIX: Register cleanup handler for centralized logout
registerStoreReset(() => {
    useFilmStore.setState({
        logs: [], watchlist: [], lists: [], interactions: [], physicalArchive: [],
        _loggedIndex: {}, _watchlistIndex: {}, _endorsedIndex: {}, _listEndorsedIndex: {},
        _addLogMutex: false,
    });
});
