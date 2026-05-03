import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandMMKVStorage } from './mmkv-storage';
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

// H-03 AUDIT FIX: Persist discover state to MMKV so users don't lose their
// darkroom results when going offline or when the store is reset by navigation.
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
  setMood: (mood) => set({ mood }),
  setQuery: (query) => set({ query }),
  setInputVal: (inputVal) => set({ inputVal }),
  
  setAccumulatedFilms: (updater) => set((s) => ({
    accumulatedFilms: typeof updater === 'function' ? updater(s.accumulatedFilms) : updater
  })),

  setFilters: (updater) => set((s) => ({
    filters: typeof updater === 'function' ? updater(s.filters) : updater
  })),

  clearFilters: () => set({ filters: { ...defaultFilters } }),

  updateFilter: (obj) => set((s) => ({ 
    filters: { ...s.filters, ...obj } 
  })),

  clearSearch: () => set({ query: '', inputVal: '' }),
    }),
    {
      name: 'reelhouse-discover',
      storage: createJSONStorage(() => zustandMMKVStorage),
      // Only persist the film results and filters — not ephemeral UI state
      partialize: (state) => ({
        accumulatedFilms: state.accumulatedFilms.slice(0, 100), // Cap persisted data
        filters: state.filters,
        mood: state.mood,
      }),
    }
  )
);

// F-10 FIX: Register cleanup handler for centralized logout
registerStoreReset(() => {
    useDiscoverStore.setState({
        page: 1, mood: null, query: '', inputVal: '', accumulatedFilms: [],
        filters: { ...defaultFilters },
    });
});
