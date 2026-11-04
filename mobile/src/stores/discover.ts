import { create } from 'zustand';
import { carriedForward, SAVED_VERSION } from './savedVersion';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage, zustandMMKVStorage } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';

export interface DiscoverFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  profile_path?: string | null;
  backdrop_path?: string | null;
  media_type?: string;
  popularity?: number;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  genre_ids?: number[];
}

export interface DiscoverMood {
  label: string;
  sub: string;
  icon: string;
  genre: number;
  sort: string;
  color: string;
  accent: string;
  voteGte?: number;
}

export interface DecadeRange {
  label: string;
  from: string;
  to: string;
}

export interface DiscoverFilters {
  genreId: number | null;
  decade: DecadeRange | null;
  sortBy: string;
  language: string | null;
  minRating: number;
  yearFrom: number | null;
  yearTo: number | null;
}

export interface DiscoverState {
  page: number;
  mood: DiscoverMood | null;
  query: string;
  inputVal: string;
  accumulatedFilms: DiscoverFilm[];
  filters: DiscoverFilters;
  setPage: (v: number) => void;
  setMood: (m: DiscoverMood | null) => void;
  setQuery: (q: string) => void;
  setInputVal: (v: string) => void;
  setAccumulatedFilms: (updater: DiscoverFilm[] | ((prev: DiscoverFilm[]) => DiscoverFilm[])) => void;
  setFilters: (updater: DiscoverFilters | ((prev: DiscoverFilters) => DiscoverFilters)) => void;
  clearFilters: () => void;
  updateFilter: (obj: Partial<DiscoverFilters>) => void;
  clearSearch: () => void;
  applyMood: (m: DiscoverMood | null) => void;
}

const defaultFilters = {
  genreId: null,
  decade: null,
  sortBy: 'popularity.desc',
  language: null,
  minRating: 0,
  yearFrom: null,
  yearTo: null,
};

// The Darkroom's mood, filters and search survive a restart; the films found are
// fetched again (see partialize).
export const useDiscoverStore = create<DiscoverState>()(
  persist(
    (set) => ({
  page: 1,
  mood: null,
  query: '',
  inputVal: '',
  accumulatedFilms: [],
  filters: { ...defaultFilters },

  setPage: (page) => set({ page }),
  setMood: (mood) => set({ mood, page: 1, accumulatedFilms: [] }),
  setQuery: (query) => set({ query, page: 1, accumulatedFilms: [] }),
  setInputVal: (inputVal) => set({ inputVal }),
  
  setAccumulatedFilms: (updater) => set((s) => ({
    accumulatedFilms: typeof updater === 'function' ? updater(s.accumulatedFilms) : updater
  })),

  setFilters: (updater) => set((s) => ({
    filters: typeof updater === 'function' ? updater(s.filters) : updater,
    page: 1,
    accumulatedFilms: []
  })),

  clearFilters: () => set({ filters: { ...defaultFilters }, mood: null, page: 1, accumulatedFilms: [] }),

  updateFilter: (obj) => set((s) => ({ 
    filters: { ...s.filters, ...obj },
    mood: null,
    page: 1,
    accumulatedFilms: []
  })),

  clearSearch: () => set({ query: '', inputVal: '', page: 1, accumulatedFilms: [] }),

  applyMood: (m) => set(() => {
    if (!m) {
      return { mood: null, filters: { ...defaultFilters }, page: 1, accumulatedFilms: [] };
    }
    return {
      mood: m,
      filters: { ...defaultFilters, genreId: m.genre },
      query: '',
      inputVal: '',
      page: 1,
      accumulatedFilms: []
    };
  }),
    }),
    {
      name: 'reelhouse-discover',
      // What the last release saved, named and carried (savedVersion.ts).
      version: SAVED_VERSION,
      migrate: carriedForward,
      storage: createJSONStorage(() => zustandMMKVStorage),
      // What the member chose (filters, mood, search) — not accumulatedFilms, fetched again (handled manually by cacheKey)
      partialize: (state) => ({
        filters: state.filters,
        mood: state.mood,
        query: state.query,
        inputVal: state.inputVal,
      }),
      // Deferred hydration until the encryption key is resolved (LIB-5).
      skipHydration: true,
    }
  )
);

export const rehydrateDiscoverStore = () => useDiscoverStore.persist.rehydrate();

/** Where the Darkroom keeps the last sheet it developed for a search or a setting. */
const KEPT_SHEET = 'darkroom_sheet_';

/**
 * A kept sheet's name: its search or settings whole, in any script, as a short key a store can
 * hold (FNV-1a, and the words' length). Letters outside a-z were each made `_`, so every search
 * in Arabic of the same length shared one sheet.
 */
export function sheetCacheKey(what: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < what.length; i++) h = Math.imul(h ^ what.charCodeAt(i), 0x01000193) >>> 0;
  return `${KEPT_SHEET}${h.toString(36)}_${what.length}`;
}

/** Every kept sheet, and the ones kept under the old names: a member who signs out leaves no search behind. */
export function forgetKeptSheets() {
  for (const key of storage.getAllKeys()) {
    if (key.startsWith(KEPT_SHEET) || key.startsWith('darkroom_cache_')) storage.delete(key);
  }
}

// Register cleanup handler for centralized logout
registerStoreReset(() => {
    useDiscoverStore.setState({
        page: 1, mood: null, query: '', inputVal: '', accumulatedFilms: [],
        filters: { ...defaultFilters },
    });
    forgetKeptSheets();
});
