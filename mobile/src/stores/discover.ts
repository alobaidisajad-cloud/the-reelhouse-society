import { create } from 'zustand';

export interface DiscoverFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
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
  emoji?: string;
  genres?: number[];
}

export interface DiscoverFilters {
  genreId: number | null;
  decade: string | null;
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

export const useDiscoverStore = create<DiscoverState>((set) => ({
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
}));
