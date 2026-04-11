import { create } from 'zustand';

export interface DiscoverState {
  page: number;
  mood: any | null;
  query: string;
  inputVal: string;
  accumulatedFilms: any[];
  filters: {
    genreId: number | null;
    decade: any | null;
    sortBy: string;
    language: string | null;
    minRating: number;
    yearFrom: number | null;
    yearTo: number | null;
  };
  setPage: (v: number) => void;
  setMood: (m: any | null) => void;
  setQuery: (q: string) => void;
  setInputVal: (v: string) => void;
  setAccumulatedFilms: (updater: any[] | ((prev: any[]) => any[])) => void;
  setFilters: (updater: any | ((prev: any) => any)) => void;
  clearFilters: () => void;
  updateFilter: (obj: any) => void;
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
