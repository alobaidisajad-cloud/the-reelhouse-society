import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Users, Calendar, Check, ChevronLeft, ChevronRight, Clock, Film, Tag, Info } from 'lucide-react'
import { useAuthStore, useUIStore, useVenueStore } from '../store'
import { SectionHeader } from '../components/UI'
import TicketFlow from '../components/TicketFlow'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'

// ── DEMO VENUES ──
const DEMO_VENUES = {
    1: {
        id: 1, name: 'The Oracle Palace', location: 'Brooklyn, NY',
        slug: 'oracle-palace',
        description: 'Established in 1934 in a converted Masonic lodge, The Oracle Palace has screened everything from early talkie debuts to underground horror marathons. Our 35mm projection booth has never gone dark. We believe cinema is not entertainment — it is ritual.',
        vibes: ['Arthouse', 'Midnight Palace', 'Repertory'],
        verified: true, followers: 1247,
        events: [
            { id: 'ev1', title: 'MIDNIGHT HORROR MARATHON', desc: '6 films. No sleep. No mercy.', date: '2026-03-15', time: '23:00', type: 'Marathon', price: 45, ticketsLeft: 40, totalTickets: 60 },
            { id: 'ev2', title: 'GERMAN EXPRESSIONISM SERIES', desc: '4-week deep dive into the movement that gave us shadows, madness, and modern horror.', date: '2026-03-20', time: '20:00', type: 'Series', price: 18, ticketsLeft: 25, totalTickets: 50 },
        ],
    },
    2: {
        id: 2, name: 'Lighthouse Cinema', location: 'Austin, TX',
        slug: 'lighthouse-cinema',
        description: 'A beloved indie cinema showing the films your local multiplex is afraid of. We program for the curious, the patient, and the adventurous.',
        vibes: ['Indie', 'Repertory', 'Arthouse'],
        verified: false, followers: 892,
        showtimes: [
            {
                id: 'lh-st1', film: 'Akira (1988)', date: '2026-03-14',
                slots: [
                    { id: 'lh-sl1', time: '19:30', format: 'DCP 4K', notes: 'Newly restored print', bookedSeats: ['A1', 'A2', 'B3', 'C1'], ticketTypes: [{ id: 'lh-tt1', type: 'Standard', price: 14, perks: 'General seating' }] },
                    { id: 'lh-sl2', time: '22:00', format: 'DCP 4K', notes: 'Late screening', bookedSeats: ['A1'], ticketTypes: [{ id: 'lh-tt2', type: 'Standard', price: 14, perks: 'General seating' }] },
                ]
            },
            {
                id: 'lh-st2', film: 'Perfect Blue (1997)', date: '2026-03-15',
                slots: [
                    { id: 'lh-sl3', time: '21:00', format: '35mm', notes: '', bookedSeats: ['A1', 'B1', 'C2', 'D3', 'D4', 'E5'], ticketTypes: [{ id: 'lh-tt3', type: 'Standard', price: 16, perks: 'General seating' }, { id: 'lh-tt4', type: 'VIP', price: 25, perks: 'Rows A–B + drink' }] },
                ]
            },
        ],
        events: [{ id: 'lh-ev1', title: 'SATOSHI KON RETROSPECTIVE', desc: 'Every film. All four of them.', date: '2026-03-14', time: '18:00', type: 'Retrospective', price: 22, ticketsLeft: 15, totalTickets: 40 }],
    },
    3: {
        id: 3, name: 'The Neon Coffin', location: 'Chicago, IL',
        slug: 'neon-coffin',
        description: 'We only show horror. We never apologize for it.',
        vibes: ['Horror House', 'Drive-In'],
        verified: true, followers: 2103,
        showtimes: [
            {
                id: 'nc-st1', film: 'Deep Red (1975)', date: '2026-03-14',
                slots: [
                    { id: 'nc-sl1', time: '22:30', format: '35mm', notes: 'Argento Giallo Night', bookedSeats: ['A1', 'A2', 'A3', 'B1', 'C4', 'C7'], ticketTypes: [{ id: 'nc-tt1', type: 'Standard', price: 15, perks: 'General seating' }, { id: 'nc-tt2', type: 'VIP', price: 28, perks: 'Front rows + Complimentary drink' }] },
                ]
            },
            {
                id: 'nc-st2', film: 'Bay of Blood (1971)', date: '2026-03-15',
                slots: [
                    { id: 'nc-sl2', time: '23:00', format: '35mm', notes: '', bookedSeats: ['A1', 'B2', 'B3'], ticketTypes: [{ id: 'nc-tt3', type: 'Standard', price: 15, perks: 'General seating' }] },
                ]
            },
        ],
        events: [{ id: 'nc-ev1', title: 'GIALLO NIGHT VOL. 7', desc: 'Argento & Bava. 35mm prints.', date: '2026-03-16', time: '21:00', type: 'Special', price: 30, ticketsLeft: 8, totalTickets: 60 }],
    },
}

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
                                        <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--blood-reel)' : 'var(--sepia)', borderRadius: 2, transition: 'width 0.4s' }} />
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
                    <div style={{ height: '100%', width: `${soldPct}%`, background: soldPct > 80 ? 'var(--blood-reel)' : typeColors[event.type] || 'var(--sepia)', borderRadius: 2 }} />
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
    const { isAuthenticated } = useAuthStore()
    const { openSignupModal } = useUIStore()
    const liveVenue = useVenueStore(s => s.venue)
    const liveShowtimes = useVenueStore(s => s.showtimes)
    const liveEvents = useVenueStore(s => s.events)
    const [following, setFollowing] = useState(false)
    const [ticketTarget, setTicketTarget] = useState<any>(null)

    const isOwnerVenue = String(id) === '1'
    const demoVenue = (DEMO_VENUES as any)[parseInt(id as string)] || DEMO_VENUES[1]

    const venue = isOwnerVenue ? {
        ...demoVenue,
        name: liveVenue.name,
        location: liveVenue.location,
        description: liveVenue.description,
        vibes: liveVenue.vibes,
        followers: liveVenue.followers,
        verified: liveVenue.verified,
        logo: liveVenue.logo,
    } : demoVenue

    const seatLayout = isOwnerVenue ? (liveVenue.seatLayout || DEFAULT_SEAT_LAYOUT) : DEFAULT_SEAT_LAYOUT

    // Fallback demo showtimes for venue/1 so the schedule always shows films
    const VENUE1_DEMO_SHOWTIMES = [
        {
            id: 'demo-st1', film: 'Nosferatu (1922)', date: '2026-03-14',
            slots: [
                { id: 'demo-sl1', time: '14:00', format: '35mm', notes: 'With live organ accompaniment', bookedSeats: ['A1', 'A3', 'B2', 'C4', 'C7', 'D1', 'D8', 'E3'], ticketTypes: [{ id: 'tt-std', type: 'Standard', price: 15, perks: 'General seating rows C-J' }, { id: 'tt-vip', type: 'VIP', price: 28, perks: 'Priority rows A-B + Drink' }, { id: 'tt-stu', type: 'Student', price: 10, perks: 'Valid student ID required' }] },
                { id: 'demo-sl2', time: '21:00', format: '35mm', notes: 'Late night. Doors open 20 min before.', bookedSeats: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C1', 'C2', 'D4', 'E5'], ticketTypes: [{ id: 'tt-std2', type: 'Standard', price: 18, perks: 'General seating rows C-J' }, { id: 'tt-vip2', type: 'VIP', price: 32, perks: 'Priority rows A-B + Drink' }] },
            ]
        },
        {
            id: 'demo-st2', film: 'M (1931)', date: '2026-03-15',
            slots: [
                { id: 'demo-sl3', time: '20:00', format: '35mm', notes: '', bookedSeats: ['A1', 'A2', 'B3', 'C1', 'C5'], ticketTypes: [{ id: 'tt-std3', type: 'Standard', price: 15, perks: 'General seating' }, { id: 'tt-vip3', type: 'VIP', price: 25, perks: 'Priority rows A-B + Drink' }] },
            ]
        },
    ]

    const showtimesToShow = isOwnerVenue
        ? (liveShowtimes.length > 0 ? liveShowtimes : VENUE1_DEMO_SHOWTIMES)
        : (demoVenue.showtimes || [])
    const eventsToShow = isOwnerVenue ? liveEvents : (demoVenue.events || [])

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
        <div className="page-top" style={{ minHeight: '100vh' }}>
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
