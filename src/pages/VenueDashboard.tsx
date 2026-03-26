import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../stores/auth'
import { useVenueStore } from '../stores/venue'
import { Link } from 'react-router-dom'
import {
    BarChart2, Calendar, Ticket, Settings, Plus, Trash2,
    TrendingUp, Users, DollarSign, Film, Edit2, Check, X,
    CreditCard, Shield, Eye, MapPin, Instagram, Globe, Phone,
    Mail, Twitter, ChevronLeft, ChevronRight, Clock, Tag, AlertTriangle, Upload, LayoutGrid,
} from 'lucide-react'
import toast from 'react-hot-toast'
import SeatMapEditor from '../components/SeatMapEditor'
import { WeeklyRevenueChart, OccupancyGauge, TopFilmsChart, TicketTypeBreakdown } from '../components/AnalyticsCharts'
import WeeklyCalendar from '../components/venue-dashboard/WeeklyCalendar'
import PageSEO from '../components/PageSEO'

const VIBE_OPTIONS = ['Arthouse', 'Drive-In', 'Historic', 'IMAX', 'Midnight Palace', 'Repertory', 'Horror House', 'Indie', 'Experimental', 'Family']
const FORMAT_OPTIONS = ['35mm', 'DCP 4K', 'DCP 2K', '70mm', 'Blu-ray', '16mm', 'VHS (Special)']
const EVENT_TYPES = ['Marathon', 'Retrospective', 'Series', 'Q&A', 'Premiere', 'Festival', 'Special']
const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'schedule', label: 'Schedule', icon: Film },
    { id: 'seatmap', label: 'Seat Map', icon: LayoutGrid },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'sales', label: 'Ticket Sales', icon: Ticket },
    { id: 'profile', label: 'Profile', icon: Settings },
    { id: 'payment', label: 'Payment', icon: CreditCard },
]

interface StatCardProps {
    icon: any;
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
}

function StatCard({ icon: Icon, label, value, sub, color = 'var(--sepia)' }: StatCardProps) {
    return (
        <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', borderTop: `3px solid ${color}`, padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="section-title-sm" style={{ color: 'var(--fog)' }}>{label}</span>
                <Icon size={14} color={color} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: 'var(--parchment)', lineHeight: 1 }}>{value}</div>
            {sub && <div className="ui-micro" style={{ color: 'var(--fog)' }}>{sub}</div>}
        </div>
    )
}

// ── ADD SHOWTIME MODAL — now with screen + duration ──
interface AddShowtimeModalProps { onClose: any; onAdd: any; defaultDate?: string; screens?: any[]; }
function AddShowtimeModal({ onClose, onAdd, defaultDate = '', screens = [] }: AddShowtimeModalProps) {
    const [film, setFilm] = useState('')
    const [date, setDate] = useState(defaultDate)
    const [screenName, setScreenName] = useState(screens[0]?.name || 'Screen 1')
    const [durationMins, setDurationMins] = useState<number | ''>(120)
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,1,0.95)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', width: '100%', maxWidth: 480, maxHeight: '100dvh', overflowY: 'auto', padding: '2rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))', borderRadius: 2, position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={20} /></button>
                <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>NEW FILM</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginBottom: '1.25rem' }}>Add to Schedule</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input className="input" placeholder="Film title *" value={film} onChange={e => setFilm(e.target.value)} autoFocus />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                            <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.35rem' }}>SCREENING DATE</div>
                            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div>
                            <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.35rem' }}>DURATION (MINS)</div>
                            <input className="input" type="number" min={30} max={480} value={durationMins} onChange={e => setDurationMins(e.target.value === '' ? '' : (parseInt(e.target.value) || ''))} />
                        </div>
                    </div>
                    <div>
                        <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.35rem' }}>SCREEN</div>
                        {screens.length > 0 ? (
                            <select className="input" value={screenName} onChange={e => setScreenName(e.target.value)}>
                                {screens.map(sc => <option key={sc.id} value={sc.name}>{sc.name}</option>)}
                            </select>
                        ) : (
                            <input className="input" placeholder="Screen 1" value={screenName} onChange={e => setScreenName(e.target.value)} />
                        )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                        Add time slots and ticket prices after creating the entry.
                    </div>
                    <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.25rem' }}
                        onClick={() => {
                            if (!film || !date) { toast.error('Film title and date are required'); return }
                            onAdd({ film, date, screenName, durationMins: durationMins === '' ? 120 : durationMins })
                            toast.success(`${film} added to schedule`)
                            onClose()
                        }}>
                        <Plus size={14} /> Add to Calendar
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// ── PAYMENT TAB ──
interface PaymentTabProps { venue: any; onConnect: any; }
function PaymentTab({ venue, onConnect }: PaymentTabProps) {
    const [form, setForm] = useState({ accountName: '', accountNumber: '', routingNumber: '', brand: 'visa' })
    const [submitted, setSubmitted] = useState(false)
    const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
    const VENUE_CUT = 100 - venue.platformFeePercent

    const handleConnect = (e: any) => {
        e.preventDefault()
        if (!form.accountName || !form.accountNumber || !form.routingNumber) { toast.error('All fields required'); return }
        onConnect({ paymentAccountName: form.accountName, paymentLast4: form.accountNumber.slice(-4), paymentBrand: form.brand })
        toast.success('Payment account connected')
        setSubmitted(true)
    }

    if (venue.paymentConnected) {
        return (
            <div style={{ maxWidth: 560 }}>
                <div style={{ background: 'rgba(27,94,46,0.12)', border: '1px solid #27913f', padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Shield size={24} color="#27913f" />
                    <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)' }}>Account Connected</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 2 }}>
                            {venue.paymentAccountName} · ending ····{venue.paymentLast4}
                        </div>
                    </div>
                </div>
                <RevenueBreakdown pct={venue.platformFeePercent} />
            </div>
        )
    }

    return (
        <div style={{ maxWidth: 560 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>Connect Your Account</div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--fog)', lineHeight: 1.7, marginBottom: '2rem' }}>
                Enter your bank details to start receiving ticket revenue. The ReelHouse Society processes every transaction and deposits your cut directly to your account within 2 business days.
            </p>
            <RevenueBreakdown pct={venue.platformFeePercent} />
            <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                <div>
                    <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>ACCOUNT HOLDER NAME</div>
                    <input className="input" placeholder="Full legal name" value={form.accountName} onChange={e => set('accountName', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                        <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>ROUTING NUMBER</div>
                        <input className="input" placeholder="9-digit routing number" maxLength={9} value={form.routingNumber} onChange={e => set('routingNumber', e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <div>
                        <div className="section-title-sm" style={{ color: 'var(--sepia)', marginBottom: '0.4rem' }}>ACCOUNT NUMBER</div>
                        <input className="input" placeholder="Account number" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value.replace(/\D/g, ''))} />
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--ink)', border: '1px solid var(--ash)' }}>
                    <Shield size={14} color="var(--sepia)" />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                        Demo mode — no real banking data is stored or transmitted.
                    </span>
                </div>
                <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.25rem' }}>
                    <CreditCard size={14} /> Connect Account
                </button>
            </form>
        </div>
    )
}

interface RevenueBreakdownProps { pct: number; }
function RevenueBreakdown({ pct }: RevenueBreakdownProps) {
    const venueCut = 100 - pct
    return (
        <div style={{ background: 'var(--ink)', border: '1px solid var(--ash)', padding: '1.5rem' }}>
            <div className="section-title" style={{ marginBottom: '1.25rem' }}>REVENUE SPLIT PER TICKET SOLD</div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', marginBottom: '1rem' }}>
                <div style={{ flex: venueCut, background: 'rgba(139,105,20,0.15)', border: '2px solid var(--sepia)', padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--flicker)' }}>{venueCut}%</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.25rem' }}>YOUR VENUE</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--bone)', marginTop: '0.4rem' }}>Goes directly to your account</div>
                </div>
                <div style={{ flex: pct, background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)' }}>{pct}%</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.25rem' }}>REELHOUSE</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.4rem' }}>Platform fee</div>
                </div>
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)', fontStyle: 'italic', lineHeight: 1.7 }}>
                On a $20 ticket: you receive <strong style={{ color: 'var(--flicker)' }}>${(20 * (venueCut / 100)).toFixed(2)}</strong>,
                The ReelHouse Society receives <strong style={{ color: 'var(--parchment)' }}>${(20 * (pct / 100)).toFixed(2)}</strong> + the $1.50 booking fee.
                Payouts are processed every Monday.
            </div>
        </div>
    )
}

// ── PROFILE TAB ──
interface ProfileTabProps { venue: any; onSave: any; }
function ProfileTab({ venue, onSave }: ProfileTabProps) {
    const [draft, setDraft] = useState<any>({ ...venue })
    const [editing, setEditing] = useState(false)
    const logoRef = useRef<HTMLInputElement>(null)
    const set = (k: string, v: any) => setDraft((p: any) => ({ ...p, [k]: v }))

    const handleLogo = (e: any) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev: any) => set('logo', ev.target.result)
        reader.readAsDataURL(file)
    }

    const toggleVibe = (v: string) => {
        const cur = draft.vibes || []
        set('vibes', cur.includes(v) ? cur.filter((x: any) => x !== v) : [...cur, v])
    }

    const fields = [
        { key: 'name', label: 'VENUE NAME', placeholder: 'Your Cinema Name', Icon: Film },
        { key: 'location', label: 'CITY / REGION', placeholder: 'Brooklyn, NY', Icon: MapPin },
        { key: 'address', label: 'FULL ADDRESS', placeholder: '42 Clinton Ave, Brooklyn, NY 11238', Icon: MapPin },
        { key: 'mapLink', label: 'GOOGLE MAPS LINK', placeholder: 'https://maps.google.com/...', Icon: Globe },
        { key: 'email', label: 'BOOKING EMAIL', placeholder: 'bookings@yourcinema.com', Icon: Mail },
        { key: 'phone', label: 'PHONE', placeholder: '+1 (555) 000-0000', Icon: Phone },
        { key: 'website', label: 'WEBSITE', placeholder: 'https://yourcinema.com', Icon: Globe },
        { key: 'instagram', label: 'INSTAGRAM HANDLE', placeholder: '@yourcinema', Icon: Instagram },
        { key: 'twitter', label: 'TWITTER / X HANDLE', placeholder: '@yourcinema', Icon: Twitter },
    ]

    return (
        <div style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--parchment)' }}>Venue Profile</div>
                {!editing ? (
                    <button className="btn btn-ghost" onClick={() => { setDraft({ ...venue }); setEditing(true) }}>
                        <Edit2 size={12} /> Edit Profile
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-primary" onClick={() => { onSave(draft); setEditing(false); toast.success('Profile updated') }}><Check size={12} /> Save</button>
                        <button className="btn btn-ghost" onClick={() => setEditing(false)}><X size={12} /> Cancel</button>
                    </div>
                )}
            </div>

            {/* Logo / Avatar */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div
                    onClick={() => editing && logoRef.current?.click()}
                    style={{ width: 90, height: 90, borderRadius: '50%', border: '2px solid var(--sepia)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', cursor: editing ? 'pointer' : 'default', flexShrink: 0 }}
                >
                    {(editing ? draft.logo : venue.logo) ? (
                        <img src={editing ? draft.logo : venue.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--sepia)', opacity: 0.4 }}>
                            {(venue.name || '?')[0]}
                        </span>
                    )}
                </div>
                {editing && (
                    <div>
                        <button className="btn btn-ghost" onClick={() => logoRef.current?.click()} style={{ fontSize: '0.6rem', marginBottom: '0.4rem' }}>
                            <Upload size={12} /> Upload Logo
                        </button>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--fog)', fontStyle: 'italic' }}>JPG, PNG — max 2MB</div>
                        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
                    </div>
                )}
            </div>

            {/* Text fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {fields.map(({ key, label, placeholder, Icon }) => (
                    <div key={key}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Icon size={9} /> {label}
                        </div>
                        {editing ? (
                            <input className="input" placeholder={placeholder} value={draft[key] || ''} onChange={e => set(key, e.target.value)} />
                        ) : (
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: venue[key] ? 'var(--bone)' : 'var(--fog)', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)', fontStyle: venue[key] ? 'normal' : 'italic' }}>
                                {venue[key] || 'Not set'}
                            </div>
                        )}
                    </div>
                ))}

                {/* Bio */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.35rem' }}>BIO</div>
                    {editing ? (
                        <textarea className="input" placeholder="A short tagline or mission statement..." value={draft.bio || ''} onChange={e => set('bio', e.target.value)} style={{ minHeight: 70 }} />
                    ) : (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: venue.bio ? 'var(--bone)' : 'var(--fog)', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)', fontStyle: venue.bio ? 'italic' : 'italic', lineHeight: 1.6 }}>
                            {venue.bio || 'Not set'}
                        </div>
                    )}
                </div>

                {/* Description */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.35rem' }}>FULL DESCRIPTION</div>
                    {editing ? (
                        <textarea className="input" placeholder="Tell your full story..." value={draft.description || ''} onChange={e => set('description', e.target.value)} style={{ minHeight: 110 }} />
                    ) : (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)', lineHeight: 1.7 }}>
                            {venue.description}
                        </div>
                    )}
                </div>

                {/* Vibe tags */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>VIBE TAGS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {VIBE_OPTIONS.map(v => {
                            const active = (editing ? draft.vibes : venue.vibes).includes(v)
                            return (
                                <button key={v} type="button" onClick={() => editing && toggleVibe(v)}
                                    className={`tag ${active ? 'tag-flicker' : 'tag-vibe'}`}
                                    style={{ cursor: editing ? 'pointer' : 'default' }}>
                                    {v}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── MAIN DASHBOARD ──
export default function VenueDashboard() {
    const { venue, showtimes, events, updateVenue, addShowtime, removeShowtime, addSlot, removeSlot, updateSlot, addEvent, removeEvent, connectPayment, saveScreens } = useVenueStore()
    const [tab, setTab] = useState('overview')
    const [showAddFilm, setShowAddFilm] = useState(false)
    const [addFilmDate, setAddFilmDate] = useState('')
    const [showAddEvent, setShowAddEvent] = useState(false)
    const [eventForm, setEventForm] = useState<any>({ title: '', desc: '', date: '', time: '20:00', type: 'Special', price: '', totalTickets: 60 })

    // Computed stats (Wrapped in useMemo to eliminate O(N^2) render thrashing during text input)
    const { totalBooked, totalCap, occPct, showtimeRevenue } = useMemo(() => {
        const booked = showtimes.reduce((a: any, st: any) => a + st.slots.reduce((b: any, sl: any) => b + (sl.bookedSeats?.length || 0), 0), 0)
        const cap = showtimes.reduce((a: any, st: any) => a + st.slots.length * 150, 0)
        const occ = cap > 0 ? Math.round((booked / cap) * 100) : 0
        const rev = showtimes.reduce((a: any, st: any) =>
            a + st.slots.reduce((b: any, sl: any) => {
                const prices = sl.ticketTypes?.map((t: any) => t.price) || []
                const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0
                return b + (sl.bookedSeats?.length || 0) * lowestPrice
            }, 0), 0)
        return { totalBooked: booked, totalCap: cap, occPct: occ, showtimeRevenue: rev }
    }, [showtimes])

    const eventRevenue = useMemo(() => {
        return events.reduce((a: any, e: any) => a + (e.totalTickets - e.ticketsLeft) * e.price, 0)
    }, [events])

    const submitEvent = (e: any) => {
        e.preventDefault()
        if (!eventForm.title || !eventForm.date || !eventForm.price) { toast.error('Fill all required fields'); return }
        addEvent({ ...eventForm, price: parseFloat(eventForm.price), totalTickets: parseInt(eventForm.totalTickets) })
        setEventForm({ title: '', desc: '', date: '', time: '20:00', type: 'Special', price: '', totalTickets: 60 })
        setShowAddEvent(false)
        toast.success('Event added to programme')
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--ink)', paddingTop: 70 }}>
            {/* Header */}
            <div style={{ background: 'var(--soot)', borderBottom: '1px solid var(--ash)', padding: '2rem 0 0' }}>
                <div className="container">
                    <div className="venue-dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {venue.logo ? (
                                <img src={venue.logo} alt="logo" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--sepia)', flexShrink: 0 }} />
                            ) : (
                                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--ink)', border: '2px solid var(--sepia)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--sepia)' }}>{(venue.name || '?')[0]}</span>
                                </div>
                            )}
                            <div>
                                <div className="ui-micro" style={{ color: 'var(--sepia)', letterSpacing: '0.3em', marginBottom: '0.3rem' }}>VENUE CONTROL PANEL</div>
                                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)', color: 'var(--parchment)', lineHeight: 1 }}>{venue.name}</h1>
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={9} />{venue.location}</span>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}><Users size={9} />{(venue.followers ?? 0).toLocaleString()} followers</span>
                                    {!venue.paymentConnected && (
                                        <span onClick={() => setTab('payment')} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--blood-reel)', letterSpacing: '0.08em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <AlertTriangle size={9} /> Payment not connected
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <Link to="/venue/1" className="btn btn-ghost" style={{ fontSize: '0.6rem' }}><Eye size={12} /> View Public Page</Link>
                    </div>
                    {/* Tabs */}
                    <div className="venue-tab-strip" style={{ display: 'flex', borderBottom: '1px solid var(--ash)', overflowX: 'auto' }}>
                        {TABS.map(({ id, label, icon: Icon }) => (
                            <button key={id} onClick={() => setTab(id)} className="venue-tab-btn" style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.7rem 1.1rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.12em', color: tab === id ? 'var(--parchment)' : 'var(--fog)', borderBottom: `2px solid ${tab === id ? 'var(--sepia)' : 'transparent'}`, transition: 'all 0.2s' }}>
                                <Icon size={12} />{label.toUpperCase()}
                                {id === 'payment' && !venue.paymentConnected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blood-reel)', flexShrink: 0 }} />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tab Content */}
            <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '6rem' }}>
                <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>

                        {/* OVERVIEW — with analytics charts */}
                        {tab === 'overview' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Stat cards row */}
                                <div className="venue-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
                                    <StatCard icon={DollarSign} label="TOTAL REVENUE" value={`$${(showtimeRevenue + eventRevenue).toLocaleString()}`} sub="Showtimes + Events" color="var(--flicker)" />
                                    <StatCard icon={Users} label="FOLLOWERS" value={(venue.followers ?? 0).toLocaleString()} color="var(--sepia)" />
                                    <StatCard icon={TrendingUp} label="OCCUPANCY" value={`${occPct}%`} sub={`${totalBooked}/${totalCap} seats filled`} color={occPct > 70 ? 'var(--blood-reel)' : 'var(--sepia)'} />
                                    <StatCard icon={Film} label="FILMS SCHEDULED" value={showtimes.length} sub={`${showtimes.reduce((a, s) => a + s.slots.length, 0)} time slots`} color="var(--bone)" />
                                </div>
                                {/* Analytics charts */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                                    <WeeklyRevenueChart showtimes={showtimes} events={events} />
                                    <OccupancyGauge showtimes={showtimes} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                                    <TopFilmsChart showtimes={showtimes} />
                                    <TicketTypeBreakdown showtimes={showtimes} events={events} />
                                </div>
                                <div>
                                    <div className="section-title" style={{ marginBottom: '0.75rem' }}>QUICK ACTIONS</div>
                                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                        <button className="btn btn-primary" onClick={() => { setTab('schedule'); setShowAddFilm(true) }}><Plus size={12} /> Add Film</button>
                                        <button className="btn btn-ghost" onClick={() => { setTab('events'); setShowAddEvent(true) }}><Plus size={12} /> Create Event</button>
                                        <button className="btn btn-ghost" onClick={() => setTab('seatmap')}><LayoutGrid size={12} /> Edit Seat Map</button>
                                        <button className="btn btn-ghost" onClick={() => setTab('profile')}><Settings size={12} /> Edit Profile</button>
                                        {!venue.paymentConnected && <button className="btn btn-ghost" onClick={() => setTab('payment')} style={{ color: 'var(--blood-reel)', borderColor: 'var(--blood-reel)' }}><CreditCard size={12} /> Connect Payment</button>}
                                    </div>
                                </div>
                                <div>
                                    <div className="section-title" style={{ marginBottom: '0.75rem' }}>UPCOMING SCHEDULE</div>
                                    {showtimes.slice(0, 3).map((st: any) => (
                                        <div key={st.id} style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '0.9rem 1.2rem', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{st.film}</div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', marginTop: 3, letterSpacing: '0.08em' }}>
                                                    {st.date} · {st.screen_name || st.screenName || 'Screen 1'} · {st.slots.map((s: any) => s.time).join(', ')}
                                                </div>
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--sepia)' }}>{st.slots.length} SLOT{st.slots.length !== 1 ? 'S' : ''}</div>
                                        </div>
                                    ))}
                                    {showtimes.length === 0 && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', fontStyle: 'italic' }}>No films scheduled yet.</div>}
                                </div>
                            </div>
                        )}

                        {/* SCHEDULE — multi-screen with conflict detection */}
                        {tab === 'schedule' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--parchment)' }}>Weekly Schedule</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 3 }}>
                                            Click any day's <strong style={{ color: 'var(--sepia)' }}>+ Add</strong> to schedule a film · Click a film card to edit its slots
                                        </div>
                                    </div>
                                    <button className="btn btn-primary" onClick={() => { setAddFilmDate(''); setShowAddFilm(true) }}><Plus size={12} /> Add Film</button>
                                </div>
                                {/* Screen legend if multi-screen */}
                                {(venue.screens?.length > 0) && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>SCREENS:</span>
                                        {venue.screens.map((sc: any) => (
                                            <span key={sc.id} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', border: `1px solid ${sc.color}`, color: sc.color, padding: '2px 8px' }}>{sc.name}</span>
                                        ))}
                                    </div>
                                )}
                                <WeeklyCalendar
                                    showtimes={showtimes}
                                    screens={venue.screens || []}
                                    onRemove={(id: any) => { removeShowtime(id); toast.success('Film removed from schedule') }}
                                    onAddSlot={addSlot}
                                    onRemoveSlot={(stId: any, slId: any) => { removeSlot(stId, slId); toast.success('Slot removed') }}
                                    onUpdateSlot={(stId: any, slId: any, updates: any) => { updateSlot(stId, slId, updates) }}
                                    onAddFilmToDate={(date: string) => { setAddFilmDate(date); setShowAddFilm(true) }}
                                />
                            </div>
                        )}

                        {/* EVENTS */}
                        {tab === 'events' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--parchment)' }}>The Programme</div>
                                    <button className="btn btn-primary" onClick={() => setShowAddEvent(true)}><Plus size={12} /> Create Event</button>
                                </div>
                                {showAddEvent && (
                                    <div style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', padding: '1.5rem' }}>
                                        <div className="section-title">NEW SPECIAL EVENT</div>
                                        <form onSubmit={submitEvent} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>TITLE</div>
                                                <input className="retro-input" placeholder="Event title" value={eventForm.title} onChange={e => setEventForm((p: any) => ({ ...p, title: e.target.value }))} />
                                            </div>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>DESCRIPTION</div>
                                                <input className="retro-input" placeholder="Brief description" value={eventForm.desc} onChange={e => setEventForm((p: any) => ({ ...p, desc: e.target.value }))} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>DATE</div>
                                                    <input type="date" className="retro-input" value={eventForm.date} onChange={e => setEventForm((p: any) => ({ ...p, date: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>TIME</div>
                                                    <input type="time" className="retro-input" value={eventForm.time} onChange={e => setEventForm((p: any) => ({ ...p, time: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>TYPE</div>
                                                    <select className="retro-input" value={eventForm.type} onChange={e => setEventForm((p: any) => ({ ...p, type: e.target.value }))}>
                                                        <option>Special</option>
                                                        <option>Q&A</option>
                                                        <option>Workshop</option>
                                                        <option>Party</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>PRICE</div>
                                                    <input type="number" className="retro-input" placeholder="$" value={eventForm.price} onChange={e => setEventForm((p: any) => ({ ...p, price: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>CAPACITY</div>
                                                    <input type="number" className="retro-input" value={eventForm.totalTickets} onChange={e => setEventForm((p: any) => ({ ...p, totalTickets: parseInt(e.target.value) || 0 }))} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button type="submit" className="btn btn-primary"><Check size={12} /> Add Event</button>
                                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddEvent(false)}><X size={12} /> Cancel</button>
                                            </div>
                                        </form>
                                    </div>
                                )}
                                {events.map((ev: any) => {
                                    const sold = ev.totalTickets - ev.ticketsLeft
                                    return (
                                        <div key={ev.id} style={{ background: 'var(--ink)', border: '1px solid var(--ash)', borderTop: '2px solid var(--sepia)', padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '1rem', alignItems: 'center' }}>
                                            <div>
                                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', border: '1px solid var(--flicker)', color: 'var(--flicker)', padding: '1px 6px', letterSpacing: '0.1em', marginBottom: '0.35rem', display: 'inline-block' }}>{ev.type}</span>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)' }}>{ev.title}</div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', color: 'var(--fog)', letterSpacing: '0.08em', marginTop: 3 }}>{ev.date} · {ev.time}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--flicker)' }}>${ev.price}</div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)' }}>PER TICKET</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)' }}>{sold}/{ev.totalTickets}</div>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)' }}>SOLD · ${sold * ev.price}</div>
                                            </div>
                                            <button onClick={() => { removeEvent(ev.id); toast.success('Event removed') }} style={{ background: 'none', border: '1px solid rgba(92,26,11,0.4)', color: 'var(--blood-reel)', padding: '0.4rem', cursor: 'pointer', borderRadius: 2 }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )
                                })}
                                {events.length === 0 && !showAddEvent && (
                                    <div className="empty-state">
                                        NO SPECIAL EVENTS. CREATE YOUR FIRST PROGRAMME.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TICKET SALES */}
                        {tab === 'sales' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                                    <StatCard icon={DollarSign} label="SHOWTIME REVENUE" value={`$${showtimeRevenue.toLocaleString()}`} sub="Estimated from seat sales" color="var(--flicker)" />
                                    <StatCard icon={Ticket} label="EVENT REVENUE" value={`$${eventRevenue.toLocaleString()}`} color="var(--sepia)" />
                                    <StatCard icon={TrendingUp} label="TOTAL COMBINED" value={`$${(showtimeRevenue + eventRevenue).toLocaleString()}`} color="var(--bone)" />
                                    <StatCard icon={DollarSign} label="YOUR CUT (85%)" value={`$${Math.round((showtimeRevenue + eventRevenue) * 0.85).toLocaleString()}`} sub="After platform fee" color="var(--flicker)" />
                                </div>
                                <div>
                                    <div className="section-title">SHOWTIME BREAKDOWN</div>
                                    {showtimes.map((st: any) => (
                                        <div key={st.id} style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)', marginBottom: '0.4rem' }}>{st.film} · {st.date}</div>
                                            {st.slots.map((sl: any) => {
                                                const lowestP = Math.min(...(sl.ticketTypes?.map((t: any) => t.price) || [0]))
                                                const rev = (sl.bookedSeats?.length || 0) * lowestP
                                                const pct = Math.round(((sl.bookedSeats?.length || 0) / 150) * 100)
                                                return (
                                                    <div key={sl.id} style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '0.9rem 1.2rem', marginBottom: '0.35rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--bone)' }}>{sl.time} · {sl.format}</span>
                                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--flicker)' }}>${rev}</span>
                                                        </div>
                                                        <div style={{ height: 4, background: 'var(--ash)', borderRadius: 2 }}>
                                                            <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--blood-reel)' : 'var(--sepia)', borderRadius: 2, transition: 'width 0.5s' }} />
                                                        </div>
                                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.47rem', color: 'var(--fog)', marginTop: '0.25rem', letterSpacing: '0.08em' }}>
                                                            {sl.bookedSeats?.length || 0}/150 SEATS · {pct}% CAPACITY
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SEAT MAP */}
                        {tab === 'seatmap' && <SeatMapEditor venue={venue} onSave={saveScreens} />}

                        {/* PROFILE */}
                        {tab === 'profile' && <ProfileTab venue={venue} onSave={updateVenue} />}

                        {/* PAYMENT */}
                        {tab === 'payment' && <PaymentTab venue={venue} onConnect={connectPayment} />}

                    </motion.div>
                </AnimatePresence>
            </div>

            {showAddFilm && <AddShowtimeModal onClose={() => setShowAddFilm(false)} onAdd={addShowtime} defaultDate={addFilmDate} screens={venue.screens || []} />}
        </div>
    )
}
