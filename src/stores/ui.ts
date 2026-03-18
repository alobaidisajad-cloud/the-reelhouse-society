import { create } from 'zustand'

export interface UIStoreState {
    logModalOpen: boolean
    logModalFilm: any | null
    logModalEditLogId: string | null
    signupModalOpen: boolean
    signupRole: string
    showPaywall: boolean
    paywallFeature: string | null
    handbookOpen: boolean

    openHandbook: () => void
    closeHandbook: () => void

    openLogModal: (film?: any | null, editLogId?: string | null) => void
    closeLogModal: () => void

    openSignupModal: (role?: string) => void
    closeSignupModal: () => void

    openPaywall: (featureName: string) => void
    closePaywall: () => void
}

// ── UI STORE — modal states and transient UI ──
export const useUIStore = create<UIStoreState>((set) => ({
    logModalOpen: false,
    logModalFilm: null,
    logModalEditLogId: null,
    signupModalOpen: false,
    signupRole: 'cinephile',
    showPaywall: false,
    paywallFeature: null,
    handbookOpen: false,


    openHandbook: () => set({ handbookOpen: true }),
    closeHandbook: () => set({ handbookOpen: false }),



    openLogModal: (film = null, editLogId = null) =>
        set({ logModalOpen: true, logModalFilm: film, logModalEditLogId: editLogId }),
    closeLogModal: () =>
        set({ logModalOpen: false, logModalFilm: null, logModalEditLogId: null }),

    openSignupModal: (role = 'cinephile') =>
        set({ signupModalOpen: true, signupRole: role }),
    closeSignupModal: () => set({ signupModalOpen: false }),

    openPaywall: (featureName) =>
        set({ showPaywall: true, paywallFeature: featureName }),
    closePaywall: () => set({ showPaywall: false, paywallFeature: null }),
}))

export interface DiscoverStoreState {
    page: number
    mood: string | null
    query: string
    inputVal: string
    accumulatedFilms: any[]
    filters: {
        genreId: number | null
        decade: number | null
        sortBy: string
        language: string | null
        minRating: number
    }
    setPage: (page: number) => void
    setMood: (mood: string | null) => void
    setQuery: (query: string) => void
    setInputVal: (inputVal: string) => void
    setAccumulatedFilms: (updater: any[] | ((prev: any[]) => any[])) => void
    setFilters: (updater: any | ((prev: any) => any)) => void
    clearFilters: () => void
    updateFilter: (patch: Partial<DiscoverStoreState['filters']>) => void
    clearSearch: () => void
}

// ── DISCOVER STORE — filter and search state ──
export const useDiscoverStore = create<DiscoverStoreState>((set) => ({
    page: 1,
    mood: null,
    query: '',
    inputVal: '',
    accumulatedFilms: [],
    filters: {
        genreId: null,
        decade: null,
        sortBy: 'popularity.desc',
        language: null,
        minRating: 0,
    },
    setPage: (page) => set({ page }),
    setMood: (mood) => set({ mood }),
    setQuery: (query) => set({ query }),
    setInputVal: (inputVal) => set({ inputVal }),
    setAccumulatedFilms: (updater) => set((state) => ({
        accumulatedFilms: typeof updater === 'function' ? updater(state.accumulatedFilms) : updater
    })),
    setFilters: (updater) => set((state) => ({
        filters: typeof updater === 'function' ? updater(state.filters) : updater
    })),
    clearFilters: () => set({
        filters: { genreId: null, decade: null, sortBy: 'popularity.desc', language: null, minRating: 0 },
        page: 1,
        mood: null,
    }),
    updateFilter: (patch) => set((state) => ({
        filters: { ...state.filters, ...patch },
        page: 1,
        mood: null,
    })),
    clearSearch: () => set({ query: '', inputVal: '' }),
}))

export interface SoundscapeState {
    isPlaying: boolean
    toggle: () => void
    playShutter: () => void
}

// ── SOUNDSCAPE STORE — ambient audio toggle ──
export const useSoundscape = create<SoundscapeState>((set) => ({
    isPlaying: false,
    toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
    playShutter: () => {
        const audio = document.getElementById('shutter-audio') as HTMLAudioElement | null
        if (audio) {
            audio.currentTime = 0
            audio.volume = 0.4
            audio.play().catch(() => { }) // Ignore autoplay blocks
        }
    },
}))
