import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { supabase, isSupabaseConfigured } from './supabaseClient'

// ── AUTH STORE ──
export const useAuthStore = create(
    persist(
        (set) => ({
            user: null, // Will hold actual Supabase auth user + profile data
            isAuthenticated: false,
            // Keeping mock community for UI purposes until fully migrated

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
                useFilmStore.getState().fetchWatchlist()
                useFilmStore.getState().fetchVault()
                useFilmStore.getState().fetchLists()
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
                    useFilmStore.getState().fetchWatchlist()
                    useFilmStore.getState().fetchVault()
                    useFilmStore.getState().fetchLists()
                }

                return data
            },

            logout: async () => {
                await supabase.auth.signOut()
                set({ user: null, isAuthenticated: false })
            },

            updateUser: async (updates) => {
                const user = get().user;
                if (!user) return;
                // Persist to Supabase profiles table
                const dbUpdates = {};
                if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
                if (updates.username !== undefined) dbUpdates.username = updates.username;
                if (updates.avatar !== undefined) dbUpdates.avatar_url = updates.avatar;
                if (updates.isSocialPrivate !== undefined) dbUpdates.is_social_private = updates.isSocialPrivate;
                if (updates.role !== undefined) dbUpdates.role = updates.role;

                if (Object.keys(dbUpdates).length > 0) {
                    await supabase.from('profiles').update(dbUpdates).eq('id', user.id).catch(() => { });
                }
                // Update Zustand
                set((state) => ({
                    user: state.user ? { ...state.user, ...updates } : null,
                }));
            },

            followUser: async (targetUsername) => {
                const state = get();
                const following = state.user?.following || [];
                if (following.includes(targetUsername)) return;
                const fromUsername = state.user?.username || 'someone';
                const userId = state.user?.id;

                // 1. Persist follow to interactions table
                if (userId) {
                    const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', targetUsername).single().catch(() => ({}));
                    if (targetProfile) {
                        await supabase.from('interactions').insert([{
                            user_id: userId,
                            target_user_id: targetProfile.id,
                            type: 'follow'
                        }]).catch(() => { });
                        // Push notification
                        await supabase.from('notifications').insert([{
                            user_id: targetProfile.id,
                            type: 'follow',
                            from_username: fromUsername,
                            message: `${fromUsername} followed you`,
                        }]).catch(() => { });
                    }
                }

                useNotificationStore.getState().push({
                    type: 'follow', from: fromUsername,
                    message: `${fromUsername} followed you`,
                });
                set((s) => ({
                    user: { ...s.user, following: [...(s.user?.following || []), targetUsername] },
                    community: s.community.map(u => u.username === targetUsername
                        ? { ...u, followers: [...(u.followers || []), s.user?.username] } : u)
                }));
            },

            unfollowUser: async (targetUsername) => {
                const userId = get().user?.id;
                // Remove from interactions table
                if (userId) {
                    const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', targetUsername).single().catch(() => ({}));
                    if (targetProfile) {
                        await supabase.from('interactions').delete()
                            .eq('user_id', userId)
                            .eq('target_user_id', targetProfile.id)
                            .eq('type', 'follow').catch(() => { });
                    }
                }
                set((s) => ({
                    user: { ...s.user, following: (s.user?.following || []).filter(u => u !== targetUsername) },
                    community: s.community.map(u => u.username === targetUsername
                        ? { ...u, followers: (u.followers || []).filter(f => f !== s.user?.username) } : u)
                }));
            },
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
                        poster: dbLog.poster_path || null,
                        year: dbLog.year || null,
                        rating: dbLog.rating,
                        review: dbLog.review,
                        status: dbLog.status || 'watched',
                        isSpoiler: dbLog.is_spoiler || false,
                        watchedDate: dbLog.watched_date,
                        watchedWith: dbLog.watched_with || null,
                        privateNotes: dbLog.private_notes || null,
                        abandonedReason: dbLog.abandoned_reason || null,
                        physicalMedia: dbLog.physical_media || null,
                        isAutopsied: dbLog.is_autopsied || false,
                        autopsy: dbLog.autopsy || null,
                        altPoster: dbLog.alt_poster || null,
                        editorialHeader: dbLog.editorial_header || null,
                        dropCap: dbLog.drop_cap || false,
                        pullQuote: dbLog.pull_quote || '',
                        createdAt: dbLog.created_at
                    }));
                    set({ logs: formattedLogs });
                }
            },

            fetchWatchlist: async () => {
                const user = useAuthStore.getState().user;
                if (!user) return;
                const { data, error } = await supabase.from('watchlists').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
                if (!error && data) {
                    set({
                        watchlist: data.map(w => ({
                            id: w.film_id,
                            title: w.film_title,
                            poster_path: w.poster_path || null,
                            year: w.year || null,
                        }))
                    });
                }
            },

            fetchVault: async () => {
                const user = useAuthStore.getState().user;
                if (!user) return;
                const { data, error } = await supabase.from('vaults').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
                if (!error && data) {
                    set({
                        vault: data.map(v => ({
                            id: v.film_id,
                            title: v.film_title,
                            poster_path: v.poster_path || null,
                            year: v.year || null,
                            format: v.format || 'Digital',
                        }))
                    });
                }
            },

            fetchLists: async () => {
                const user = useAuthStore.getState().user;
                if (!user) return;
                const { data: lists, error } = await supabase.from('lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
                if (!error && lists) {
                    // Fetch items for each list
                    const fullLists = await Promise.all(lists.map(async (list) => {
                        const { data: items } = await supabase.from('list_items').select('*').eq('list_id', list.id);
                        return {
                            id: list.id,
                            title: list.title,
                            description: list.description,
                            isRanked: list.is_ranked,
                            createdAt: list.created_at,
                            films: (items || []).map(i => ({ id: i.film_id, title: i.film_title }))
                        };
                    }));
                    set({ lists: fullLists });
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
                    poster_path: log.poster || null,
                    year: log.year || null,
                    rating: log.rating || 0,
                    review: log.review || '',
                    status: log.status || 'watched',
                    is_spoiler: log.isSpoiler || false,
                    watched_date: log.watchedDate || new Date().toISOString(),
                    watched_with: log.watchedWith || null,
                    private_notes: log.privateNotes || null,
                    abandoned_reason: log.abandonedReason || null,
                    physical_media: log.physicalMedia || null,
                    is_autopsied: log.isAutopsied || false,
                    autopsy: log.autopsy || null,
                    alt_poster: log.altPoster || null,
                    editorial_header: log.editorialHeader || null,
                    drop_cap: log.dropCap || false,
                    pull_quote: log.pullQuote || '',
                    format: log.physicalMedia || 'Digital'
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
                // Map camelCase to snake_case for DB
                const dbUpdates = {};
                if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
                if (updates.review !== undefined) dbUpdates.review = updates.review;
                if (updates.status !== undefined) dbUpdates.status = updates.status;
                if (updates.isSpoiler !== undefined) dbUpdates.is_spoiler = updates.isSpoiler;
                if (updates.watchedDate !== undefined) dbUpdates.watched_date = updates.watchedDate;
                if (updates.watchedWith !== undefined) dbUpdates.watched_with = updates.watchedWith;
                if (updates.privateNotes !== undefined) dbUpdates.private_notes = updates.privateNotes;
                if (updates.abandonedReason !== undefined) dbUpdates.abandoned_reason = updates.abandonedReason;
                if (updates.physicalMedia !== undefined) dbUpdates.physical_media = updates.physicalMedia;
                if (updates.isAutopsied !== undefined) dbUpdates.is_autopsied = updates.isAutopsied;
                if (updates.autopsy !== undefined) dbUpdates.autopsy = updates.autopsy;

                const { error } = await supabase.from('logs').update(dbUpdates).eq('id', id);
                if (!error) set((state) => ({ logs: state.logs.map((l) => l.id === id ? { ...l, ...updates } : l) }));
            },

            removeLog: async (id) => {
                const user = useAuthStore.getState().user;
                const isPaid = user?.role === 'archivist' || user?.role === 'auteur';
                const logToRemove = get().logs.find(l => l.id === id);

                if (isPaid && logToRemove) {
                    // Paid tier: soft delete with undo toast
                    set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }));

                    let undone = false;
                    const { default: toast } = await import('react-hot-toast');
                    toast((t) => {
                        // Return a simple string-based toast since we can't use JSX in store
                        return `"${logToRemove.title}" removed. Tap to undo.`
                    }, {
                        duration: 5000,
                        icon: '🗑️',
                        style: { background: 'var(--soot)', color: 'var(--parchment)', border: '1px solid var(--sepia)', fontFamily: 'var(--font-sub)', cursor: 'pointer' },
                        id: `undo-${id}`,
                    });

                    // Listen for dismiss — actually delete after 5s
                    setTimeout(async () => {
                        if (!undone) {
                            await supabase.from('logs').delete().eq('id', id);
                        }
                    }, 5200);

                    // Expose undo function on window for this specific log
                    window.__rh_undo_log = () => {
                        undone = true;
                        set((state) => ({ logs: [logToRemove, ...state.logs] }));
                        const { default: t } = import('react-hot-toast').then(m => m.default.dismiss(`undo-${id}`));
                        import('react-hot-toast').then(m => m.default.success(`"${logToRemove.title}" restored ✦`));
                    };
                } else {
                    // Free tier: instant delete, no undo
                    const { error } = await supabase.from('logs').delete().eq('id', id);
                    if (!error) set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }));
                }
            },

            addToWatchlist: async (film) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { error } = await supabase.from('watchlists').insert([{
                    user_id: user.id,
                    film_id: film.id,
                    film_title: film.title || film.name || 'Unknown',
                    poster_path: film.poster_path || null,
                    year: film.release_date ? new Date(film.release_date).getFullYear() : null,
                }]);

                if (!error) {
                    set((state) => ({
                        watchlist: state.watchlist.find((f) => f.id === film.id) ? state.watchlist : [...state.watchlist, { id: film.id, title: film.title || film.name, poster_path: film.poster_path, year: film.release_date ? new Date(film.release_date).getFullYear() : null }],
                    }));
                }
            },

            removeFromWatchlist: async (filmId) => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { error } = await supabase.from('watchlists').delete().eq('user_id', user.id).eq('film_id', filmId);
                if (!error) set((state) => ({ watchlist: state.watchlist.filter((f) => f.id !== filmId) }));
            },

            addToVault: async (film, format = 'Digital') => {
                const user = useAuthStore.getState().user;
                if (!user) return;

                const { error } = await supabase.from('vaults').insert([{
                    user_id: user.id,
                    film_id: film.id,
                    film_title: film.title || film.name || 'Unknown',
                    poster_path: film.poster_path || null,
                    year: film.release_date ? new Date(film.release_date).getFullYear() : null,
                    format,
                }]);

                if (!error) {
                    set((state) => ({
                        vault: state.vault.find((f) => f.id === film.id) ? state.vault : [...state.vault, { id: film.id, title: film.title || film.name, poster_path: film.poster_path, format }],
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
    handbookOpen: false,

    openHandbook: () => set({ handbookOpen: true }),
    closeHandbook: () => set({ handbookOpen: false }),

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
    if (!isSupabaseConfigured) return  // Don't attempt auth sync with placeholder credentials
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser || currentUser.id !== session.user.id) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                useAuthStore.setState({ user: { ...session.user, ...profile }, isAuthenticated: true });
                // Fetch all user data from Supabase
                useFilmStore.getState().fetchLogs();
                useFilmStore.getState().fetchWatchlist();
                useFilmStore.getState().fetchVault();
                useFilmStore.getState().fetchLists();
            }
        } else {
            // Keep the community array alive, just wipe active user
            useAuthStore.setState({ user: null, isAuthenticated: false });
        }
    });
};

export const initRealtime = () => {
    if (!isSupabaseConfigured) return

    // 1. Live global feed — all new log entries from any user
    supabase
        .channel('global_logs_feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, (payload) => {
            const currentLogs = useFilmStore.getState().logs;
            const currentUserId = useAuthStore.getState().user?.id;
            // Don't duplicate our own optimistic inserts
            if (!currentLogs.find(l => l.id === payload.new.id) && payload.new.user_id !== currentUserId) {
                const newLog = {
                    id: payload.new.id,
                    filmId: payload.new.film_id,
                    title: payload.new.film_title,
                    poster: payload.new.poster_path,
                    year: payload.new.year,
                    rating: payload.new.rating,
                    review: payload.new.review,
                    watchedDate: payload.new.watched_date,
                    createdAt: payload.new.created_at,
                };
                useFilmStore.setState({ logs: [newLog, ...currentLogs] });
            }
        })
        .subscribe();

    // 2. Real-time notifications for the logged-in user
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
        supabase
            .channel(`user_notifications_${userId}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
                (payload) => {
                    useNotificationStore.getState().push({
                        id: payload.new.id,
                        type: payload.new.type,
                        from: payload.new.from_username,
                        message: payload.new.message,
                        timestamp: payload.new.created_at,
                    });
                }
            )
            .subscribe();
    }
};

// ── DISPATCH STORE — Supabase-backed ──
export const useDispatchStore = create((set, get) => ({
    dossiers: [],
    loading: false,

    fetchDossiers: async () => {
        set({ loading: true });
        const { data, error } = await supabase
            .from('dispatch_dossiers')
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .limit(20);
        if (!error && data) {
            set({
                dossiers: data.map(d => ({
                    id: d.id,
                    title: d.title,
                    excerpt: d.excerpt || '',
                    fullContent: d.full_content || '',
                    author: d.author_username?.toUpperCase() || 'ANONYMOUS',
                    date: new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase(),
                }))
            });
        }
        // Fallback seed data when table is empty
        if (error || !data?.length) {
            set({
                dossiers: [
                    { id: 'seed-1', title: 'The Death of the Jump Scare', excerpt: 'Why modern horror is trading cheap thrills for existential dread, and why audiences are finally craving atmosphere over adrenaline.', fullContent: '', author: 'MIDNIGHT_MUSE', date: 'MAR 07, 2026' },
                    { id: 'seed-2', title: '35mm in the Desert', excerpt: 'A dispatch from the Southwest\'s last true projectionist. The heat is melting the reels, but the show goes on.', fullContent: '', author: 'ARCHIVE_GHOST', date: 'MAR 06, 2026' },
                ]
            });
        }
        set({ loading: false });
    },

    addDossier: async (dossier) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const { data, error } = await supabase
            .from('dispatch_dossiers')
            .insert([{ user_id: user.id, author_username: user.username, title: dossier.title, excerpt: dossier.excerpt || '', full_content: dossier.fullContent || '', is_published: true }])
            .select().single();
        if (!error && data) {
            set(state => ({ dossiers: [{ id: data.id, title: data.title, excerpt: data.excerpt, fullContent: data.full_content, author: data.author_username?.toUpperCase(), date: new Date(data.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase() }, ...state.dossiers] }));
        }
    },
}));

export const useProgrammeStore = create((set, get) => ({
    programmes: [],
    loading: false,

    fetchProgrammes: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        set({ loading: true });
        const { data, error } = await supabase
            .from('programmes')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (!error && data) {
            set({
                programmes: data.map(p => ({
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    films: p.films || [],
                    isPublic: p.is_public,
                    createdAt: p.created_at,
                }))
            });
        }
        set({ loading: false });
    },

    addProgramme: async (programme) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const { data, error } = await supabase
            .from('programmes')
            .insert([{ user_id: user.id, title: programme.title, description: programme.description || '', films: programme.films || [], is_public: programme.isPublic !== false }])
            .select().single();
        if (!error && data) {
            set(state => ({
                programmes: [{ id: data.id, title: data.title, description: data.description, films: data.films, isPublic: data.is_public, createdAt: data.created_at }, ...state.programmes]
            }));
        }
    },

    removeProgramme: async (id) => {
        const { error } = await supabase.from('programmes').delete().eq('id', id);
        if (!error) {
            set(state => ({ programmes: state.programmes.filter(p => p.id !== id) }));
        }
    },
}));

// ── NOTIFICATION STORE ──
export const useNotificationStore = create(
    persist(
        (set, get) => ({
            notifications: [],
            // Push a notification: { type: 'follow'|'reaction'|'endorse'|'system', from: string, message: string, filmTitle?: string, timestamp: string }
            push: (notif) => set(state => ({
                notifications: [
                    { id: notif.id || ('n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)), read: false, timestamp: new Date().toISOString(), ...notif },
                    ...state.notifications
                ].slice(0, 50)
            })),
            setNotifications: (notifs) => set({ notifications: notifs }),
            markRead: (id) => set(state => ({
                notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
            })),
            markAllRead: () => set(state => ({
                notifications: state.notifications.map(n => ({ ...n, read: true }))
            })),
            dismiss: (id) => set(state => ({
                notifications: state.notifications.filter(n => n.id !== id)
            })),
            clearAll: () => set({ notifications: [] }),
            unreadCount: () => get().notifications.filter(n => !n.read).length,
        }),
        { name: 'reelhouse-notifications' }
    )
);
