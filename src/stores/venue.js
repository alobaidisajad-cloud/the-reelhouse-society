import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'

// ── VENUE STORE — owner data + showtime management ──
export const useVenueStore = create(
    persist(
        (set, get) => ({
            venue: {
                id: null,
                name: 'The Oracle Palace',
                location: 'Brooklyn, NY',
                address: '42 Clinton Ave, Brooklyn, NY 11238',
                description: 'Established in 1934 in a converted Masonic lodge.',
                bio: 'We believe cinema is not entertainment — it is ritual.',
                email: '', phone: '', website: '', instagram: '',
                logo: null,
                vibes: ['Arthouse', 'Midnight Palace'],
                seatLayout: { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7, blockedSeats: [] },
                screens: [], // [] means single-screen (fallback to seatLayout)
                lat: null, lng: null,
                followers: 0,
                verified: false, paymentConnected: false, platformFeePercent: 15,
            },
            showtimes: [],
            events: [],

            fetchVenueData: async () => {
                const user = useAuthStore.getState().user
                if (!user) return
                const { data: venueData } = await supabase
                    .from('venues').select('*').eq('owner_id', user.id).single()
                if (venueData) {
                    set((s) => ({ venue: { ...s.venue, ...venueData, id: venueData.id, screens: venueData.screens || [], lat: venueData.lat || null, lng: venueData.lng || null } }))
                    const { data: stData } = await supabase
                        .from('showtimes').select('*').eq('venue_id', venueData.id).order('date', { ascending: true })
                    if (stData) set({ showtimes: stData.map((st) => ({ ...st, film: st.film_title, slots: st.slots || [], screenName: st.screen_name || '', durationMins: st.duration_minutes || 0 })) })
                }
            },

            updateVenue: async (updates) => {
                const user = useAuthStore.getState().user
                set((s) => ({ venue: { ...s.venue, ...updates } })) // Optimistic
                if (!user) return
                const venueId = get().venue.id
                if (venueId) {
                    await supabase.from('venues').update({
                        name: updates.name, location: updates.location, address: updates.address,
                        description: updates.description, bio: updates.bio, email: updates.email,
                        phone: updates.phone, website: updates.website, instagram: updates.instagram,
                        vibes: updates.vibes, seat_layout: updates.seatLayout,
                        lat: updates.lat ?? null, lng: updates.lng ?? null,
                    }).eq('id', venueId)
                } else {
                    const { data } = await supabase.from('venues').insert([{
                        owner_id: user.id, name: updates.name || get().venue.name,
                        location: updates.location || get().venue.location,
                        address: updates.address, description: updates.description, bio: updates.bio,
                        email: updates.email, phone: updates.phone, website: updates.website,
                        instagram: updates.instagram, vibes: updates.vibes || [],
                        seat_layout: updates.seatLayout || get().venue.seatLayout,
                        lat: updates.lat ?? null, lng: updates.lng ?? null,
                    }]).select().single()
                    if (data) set((s) => ({ venue: { ...s.venue, id: data.id } }))
                }
            },

            saveScreens: async ({ screens, seatLayout }) => {
                set((s) => ({ venue: { ...s.venue, screens, seatLayout } }))
                const venueId = get().venue.id
                if (venueId) {
                    await supabase.from('venues').update({ screens, seat_layout: seatLayout }).eq('id', venueId)
                }
            },

            addShowtime: async (st) => {
                const venueId = get().venue.id
                const optimistic = { ...st, id: 'st-' + Date.now(), slots: [], film: st.film, screenName: st.screenName || '', durationMins: st.durationMins || 0 }
                set((s) => ({ showtimes: [optimistic, ...s.showtimes] }))
                if (venueId) {
                    const { data } = await supabase.from('showtimes').insert([{
                        venue_id: venueId, film_id: st.filmId || 0, film_title: st.film, date: st.date, slots: [],
                        screen_name: st.screenName || null, duration_minutes: st.durationMins || null,
                    }]).select().single()
                    if (data) set((s) => ({
                        showtimes: s.showtimes.map((x) => x.id === optimistic.id ? { ...x, id: data.id } : x),
                    }))
                }
            },

            removeShowtime: async (id) => {
                set((s) => ({ showtimes: s.showtimes.filter((x) => x.id !== id) }))
                await supabase.from('showtimes').delete().eq('id', id)
            },

            addSlot: async (stId, slot) => {
                const newSlot = { ...slot, id: 'slot-' + Date.now(), bookedSeats: [] }
                set((s) => ({ showtimes: s.showtimes.map((st) => st.id === stId ? { ...st, slots: [...st.slots, newSlot] } : st) }))
                const showtime = get().showtimes.find((s) => s.id === stId)
                if (showtime) await supabase.from('showtimes').update({ slots: showtime.slots }).eq('id', stId)
            },

            removeSlot: async (stId, slotId) => {
                set((s) => ({ showtimes: s.showtimes.map((st) => st.id === stId ? { ...st, slots: st.slots.filter((sl) => sl.id !== slotId) } : st) }))
                const showtime = get().showtimes.find((s) => s.id === stId)
                if (showtime) await supabase.from('showtimes').update({ slots: showtime.slots }).eq('id', stId)
            },

            updateSlot: async (stId, slotId, updates) => {
                set((s) => ({ showtimes: s.showtimes.map((st) => st.id === stId ? { ...st, slots: st.slots.map((sl) => sl.id === slotId ? { ...sl, ...updates } : sl) } : st) }))
                const showtime = get().showtimes.find((s) => s.id === stId)
                if (showtime) await supabase.from('showtimes').update({ slots: showtime.slots }).eq('id', stId)
            },

            bookSeat: async (stId, slotId, seatId) => {
                set((s) => ({ showtimes: s.showtimes.map((st) => st.id === stId ? { ...st, slots: st.slots.map((sl) => sl.id === slotId ? { ...sl, bookedSeats: [...sl.bookedSeats, seatId] } : sl) } : st) }))
                const showtime = get().showtimes.find((s) => s.id === stId)
                if (showtime) await supabase.from('showtimes').update({ slots: showtime.slots }).eq('id', stId)
            },

            addEvent: (ev) => set((s) => ({ events: [{ ...ev, id: 'ev-' + Date.now(), ticketsLeft: ev.totalTickets }, ...s.events] })),
            removeEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
            updateEvent: (id, u) => set((s) => ({ events: s.events.map((e) => e.id === id ? { ...e, ...u } : e) })),
            connectPayment: (info) => set((s) => ({ venue: { ...s.venue, paymentConnected: true, ...info } })),
        }),
        { name: 'reelhouse-venue-v5' }
    )
)

// ── CINEMA REVIEW STORE — community cinema ratings ──
export const useCinemaReviewStore = create((set, get) => ({
    reviews: {},

    fetchReviews: async (cinemaId) => {
        const { data, error } = await supabase
            .from('cinema_reviews')
            .select('*, profiles!cinema_reviews_user_id_fkey(username)')
            .eq('cinema_id', cinemaId)
            .order('created_at', { ascending: false })
        if (!error && data) {
            set((state) => ({
                reviews: {
                    ...state.reviews,
                    [cinemaId]: data.map((r) => ({
                        id: r.id,
                        username: r.profiles?.username || 'Anonymous',
                        rating: r.rating,
                        review: r.review,
                        createdAt: r.created_at,
                    })),
                },
            }))
        }
    },

    addReview: async (cinemaId, cinemaName, { username, rating, review }) => {
        const user = useAuthStore.getState().user
        if (!user) return
        const { data, error } = await supabase
            .from('cinema_reviews')
            .upsert([{ user_id: user.id, cinema_id: cinemaId, cinema_name: cinemaName, rating, review }], { onConflict: 'user_id,cinema_id' })
            .select().single()
        if (!error && data) {
            set((state) => {
                const existing = state.reviews[cinemaId] || []
                const filtered = existing.filter((r) => r.username !== username)
                return {
                    reviews: {
                        ...state.reviews,
                        [cinemaId]: [{ id: data.id, username, rating, review, createdAt: data.created_at }, ...filtered],
                    },
                }
            })
        }
    },

    getReviews: (cinemaId) => get().reviews[cinemaId] || [],
    getAvgRating: (cinemaId) => {
        const reviews = get().reviews[cinemaId] || []
        if (!reviews.length) return 0
        return reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
    },
}))
