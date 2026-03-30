import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Users, Calendar, Check, ChevronLeft, ChevronRight, Clock, Film, Tag, Info, ArrowLeft } from 'lucide-react'
import { useAuthStore, useUIStore, useVenueStore } from '../store'
import { SectionHeader } from '../components/UI'
import TicketFlow from '../components/TicketFlow'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import PageSEO from '../components/PageSEO'


// Default seat layout for demo venues
const DEFAULT_SEAT_LAYOUT = { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7 }

// Map a date string to a short day label
function getDayLabel(dateStr: any) {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function MarqueeLetterBoard({ name, tagline }: any) {
    const letters = name.toUpperCase().split('')
    return (
        <div style={{
            display: 'inline-block',
            background: '#0D0A06',
            border: '3px solid var(--sepia)',
            borderRadius: 4,
            padding: '1.5rem 2rem',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 0 30px rgba(139,105,20,0.2)',
            textAlign: 'center',
            margin: '0 auto',
        }}>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                {letters.map((char: any, i: number) => (
                    <div
                        key={i}
                        style={{
                            background: char === ' ' ? 'transparent' : '#1C1710',
                            color: 'var(--flicker)',
                            fontFamily: 'var(--font-display)',
                            fontSize: 'clamp(1.2rem, 3vw, 2rem)',
                            width: char === ' ' ? 12 : 'clamp(1.8rem, 4vw, 2.8rem)',
                            height: 'clamp(2.2rem, 5vw, 3.5rem)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: char === ' ' ? 'none' : '1px solid rgba(139,105,20,0.3)',
                            borderRadius: 2,
                            boxShadow: char !== ' ' ? 'inset 0 0 8px rgba(242,232,160,0.05)' : 'none',
                            textShadow: '0 0 10px rgba(242,232,160,0.6)',
                        }}
                    >
                        {char}
                    </div>
                ))}
            </div>
            {tagline && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.25em', color: 'var(--sepia)', marginTop: '0.5rem' }}>
                    {tagline}
                </div>
            )}
        </div>
    )
}

// ── FULL SCHEDULE SECTION ──
function ScheduleSection({ showtimes, seatLayout, onChooseSeat }: any) {
    // Get all unique dates, sorted
    const dates = useMemo(() => {
        const all = new Set(showtimes.map((s: any) => s.date))
        return [...all].sort()
    }, [showtimes])

    const [selectedDate, setSelectedDate] = useState<any>(dates[0] || '')

    // Group showtimes by date
    const byDate = useMemo(() => {
        const map: any = {}
        showtimes.forEach((st: any) => {
            if (!map[st.date]) map[st.date] = []
            map[st.date].push(st)
        })
        return map
    }, [showtimes])

    const todaysFilms = byDate[selectedDate] || []

    if (showtimes.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--ash)', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                NO SHOWTIMES CURRENTLY SCHEDULED
            </div>
        )
    }

    return (
        <div>
            {/* Date Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
                {dates.map(date => {
                    const isActive = date === selectedDate
                    const dayLabel = getDayLabel(date)
                    return (
                        <button
                            key={date as any}
                            onClick={() => setSelectedDate(date)}
                            style={{
                                background: isActive ? 'rgba(139,105,20,0.18)' : 'transparent',
                                border: `1px solid ${isActive ? 'var(--sepia)' : 'var(--ash)'}`,
                                color: isActive ? 'var(--flicker)' : 'var(--fog)',
                                fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                                letterSpacing: '0.1em', padding: '0.5rem 1rem',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                                transition: 'all 0.2s', flexShrink: 0,
                                borderBottom: isActive ? '2px solid var(--sepia)' : '2px solid transparent',
                            }}
                        >
                            {dayLabel}
                            <span style={{ display: 'block', fontSize: '0.42rem', opacity: 0.7, marginTop: '0.15rem', letterSpacing: '0.05em' }}>
                                {(byDate[date as any] || []).reduce((a: any, st: any) => a + st.slots.length, 0)} SCREENINGS
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Day Programme */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={selectedDate}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                >
                    {todaysFilms.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--ash)', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                            ◻ DARK NIGHT — NO SCREENINGS
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {todaysFilms.map((showtime: any, fi: number) => (
                                <FilmProgramme
                                    key={showtime.id}
                                    showtime={showtime}
                                    seatLayout={seatLayout}
                                    onChooseSeat={onChooseSeat}
                                    index={fi}
                                />
                            ))}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

function FilmProgramme({ showtime, seatLayout, onChooseSeat, index }: any) {
    const totalSeats = (seatLayout?.rows || 10) * (seatLayout?.cols || 15)

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
            style={{
                background: 'var(--ink)', border: '1px solid var(--ash)',
                borderLeft: '3px solid var(--sepia)', overflow: 'hidden',
            }}
        >
            {/* Film Header */}
            <div style={{ padding: '0.9rem 1.25rem', background: 'rgba(139,105,20,0.07)', borderBottom: '1px solid var(--ash)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Film size={13} color="var(--sepia)" style={{ flexShrink: 0 }} />
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', lineHeight: 1.1 }}>{showtime.film}</div>
                </div>
            </div>

            {/* Slots */}
            <div>
                {showtime.slots && showtime.slots.length > 0 ? (
                    showtime.slots.map((slot: any, si: number) => {
                        const taken = slot.bookedSeats?.length || 0
                        const avail = totalSeats - taken
                        const pct = Math.round((taken / totalSeats) * 100)
                        const lowestPrice = slot.ticketTypes?.length
                            ? Math.min(...slot.ticketTypes.map((t: any) => t.price))
                            : null
                        return (
                            <div
                                key={slot.id}
                                style={{
                                    padding: '1rem 1.25rem',
                                    borderTop: si > 0 ? '1px solid var(--ash)' : 'none',
                                    display: 'grid',
                                    gridTemplateColumns: '80px 1fr auto auto',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    background: si % 2 === 1 ? 'rgba(0,0,0,0.15)' : 'transparent',
                                }}
                            >
                                {/* Time */}
                                <div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--flicker)', lineHeight: 1 }}>{slot.time}</div>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.44rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'block', marginTop: 3 }}>{slot.format}</span>
                                </div>

                                {/* Info */}
                                <div>
                                    {/* Ticket types */}
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: slot.notes ? '0.35rem' : 0 }}>
                                        {slot.ticketTypes?.map((tt: any) => (
                                            <span key={tt.id} style={{
                                                fontFamily: 'var(--font-ui)', fontSize: '0.46rem', letterSpacing: '0.08em',
                                                border: `1px solid ${tt.type === 'VIP' ? 'var(--flicker)' : 'var(--ash)'}`,
                                                color: tt.type === 'VIP' ? 'var(--flicker)' : 'var(--fog)',
                                                padding: '2px 7px',
                                            }}>
                                                {tt.type} ${tt.price}
                                            </span>
                                        ))}
                                    </div>
                                    {slot.notes && (
                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Info size={9} style={{ flexShrink: 0 }} /> {slot.notes}
                                        </div>
                                    )}
                                </div>

                                {/* Availability */}
                                <div style={{ textAlign: 'right', minWidth: 70 }}>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: avail < 15 ? 'var(--blood-reel)' : 'var(--fog)', letterSpacing: '0.08em', marginBottom: 4 }}>
                                        {avail < 15 ? `⚠ ${avail} LEFT` : `${avail} seats`}
                                    </div>
                                    <div style={{ width: 70, height: 3, background: 'var(--ash)', borderRadius: 2 }}>
                                        <div style={{ height: '100%', width: '100%', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', background: pct > 80 ? 'var(--blood-reel)' : 'var(--sepia)', borderRadius: 2, transition: 'transform 0.4s' }} />
                                    </div>
                                </div>

                                {/* CTA */}
                                <button
                                    className="btn btn-primary"
                                    onClick={() => onChooseSeat(showtime, slot)}
                                    style={{ fontSize: '0.55rem', padding: '0.35em 0.9em', whiteSpace: 'nowrap' }}
                                >
                                    Choose Seat
                                </button>
                            </div>
                        )
                    })
                ) : (
                    <div style={{ padding: '1rem 1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                        NO TIME SLOTS CONFIGURED
                    </div>
                )}
            </div>
        </motion.div>
    )
}

function EventCard({ event }: any) {
    const typeColors: any = {
        Marathon: 'var(--blood-reel)', Series: 'var(--sepia)',
        Retrospective: 'var(--fog)', Special: 'var(--flicker)', 'Q&A': 'var(--bone)', Premiere: 'var(--flicker)',
    }
    const sold = event.totalTickets - event.ticketsLeft
    const soldPct = Math.round((sold / event.totalTickets) * 100)
    return (
        <motion.div
            className="card"
            whileHover={{ y: -2, transition: { type: 'spring', damping: 12 } }}
            style={{ borderTop: `2px solid ${typeColors[event.type] || 'var(--sepia)'}`, overflow: 'hidden' }}
        >
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.15em', color: typeColors[event.type] || 'var(--sepia)', marginBottom: '0.4rem' }}>
                {event.type?.toUpperCase()} EVENT
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--parchment)', lineHeight: 1.2, marginBottom: '0.5rem' }}>{event.title}</h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', lineHeight: 1.6, marginBottom: '0.75rem' }}>{event.desc}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--flicker)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Calendar size={10} />
                    {getDayLabel(event.date)} · {event.time}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)' }}>${event.price}</div>
            </div>
            {/* Ticket availability */}
            <div style={{ marginTop: '0.75rem' }}>
                <div style={{ height: 3, background: 'var(--ash)', borderRadius: 2, marginBottom: 4 }}>
                    <div style={{ height: '100%', width: '100%', transform: `scaleX(${soldPct / 100})`, transformOrigin: 'left', background: soldPct > 80 ? 'var(--blood-reel)' : typeColors[event.type] || 'var(--sepia)', borderRadius: 2 }} />
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.46rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                    {event.ticketsLeft} TICKETS REMAINING · {soldPct}% SOLD
                </div>
            </div>
        </motion.div>
    )
}

// ── OTHER PALACES SIDEBAR — live from Supabase ──
function OtherPalacesSidebar({ currentId }: any) {
    const { data: venues = [], isLoading } = useQuery({
        queryKey: ['other-palaces', currentId],
        queryFn: async () => {
            const { data } = await supabase
                .from('venues')
                .select('id, name, location')
                .neq('id', currentId)
                .limit(6)
            return data || []
        },
        staleTime: 1000 * 60 * 10,
    })
    if (isLoading) return null
    return (
        <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                {venues.length > 0 ? 'OTHER PALACES' : 'THE ATLAS'}
            </div>
            {venues.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', fontStyle: 'italic', lineHeight: 1.6 }}>
                    The Society is growing. More Palaces are joining the atlas soon.
                </div>
            ) : venues.map((v: any) => (
                <Link
                    key={v.id}
                    to={`/venue/${v.id}`}
                    style={{ display: 'block', padding: '0.5rem 0', borderBottom: '1px solid var(--ash)', textDecoration: 'none' }}
                >
                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--parchment)' }}>{v.name}</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.08em', color: 'var(--fog)', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={8} />{v.location}
                    </div>
                </Link>
            ))}
        </div>
    )
}

export default function VenuePage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { isAuthenticated } = useAuthStore()
    const { openSignupModal } = useUIStore()

    const { data: venue, isLoading: loadingVenue } = useQuery({
        queryKey: ['venue', id],
        enabled: !!id,
        queryFn: async () => {
            const { data, error } = await supabase.from('venues').select('*').eq('id', id).single()
            if (error) throw error
            return {
                id: data.id,
                name: data.name,
                location: data.location || 'Unknown Location',
                description: data.description || 'Welcome to our cinema.',
                vibes: data.vibes || [],
                followers: data.followers || 0,
                verified: data.verified || false,
                logo: data.logo || '',
                seatLayout: data.seat_layout || { rows: 10, cols: 15, vipRows: 2, aisleAfterCol: 7 },
                paymentConnected: !!data.stripe_account_id
            }
        }
    })

    const { data: rawShowtimes = [] } = useQuery({
        queryKey: ['showtimes', id],
        enabled: !!id,
        queryFn: async () => {
            const { data, error } = await supabase.from('showtimes')
                .select('*')
                .eq('venue_id', id)
                .gte('date', new Date().toISOString().split('T')[0])
                .order('date', { ascending: true })
            if (error) return []
            return data
        }
    })

    const { data: eventsToShow = [] } = useQuery({
        queryKey: ['venue-events', id],
        enabled: !!id,
        queryFn: async () => {
            // Fails gracefully if venue_events does not exist gracefully.
            const { data, error } = await supabase.from('venue_events').select('*').eq('venue_id', id).gte('date', new Date().toISOString().split('T')[0])
            if (error) return []
            return data
        }
    })

    const [following, setFollowing] = useState(false)
    const [ticketTarget, setTicketTarget] = useState<any>(null)

    const showtimesToShow = useMemo(() => {
        const grouped: any = {}
        rawShowtimes.forEach((st: any) => {
            const key = `${st.film_id || st.film_title}-${st.date}`
            if (!grouped[key]) {
                grouped[key] = {
                    dbId: st.id,
                    id: st.id,
                    film: st.film_title || 'Unknown Film',
                    date: st.date,
                    screenName: st.screen_name || 'Main Screen',
                    slots: []
                }
            }
            grouped[key].slots.push({
                id: st.id,
                time: st.time,
                format: st.format || 'Digital',
                notes: st.notes || '',
                bookedSeats: st.booked_seats || [],
                ticketTypes: st.ticket_types || [{ id: 'std', type: 'Standard', price: 15, perks: 'General admission' }]
            })
        })
        return Object.values(grouped)
    }, [rawShowtimes])

    if (loadingVenue) {
        return <div style={{ minHeight: '100dvh', background: 'var(--ink)' }}></div>
    }

    if (!venue) {
        return <div style={{ minHeight: '100dvh', padding: '10rem 0', textAlign: 'center', background: 'var(--ink)' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--fog)', letterSpacing: '0.1em' }}>404 · VENUE NOT FOUND</h1>
            <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--ash)', fontSize: '0.7rem', marginTop: '1rem', letterSpacing: '0.1em' }}>
                <Link to="/discover" style={{ color: 'var(--sepia)', textDecoration: 'none' }}>RETURN TO CIVILIZATION</Link>
            </p>
        </div>
    }

    const seatLayout = venue.seatLayout

    const handleFollow = () => {
        if (!isAuthenticated) { openSignupModal(); return }
        setFollowing(v => !v)
        toast.success(following ? `Unfollowed ${venue.name}` : `Following ${venue.name}!`)
    }

    const handleChooseSeat = (showtime: any, slot: any) => {
        if (!isAuthenticated) { openSignupModal(); return }
        setTicketTarget({ showtime, slot } as any)
    }

    return (
        <div className="page-top" style={{ minHeight: '100dvh' }}>
            {/* ── Back Button ── */}
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem 1.5rem 0' }}>
                <button
                    onClick={() => navigate('/cinemas')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
                >
                    <ArrowLeft size={14} /> BACK TO CINEMAS
                </button>
            </div>
            <AnimatePresence>
                {ticketTarget && (
                    <TicketFlow
                        showtime={ticketTarget.showtime}
                        slot={ticketTarget.slot}
                        venueSeatLayout={seatLayout as any}
                        onClose={() => setTicketTarget(null)}
                    />
                )}
            </AnimatePresence>

            {/* Marquee Header */}
            <div className="venue-marquee-header" style={{ padding: '4rem 0 3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: '2rem', opacity: 0.2 }}>
                    {Array.from({ length: 14 }).map((_, i) => (
                        <div key={i} style={{ width: 28, height: 20, border: '1px solid var(--sepia)', borderRadius: 1 }} />
                    ))}
                </div>

                <div className="container" style={{ textAlign: 'center' }}>
                    <MarqueeLetterBoard name={venue.name} tagline={venue.location} />

                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {venue.vibes.map((v: any) => (
                            <span key={v} className="tag tag-vibe">⟡ {v}</span>
                        ))}
                        {venue.verified && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                                letterSpacing: '0.12em', color: 'var(--flicker)',
                                border: '1px solid var(--flicker)', padding: '0.2em 0.6em', borderRadius: 2,
                            }}>
                                ✦ VERIFIED HOUSE
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            <Users size={12} /> {venue.followers.toLocaleString()} FOLLOWERS
                        </div>
                        <button
                            className={`btn ${following ? 'btn-ghost' : 'btn-primary'}`}
                            style={{ fontSize: '0.65rem' }}
                            onClick={handleFollow}
                        >
                            {following ? <><Check size={12} /> Following</> : '+ Follow This House'}
                        </button>
                    </div>
                </div>
            </div>

            <main style={{ padding: '2.5rem 0 5rem' }}>
                <div className="container">
                    {/* Responsive sidebar layout */}
                    <style>{`.venue-grid-layout { display: grid; grid-template-columns: 1fr; gap: 2.5rem; } @media (min-width: 900px) { .venue-grid-layout { grid-template-columns: 1fr 300px; } }`}</style>
                    <div className="venue-grid-layout">
                    {/* Main Content */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', minWidth: 0 }}>
                        {/* About */}
                        <section>
                            <SectionHeader label="ABOUT THE HOUSE" title="Our Story" />
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', lineHeight: 1.8 }}>
                                {venue.description}
                            </p>
                        </section>

                        {/* Events */}
                        {eventsToShow.length > 0 && (
                            <section>
                                <SectionHeader label="SPECIAL EVENTS" title="The Programme" />
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                                    {eventsToShow.map((event: any, i: number) => (
                                        <EventCard key={event.id || i} event={event} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Showtimes — Full Schedule */}
                        <section>
                            <SectionHeader label="NOW SHOWING" title="Full Schedule" />
                            <ScheduleSection
                                showtimes={showtimesToShow}
                                seatLayout={seatLayout}
                                onChooseSeat={handleChooseSeat}
                            />
                        </section>
                    </div>

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Info Card */}
                        <div className="card">
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                                VENUE DOSSIER
                            </div>
                            {[
                                { label: 'LOCATION', value: venue.location },
                                { label: 'FOLLOWERS', value: venue.followers.toLocaleString() },
                                { label: 'STATUS', value: venue.verified ? '✦ VERIFIED HOUSE' : 'Community Listed' },
                                { label: 'FILMS THIS WEEK', value: `${showtimesToShow.length} film${showtimesToShow.length !== 1 ? 's' : ''}` },
                                { label: 'SCREENINGS', value: `${showtimesToShow.reduce((a: any, s: any) => a + s.slots.length, 0)} total` },
                                { label: 'EVENTS', value: `${eventsToShow.length} upcoming` },
                            ].map(({ label, value }: any) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{label}</span>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--bone)' }}>{value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Other Palaces — live from Supabase */}
                        <OtherPalacesSidebar currentId={venue.id} />

                    </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
