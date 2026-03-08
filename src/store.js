import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { supabase } from './supabaseClient'

// ── AUTH STORE ──
export const useAuthStore = create(
    persist(
        (set) => ({
            user: null, // Will hold actual Supabase auth user + profile data
            isAuthenticated: false,
            // Keeping mock community for UI purposes until fully migrated
            community: [
                { username: 'midnight_devotee', bio: 'I only watch films after 12:00 AM. Noir is my oxygen.', followers: ['sajjadsalel'], following: ['sajjadsalel'], isSocialPrivate: false },
                { username: 'the_archivist_84', bio: 'Collecting every frame since 1984. 35mm only.', followers: [], following: ['sajjadsalel'], isSocialPrivate: true },
                { username: 'weeper_in_the_dark', bio: 'If it doesn\'t make me cry, it\'s not cinema.', followers: ['sajjadsalel'], following: [], isSocialPrivate: false },
                { username: 'contrarian_rex', bio: 'Your favorite masterpiece is actually mid.', followers: ['sajjadsalel'], following: [], isSocialPrivate: false }
            ],

            // Real authentication actions
            login: async (email, password) => {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error

                // Fetch full profile info
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single()

                set({
                    user: { ...data.user, ...profile },
                    isAuthenticated: true
                })
                useFilmStore.getState().fetchLogs()
                return data
            },

            signup: async (email, password, username, role = 'cinephile') => {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            username: username,
                            role: role
                        }
                    }
                })
                if (error) throw error

                if (data?.session) {
                    await supabase.from('profiles').update({ username, role }).eq('id', data.user.id)

                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
                    set({
                        user: { ...data.user, ...profile },
                        isAuthenticated: true
                    })
                    useFilmStore.getState().fetchLogs()
                }

                return data
            },

            logout: async () => {
                await supabase.auth.signOut()
                set({ user: null, isAuthenticated: false })
            },

            updateUser: (updates) => set((state) => ({
                user: state.user ? { ...state.user, ...updates } : null,
            })),

            followUser: (targetUsername) => set((state) => {
                const following = state.user?.following || [];
                if (following.includes(targetUsername)) return state;
                return {
                    user: {
                        ...state.user,
                        following: [...following, targetUsername]
                    },
                    // Also update the community object to show the follower count increase
                    community: state.community.map(u =>
                        u.username === targetUsername
                            ? { ...u, followers: [...(u.followers || []), state.user?.username] }
                            : u
                    )
                }
            }),
            unfollowUser: (targetUsername) => set((state) => ({
                user: {
                    ...state.user,
                    following: (state.user?.following || []).filter(u => u !== targetUsername)
                },
                community: state.community.map(u =>
                    u.username === targetUsername
                        ? { ...u, followers: (u.followers || []).filter(f => f !== state.user?.username) }
                        : u
                )
            })),
        }),
        { name: 'reelhouse-auth' }
    )
)

// â”€â”€ FILM LOG STORE â”€â”€
export const useFilmStore = create(
    persist(
        (set, get) => ({
            logs: [],        // { id, filmId, title, poster, rating, review, status, watchedDate, isSpoiler, abandonedReason, createdAt }
            watchlist: [],   // film objects
            vault: [],       // private watchlist
            lists: [],       // { id, title, description, isPrivate, films[] }
            stubs: [],       // digital tickets: { id, filmId, title, date, venue, seat }
            interactions: [], // Social Graph: { type: 'endorse' | 'note', targetId: string, timestamp: string }

            toggleEndorse: async (targetId) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const exists = get().interactions.find(i => i.targetId === targetId && i.type === 'endorse');

                if (exists) {
                    const { error } = await supabase.from('interactions').delete().eq('user_id', user.id).eq('target_log_id', targetId).eq('type', 'endorse_log');
                    if (!error) set(state => ({ interactions: state.interactions.filter(i => !(i.targetId === targetId && i.type === 'endorse')) }));
                } else {
                    const { error } = await supabase.from('interactions').insert([
                        { user_id: user.id, target_log_id: targetId, type: 'endorse_log' }
                    ]);
                    if (!error) set(state => ({ interactions: [...state.interactions, { type: 'endorse', targetId, timestamp: new Date().toISOString() }] }));
                }
            },

            hasEndorsed: () => false, // Handled via selector in components for reactivity

            fetchLogs: async () => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { data, error } = await supabase
                    .from('logs')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (!error && data) {
                    const formattedLogs = data.map(dbLog => ({
                        id: dbLog.id,
                        filmId: dbLog.film_id,
                        title: dbLog.film_title,
                        rating: dbLog.rating,
                        review: dbLog.review,
                        watchedDate: dbLog.watched_date,
                        createdAt: dbLog.created_at
                    }));
                    set({ logs: formattedLogs });
                }
            },

            addLog: async (log) => {
                const user = useAuthStore.getState().user;
                if (!user) {
                    console.error("You must be logged in to save logs to the database.");
                    return;
                }

                // 1. Save to live Supabase backend
                const dbLog = {
                    user_id: user.id,
                    film_id: log.filmId,
                    film_title: log.title,
                    rating: log.rating || 0,
                    review: log.review || '',
                    watched_date: log.watchedDate || new Date().toISOString(),
                    format: 'Digital'
                };

                const { data, error } = await supabase.from('logs').insert([dbLog]).select().single();

                if (error) {
                    console.error("Supabase insert failed:", error.message);
                    return; // Fail gracefully
                }

                // 2. Update local UI state
                const newLog = { ...log, id: data.id, createdAt: data.created_at };

                set((state) => ({
                    logs: [newLog, ...state.logs],
                    // Auto-award stub for every 1st log of a movie
                    stubs: state.stubs.find(s => s.filmId === log.filmId)
                        ? state.stubs
                        : [{
                            id: `stub-${Date.now()}`,
                            filmId: log.filmId,
                            title: log.title,
                            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                            venue: 'The Oracle Palace',
                            seat: Math.floor(Math.random() * 20 + 1) + String.fromCharCode(65 + Math.floor(Math.random() * 8))
                        }, ...state.stubs]
                }));
            },

            // Derived helper (not stored but accessible)
            getCinephileStats: () => {
                const logs = get().logs
                const count = logs.length
                let level = 'THE VISITOR'
                let color = 'var(--fog)'

                if (count > 50) { level = 'THE ARCHIVIST'; color = 'var(--sepia)' }
                else if (count > 20) { level = 'THE MIDNIGHT DEVOTEE'; color = 'var(--blood-reel)' }
                else if (count > 5) { level = 'THE REGULAR'; color = 'var(--flicker)' }

                return { count, level, color, progress: (count % 20) * 5 }
            },

            updateLog: async (id, updates) => {
                const { error } = await supabase.from('logs').update(updates).eq('id', id);
                if (!error) set((state) => ({ logs: state.logs.map((l) => l.id === id ? { ...l, ...updates } : l) }));
            },

            removeLog: async (id) => {
                const { error } = await supabase.from('logs').delete().eq('id', id);
                if (!error) set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }));
            },

            addToWatchlist: async (film) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { error } = await supabase.from('watchlists').insert([
                    { user_id: user.id, film_id: film.id, film_title: film.title || film.name || 'Unknown' }
                ]);

                if (!error) {
                    set((state) => ({
                        watchlist: state.watchlist.find((f) => f.id === film.id) ? state.watchlist : [...state.watchlist, film],
                    }));
                }
            },

            removeFromWatchlist: async (filmId) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId);
                if (!error) set((state) => ({ watchlist: state.watchlist.filter((f) => f.id !== filmId) }));
            },

            addToVault: async (film) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { error } = await supabase.from('vaults').insert([
                    { user_id: user.id, film_id: film.id, film_title: film.title || film.name || 'Unknown', format: 'Digital' }
                ]);

                if (!error) {
                    set((state) => ({
                        vault: state.vault.find((f) => f.id === film.id) ? state.vault : [...state.vault, film],
                    }));
                }
            },

            removeFromVault: async (filmId) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { error } = await supabase.from('vaults').delete().eq('user_id', user.id).eq('film_id', filmId);
                if (!error) set((state) => ({ vault: state.vault.filter((f) => f.id !== filmId) }));
            },

            createList: async (list) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { data, error } = await supabase.from('lists').insert([
                    { user_id: user.id, title: list.title, description: list.description || '' }
                ]).select().single();

                if (!error && data) {
                    set((state) => ({
                        lists: [{ ...list, id: data.id, films: [], createdAt: data.created_at }, ...state.lists],
                    }));
                }
            },

            addFilmToList: async (listId, film) => {
                const { error } = await supabase.from('list_items').insert([
                    { list_id: listId, film_id: film.id, film_title: film.title || film.name || 'Unknown' }
                ]);

                if (!error) {
                    set((state) => ({
                        lists: state.lists.map((l) =>
                            l.id === listId
                                ? { ...l, films: l.films.find((f) => f.id === film.id) ? l.films : [...l.films, film] }
                                : l
                        ),
                    }));
                }
            },
        }),
        {
            name: 'reelhouse-films',
            // Trim heavy watchlist/vault items â€” only save what's needed to re-render
            partialize: (state) => ({
                logs: state.logs,
                watchlist: state.watchlist.map(f => ({
                    id: f.id,
                    title: f.title,
                    poster_path: f.poster_path,
                    release_date: f.release_date,
                    vote_average: f.vote_average,
                    genre_ids: f.genre_ids,
                    popularity: f.popularity,
                })),
                vault: state.vault.map(f => ({
                    id: f.id,
                    title: f.title,
                    poster_path: f.poster_path,
                    release_date: f.release_date,
                    vote_average: f.vote_average,
                })),
                lists: state.lists,
                stubs: state.stubs,
            })
        }
    )
)

// â”€â”€ VENUE OWNER STORE â”€â”€
export const useVenueStore = create(
    persist(
        (set, get) => ({
            venue: {
                id: 'my-venue',
                name: 'The Oracle Palace',
                location: 'Brooklyn, NY',
                address: '42 Clinton Ave, Brooklyn, NY 11238',
                mapLink: '',
                description: 'Established in 1934 in a converted Masonic lodge. Our 35mm projection booth has never gone dark.',
                bio: 'We believe cinema is not entertainment — it is ritual.',
                email: '',
                phone: '',
                website: '',
                instagram: '',
                twitter: '',
                logo: null,
                vibes: ['Arthouse', 'Midnight Palace'],
                seatLayout: { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7 },
                followers: 1247,
                verified: false,
                paymentConnected: false,
                paymentAccountName: '',
                paymentLast4: '',
                paymentBrand: '',
                platformFeePercent: 15,
            },
            showtimes: [
                {
                    id: 'st1', film: 'Nosferatu (1922)', date: '2026-03-14',
                    slots: [
                        {
                            id: 'slot-1a', time: '14:00', format: '35mm',
                            notes: 'With live organ accompaniment',
                            bookedSeats: ['A1', 'A3', 'B2', 'C4', 'C7', 'D1', 'D8', 'E3'],
                            ticketTypes: [
                                { id: 'tt-1a-std', type: 'Standard', price: 15, perks: 'General seating rows C-J' },
                                { id: 'tt-1a-vip', type: 'VIP', price: 28, perks: 'Priority rows A-B + Complimentary drink' },
                                { id: 'tt-1a-stu', type: 'Student', price: 10, perks: 'All rows, valid student ID required' },
                            ]
                        },
                        {
                            id: 'slot-1b', time: '21:00', format: '35mm',
                            notes: 'Late night screening. Doors open 20 min before.',
                            bookedSeats: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D4', 'E5', 'E6'],
                            ticketTypes: [
                                { id: 'tt-1b-std', type: 'Standard', price: 18, perks: 'General seating rows C-J' },
                                { id: 'tt-1b-vip', type: 'VIP', price: 32, perks: 'Priority rows A-B + Complimentary drink' },
                            ]
                        }
                    ]
                },
                {
                    id: 'st2', film: 'M (1931)', date: '2026-03-15',
                    slots: [
                        {
                            id: 'slot-2a', time: '20:00', format: '35mm', notes: '',
                            bookedSeats: ['A1', 'A2', 'B3', 'C1', 'C5'],
                            ticketTypes: [
                                { id: 'tt-2a-std', type: 'Standard', price: 15, perks: 'General seating' },
                                { id: 'tt-2a-vip', type: 'VIP', price: 25, perks: 'Priority rows A-B + Complimentary drink' },
                            ]
                        }
                    ]
                },
            ],
            events: [
                { id: 'ev1', title: 'MIDNIGHT HORROR MARATHON', desc: '6 films. No sleep. No mercy.', date: '2026-03-15', time: '23:00', type: 'Marathon', price: 45, ticketsLeft: 40, totalTickets: 60 },
            ],
            updateVenue: (u) => set(s => ({ venue: { ...s.venue, ...u } })),
            addShowtime: (st) => set(s => ({ showtimes: [{ ...st, id: 'st-' + Date.now(), slots: [] }, ...s.showtimes] })),
            removeShowtime: (id) => set(s => ({ showtimes: s.showtimes.filter(x => x.id !== id) })),
            updateShowtime: (id, u) => set(s => ({ showtimes: s.showtimes.map(x => x.id === id ? { ...x, ...u } : x) })),
            addSlot: (stId, slot) => set(s => ({
                showtimes: s.showtimes.map(st => st.id === stId
                    ? { ...st, slots: [...st.slots, { ...slot, id: 'slot-' + Date.now(), bookedSeats: [] }] } : st)
            })),
            removeSlot: (stId, slotId) => set(s => ({
                showtimes: s.showtimes.map(st => st.id === stId
                    ? { ...st, slots: st.slots.filter(sl => sl.id !== slotId) } : st)
            })),
            updateSlot: (stId, slotId, updates) => set(s => ({
                showtimes: s.showtimes.map(st => st.id === stId ? {
                    ...st, slots: st.slots.map(sl => sl.id === slotId ? { ...sl, ...updates } : sl)
                } : st)
            })),
            bookSeat: (stId, slotId, seatId) => set(s => ({
                showtimes: s.showtimes.map(st => st.id === stId ? {
                    ...st, slots: st.slots.map(sl => sl.id === slotId
                        ? { ...sl, bookedSeats: [...sl.bookedSeats, seatId] } : sl)
                } : st)
            })),
            addEvent: (ev) => set(s => ({ events: [{ ...ev, id: 'ev-' + Date.now(), ticketsLeft: ev.totalTickets }, ...s.events] })),
            removeEvent: (id) => set(s => ({ events: s.events.filter(e => e.id !== id) })),
            updateEvent: (id, u) => set(s => ({ events: s.events.map(e => e.id === id ? { ...e, ...u } : e) })),
            connectPayment: (info) => set(s => ({ venue: { ...s.venue, paymentConnected: true, ...info } })),
        }),
        { name: 'reelhouse-venue-v4' }
    )
)
export const useCinemaReviewStore = create(
    persist(
        (set, get) => ({
            // reviews: { [cinemaId]: [{ username, rating, review, createdAt }] }
            reviews: {},

            addReview: (cinemaId, { username, rating, review }) => set((state) => {
                const existing = state.reviews[cinemaId] || []
                // Replace if user already left a review
                const filtered = existing.filter(r => r.username !== username)
                return {
                    reviews: {
                        ...state.reviews,
                        [cinemaId]: [
                            { username, rating, review, createdAt: new Date().toISOString() },
                            ...filtered
                        ]
                    }
                }
            }),

            getReviews: (cinemaId) => get().reviews[cinemaId] || [],

            getAvgRating: (cinemaId) => {
                const reviews = get().reviews[cinemaId] || []
                if (!reviews.length) return 0
                return reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
            },
        }),
        { name: 'reelhouse-cinema-reviews' }
    )
)

// â”€â”€ UI STORE â”€â”€
export const useUIStore = create((set) => ({
    logModalOpen: false,
    logModalFilm: null,
    logModalEditLogId: null,
    signupModalOpen: false,
    signupRole: 'cinephile',
    showPaywall: false,
    paywallFeature: null,

    openLogModal: (film = null, editLogId = null) => set({ logModalOpen: true, logModalFilm: film, logModalEditLogId: editLogId }),
    closeLogModal: () => set({ logModalOpen: false, logModalFilm: null, logModalEditLogId: null }),

    openSignupModal: (role = 'cinephile') => set({ signupModalOpen: true, signupRole: role }),
    closeSignupModal: () => set({ signupModalOpen: false }),

    openPaywall: (featureName) => set({ showPaywall: true, paywallFeature: featureName }),
    closePaywall: () => set({ showPaywall: false, paywallFeature: null }),
}))

// â”€â”€ DISCOVER STORE â”€â”€
export const useDiscoverStore = create((set) => ({
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
        mood: null
    }),
    updateFilter: (patch) => set((state) => ({
        filters: { ...state.filters, ...patch },
        page: 1,
        mood: null
    })),
    clearSearch: () => set({ query: '', inputVal: '' })
}))

// â”€â”€ SOUNDSCAPE & HAPTICS STORE â”€â”€
export const useSoundscape = create((set) => ({
    isPlaying: false,
    toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
    playShutter: () => {
        const audio = document.getElementById('shutter-audio')
        if (audio) {
            audio.currentTime = 0
            audio.volume = 0.4
            audio.play().catch(() => { }) // Ignore autoplay blocks
        }
    }
}))

// â”€â”€ ELITE REALTIME SUBSCRIPTIONS â”€â”€
export const initAuthSync = () => {
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser || currentUser.id !== session.user.id) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                useAuthStore.setState({ user: { ...session.user, ...profile }, isAuthenticated: true });
                useFilmStore.getState().fetchLogs();
            }
        } else {
            // Keep the community array alive, just wipe active user
            useAuthStore.setState({ user: null, isAuthenticated: false });
        }
    });
};

export const initRealtime = () => {
    // Listen for live film logs dropped globally by any user
    supabase
        .channel('global_logs_channel')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'logs' },
            (payload) => {
                const currentLogs = useFilmStore.getState().logs;
                // Ensure we don't duplicate logs that this client just inserted optimistically
                if (!currentLogs.find(l => l.id === payload.new.id)) {
                    const newLog = {
                        id: payload.new.id,
                        filmId: payload.new.film_id,
                        title: payload.new.film_title,
                        rating: payload.new.rating,
                        review: payload.new.review,
                        watchedDate: payload.new.watched_date,
                        createdAt: payload.new.created_at
                    };
                    useFilmStore.setState({ logs: [newLog, ...currentLogs] });
                }
            }
        )
        .subscribe();
};
