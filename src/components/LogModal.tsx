import { useState, useEffect, useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Star, BookOpen, EyeOff, Clock, Lock, Archive, History, Eye, Check } from 'lucide-react'
import { useUIStore, useFilmStore, useAuthStore } from '../store'
import { tmdb } from '../tmdb'
import { ReelRating } from './UI'
import LogModalSearch from './log-modal/LogModalSearch'
import EditorialDesk from './log-modal/EditorialDesk'
import AuteurToolkit from './log-modal/AuteurToolkit'
import ShareCardModal from './film/ShareCardModal'
import NitrateCalendar from './NitrateCalendar'
import toast from 'react-hot-toast'

// ── Single source of truth for autopsy categories ──
// Every init, edit-load, and reset references this constant.
// Adding a field here automatically propagates everywhere.
const AUTOPSY_INIT = Object.freeze({ story: 0, script: 0, acting: 0, cinematography: 0, editing: 0, sound: 0 })

const ABANDONED_REASONS = [
    'Too Slow',
    'Too Upsetting',
    'Life Got in the Way',
    "I'll Return Someday",
    "Lost the Plot",
    "Wrong Mood",
]

export default function LogModal() {
    const navigate = useNavigate()

    // Enterprise Fix: strict selectors prevent arbitrary re-renders
    const logModalOpen = useUIStore(state => state.logModalOpen)
    const logModalFilm = useUIStore(state => state.logModalFilm)
    const logModalEditLogId = useUIStore(state => state.logModalEditLogId)
    const closeLogModal = useUIStore(state => state.closeLogModal)

    const addLog = useFilmStore(state => state.addLog)
    const updateLog = useFilmStore(state => state.updateLog)
    const logs = useFilmStore(state => state.logs)
    const lists = useFilmStore(state => state.lists)
    const addFilmToList = useFilmStore(state => state.addFilmToList)
    const removeFilmFromList = useFilmStore(state => state.removeFilmFromList)

    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const openSignupModal = useUIStore(state => state.openSignupModal)
    const user = useAuthStore(state => state.user)


    const [step, setStep] = useState(0) // 0=search, 1=log
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [searchType, setSearchType] = useState('exact')
    const [searchContext, setSearchContext] = useState('')
    const [searching, setSearching] = useState(false)
    const [film, setFilm] = useState<any>(logModalFilm)
    const [status, setStatus] = useState<'watched' | 'rewatched' | 'abandoned'>('watched')
    const [rating, setRating] = useState(0)
    const [review, setReview] = useState('')
    const [isSpoiler, setIsSpoiler] = useState(false)
    const [abandoned, setAbandoned] = useState('')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [watchedWith, setWatchedWith] = useState('')
    const [privateNotes, setPrivateNotes] = useState('')
    const [shareCardData, setShareCardData] = useState<any>(null)
    const [physicalMedia, setPhysicalMedia] = useState('None')
    const [autopsy, setAutopsy] = useState<Record<string, number>>({ ...AUTOPSY_INIT })
    const [altPoster, setAltPoster] = useState<string | null>(null)
    const [availablePosters, setAvailablePosters] = useState<any[]>([])
    const [editorialHeader, setEditorialHeader] = useState<string | null>(null)
    const [dropCap, setDropCap] = useState(false)
    const [pullQuote, setPullQuote] = useState('')
    const [availableBackdrops, setAvailableBackdrops] = useState<any[]>([])
    const [autopsyOpen, setAutopsyOpen] = useState(false) // Toggle to hide bloat
    const [isAutopsied, setIsAutopsied] = useState(false) // Master flag for 0/10 intentionality
    const [moreOpen, setMoreOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches) // Auto-expand on mobile — scrolling is free
    const [calendarOpen, setCalendarOpen] = useState(false)
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    const isPremium = user?.role === 'archivist' || user?.role === 'auteur'
    const isAuteur = user?.role === 'auteur'

    useEffect(() => {
        if (film && isPremium) {
            tmdb.movieImages(film.id).then((imgs: any) => {
                // Poster curation — Auteur-only (matches MembershipPage)
                if (isAuteur && imgs.posters) {
                    const validPosters = imgs.posters.filter((p: any) => p.iso_639_1 === 'en' || !p.iso_639_1).slice(0, 15)
                    setAvailablePosters(validPosters)
                } else {
                    setAvailablePosters([])
                }
                if (imgs.backdrops) {
                    const validBackdrops = imgs.backdrops.slice(0, 10)
                    setAvailableBackdrops(validBackdrops)
                }
            }).catch(() => {
                setAvailablePosters([])
                setAvailableBackdrops([])
            })
        }
    }, [film, isAuteur, isPremium])

    useEffect(() => {
        if (logModalFilm && logModalEditLogId) {
            // Edit Mode
            const existingLog = logs.find(l => l.id === logModalEditLogId)
            if (existingLog) {
                setFilm(logModalFilm)
                setStep(1)
                setStatus(existingLog.status || 'watched')
                setRating(existingLog.rating || 0)
                setReview(existingLog.review || '')
                setIsSpoiler(existingLog.isSpoiler || false)
                setAbandoned(existingLog.abandonedReason || '')
                setDate(existingLog.watchedDate || new Date().toISOString().slice(0, 10))
                setWatchedWith(existingLog.watchedWith || '')
                setPrivateNotes(existingLog.privateNotes || '')
                setPhysicalMedia(existingLog.physicalMedia || 'None')
                setAutopsy((existingLog as any).autopsy || { ...AUTOPSY_INIT })
                setAltPoster(existingLog.altPoster || null)
                setEditorialHeader(existingLog.editorialHeader || null)
                setDropCap(existingLog.dropCap || false)
                setPullQuote(existingLog.pullQuote || '')
                setIsAutopsied(existingLog.isAutopsied || false)
                setAutopsyOpen(existingLog.isAutopsied || false)
                // Auto-expand "More Details" if any secondary fields have data
                setMoreOpen(!!(existingLog.watchedWith || existingLog.privateNotes || (existingLog.physicalMedia && existingLog.physicalMedia !== 'None')))
            }
        } else if (logModalFilm) {
            // New Log Mode (pre-selected film)
            setFilm(logModalFilm)
            setStep(1)
            setIsAutopsied(false)
            setAutopsyOpen(false)
        } else {
            // Search Mode
            setStep(0)
            setFilm(null)
            setIsAutopsied(false)
            setAutopsyOpen(false)
            setMoreOpen(false)
        }
    }, [logModalFilm, logModalOpen, logModalEditLogId, logs])

    useEffect(() => {
        if (!logModalOpen) {
            setQuery(''); setResults([])
            setRating(0); setReview(''); setIsSpoiler(false)
            setStatus('watched'); setAbandoned('')
            setWatchedWith(''); setPrivateNotes('')
            setPhysicalMedia('None')
            setAutopsy({ ...AUTOPSY_INIT })
            setAltPoster(null)
            setAvailablePosters([])
            setEditorialHeader(null)
            setDropCap(false)
            setPullQuote('')
            setAvailableBackdrops([])
            setAutopsyOpen(false)
            setIsAutopsied(false)
            setMoreOpen(false)
        }
    }, [logModalOpen])

    // Draft Logic: Restore
    useEffect(() => {
        if (step === 1 && film && !logModalEditLogId && logModalOpen) {
            const draft = localStorage.getItem(`reelhouse_draft_${film.id}`)
            if (draft) {
                try {
                    const parsed = JSON.parse(draft)
                    setRating(parsed.rating || 0)
                    setReview(parsed.review || '')
                    setStatus(parsed.status || 'watched')
                    setIsSpoiler(parsed.isSpoiler || false)
                    setAbandoned(parsed.abandoned || '')
                    setWatchedWith(parsed.watchedWith || '')
                    setPrivateNotes(parsed.privateNotes || '')
                    if (parsed.autopsy) setAutopsy(parsed.autopsy)
                    if (parsed.autopsyOpen) { setAutopsyOpen(true); setIsAutopsied(true) }
                    toast('DRAFT RESTORED', { icon: '✦', style: { background: 'var(--ink)', color: 'var(--parchment)', border: '1px solid var(--sepia)' } })
                } catch(e) {}
            }
        }
    }, [step, film, logModalEditLogId, logModalOpen])

    // Draft Logic: Save
    useEffect(() => {
        if (step === 1 && film && !logModalEditLogId && logModalOpen) {
            const debounce = setTimeout(() => {
                const draft = { rating, review, status, isSpoiler, abandoned, watchedWith, privateNotes, autopsy, autopsyOpen }
                localStorage.setItem(`reelhouse_draft_${film.id}`, JSON.stringify(draft))
            }, 1000)
            return () => clearTimeout(debounce)
        }
    }, [step, film, logModalEditLogId, logModalOpen, rating, review, status, isSpoiler, abandoned, watchedWith, privateNotes, autopsy, autopsyOpen])

    const handleSearch = (q: string) => {
        setQuery(q)
        if (searchTimeout.current) clearTimeout(searchTimeout.current)
        if (!q.trim()) { setResults([]); return }
        setSearching(true)
        searchTimeout.current = setTimeout(async () => {
            try {
                const data = await tmdb.search(q)
                // Filter out people for the log modal
                const filmsOnly = data.results?.filter((i: any) => i.media_type !== 'person') || []
                setResults(filmsOnly.slice(0, 6))
                setSearchType(data.searchType || 'exact')
                setSearchContext(data.matchedContext || '')
            } catch { setResults([]); setSearchType('exact') }
            finally { setSearching(false) }
        }, 400)
    }

    const selectFilm = (f: any) => {
        setFilm(f)
        setStep(1)
        setResults([])
        setQuery('')
    }

    const [submitting, setSubmitting] = useState(false)

    const handleLog = () => {
        if (submitting) return
        if (!film) return
        if (!isAuthenticated) {
            closeLogModal()
            toast('Sign in to log films.', { icon: '✦' })
            return
        }
        // Prevent accidental empty logs — at least rate or write something
        if (rating === 0 && !review.trim() && status !== 'abandoned') {
            toast('Rate the film or write a review before logging.', { icon: '✦' })
            return
        }

        const logData = {
            filmId: film.id,
            title: film.title,
            poster: film.poster_path,
            year: film.release_date?.slice(0, 4),
            rating,
            review: review.trim(),
            status,
            isSpoiler,
            watchedDate: date,
            watchedWith: watchedWith.trim() || null,
            privateNotes: isPremium ? (privateNotes.trim() || null) : null,
            abandonedReason: status === 'abandoned' ? abandoned : null,
            physicalMedia: isPremium && physicalMedia !== 'None' ? physicalMedia : null,
            isAutopsied: isAuteur ? isAutopsied : false,
            autopsy: isAuteur && isAutopsied ? autopsy : null,
            altPoster: isAuteur ? altPoster : null,
            editorialHeader: isPremium ? editorialHeader : null,
            dropCap: isPremium ? dropCap : false,
            pullQuote: isPremium ? pullQuote.trim() : '',
        }

        if (logModalEditLogId) {
            updateLog(logModalEditLogId, logData as any)
            toast.success(`Log updated for ${film.title}`)
        } else {
            addLog(logData as any)
            const statusLabel: Record<string, string> = { watched: '[ LOGGED ]', rewatched: '[ REWATCH ]', abandoned: '[ ABANDONED ]' }

            toast.success(`${statusLabel[status]} ${film.title} logged to the archive.`)

            // Show visual share card modal
            setShareCardData({
                filmTitle: film.title,
                filmYear: film.release_date?.slice(0, 4) || film.year,
                posterPath: film.poster_path,
                rating,
                review: review.trim(),
                username: user?.username || 'cinephile',
                status,
            })
        }

        // Clear draft
        if (!logModalEditLogId && film) {
            localStorage.removeItem(`reelhouse_draft_${film.id}`)
        }

        setSubmitting(true)
        closeLogModal()
        setTimeout(() => setSubmitting(false), 1000)

        // ── Golden spark celebration for 5-star logs ──
        if (rating === 5 && !logModalEditLogId) {
            if (navigator.vibrate) navigator.vibrate([15, 30, 15])
            const container = document.createElement('div')
            container.className = 'spark-container'
            const cx = window.innerWidth / 2, cy = window.innerHeight / 2
            container.style.left = cx + 'px'
            container.style.top = cy + 'px'
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
                const dist = 40 + Math.random() * 60
                const p = document.createElement('div')
                p.className = 'spark-particle'
                p.style.setProperty('--sx', `${Math.cos(angle) * dist}px`)
                p.style.setProperty('--sy', `${Math.sin(angle) * dist}px`)
                p.style.animationDelay = `${Math.random() * 0.1}s`
                container.appendChild(p)
            }
            document.body.appendChild(container)
            setTimeout(() => container.remove(), 700)
        }

    }


    const focusTrapRef = useFocusTrap(logModalOpen, closeLogModal)


    return (
        <>
        {logModalOpen && (
        <AnimatePresence>
            <motion.div
                key="modal-backdrop"
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-label="Log a film"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.backdropMouseDown = 'true' }}
                onMouseUp={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.backdropMouseDown === 'true') closeLogModal(); e.currentTarget.dataset.backdropMouseDown = 'false' }}
                className="modal-overlay"
            >
                <motion.div
                    key="modal-box"
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--ash)',
                        borderRadius: 'var(--radius-card)',
                        width: 'calc(100% - 2rem)',
                        maxWidth: 520,
                        maxHeight: 'calc(100dvh - 2rem)',
                        overflow: 'auto',
                        position: 'relative',
                        margin: 'auto auto'
                    }}
                >
                    {/* ── Minimal Header — just close button ── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        padding: '0.75rem 1rem',
                    }}>
                        {logModalEditLogId && (
                            <span style={{ marginRight: 'auto', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', background: 'rgba(139,105,20,0.1)', padding: '0.25rem 0.65rem', borderRadius: '2px', border: '1px solid rgba(139,105,20,0.2)' }}>
                                EDITING
                            </span>
                        )}
                        <button
                            onClick={closeLogModal}
                            style={{ background: 'none', border: 'none', color: 'var(--fog)', padding: '0.35rem', cursor: 'pointer', borderRadius: '4px', transition: 'color 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div style={{ padding: '0 1.5rem 1.5rem' }}>
                        {/* Step 0: Search */}
                        {step === 0 && (
                            <>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', marginBottom: '1rem', textAlign: 'center' }}>
                                Log a Film
                            </h3>
                            <LogModalSearch
                                query={query}
                                searching={searching}
                                results={results}
                                searchType={searchType}
                                searchContext={searchContext}
                                onSearch={handleSearch}
                                onSelect={selectFilm}
                            />
                            </>
                        )}

                        {/* Step 1: Log form */}
                        {step === 1 && film && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* ── Film Hero Card — centered poster + title ── */}
                                <div style={{ textAlign: 'center', paddingBottom: '1rem', borderBottom: '1px solid rgba(139,105,20,0.15)' }}>
                                    {film.poster_path && (
                                        <div style={{ display: 'inline-block', position: 'relative' }}>
                                            <img
                                                src={tmdb.poster(film.poster_path, 'w342')}
                                                alt={film.title}
                                                style={{
                                                    width: 140, height: 210, objectFit: 'cover',
                                                    borderRadius: '6px', filter: 'sepia(0.15) contrast(1.05)',
                                                    boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(139,105,20,0.12)',
                                                }}
                                            />
                                        </div>
                                    )}
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--parchment)', lineHeight: 1.3 }}>
                                            {film.title}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.15em', marginTop: '0.3rem' }}>
                                            {film.release_date?.slice(0, 4)}
                                        </div>
                                        <button
                                            onClick={() => { setStep(0); setFilm(null) }}
                                            style={{
                                                fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em',
                                                color: 'var(--sepia)', background: 'none', border: 'none',
                                                marginTop: '0.5rem', cursor: 'pointer', opacity: 0.7,
                                                transition: 'opacity 0.2s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                                        >
                                            ↻ CHANGE FILM
                                        </button>
                                    </div>
                                </div>

                                {/* Status */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                        STATUS
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {[
                                            { val: 'watched', label: 'Watched', icon: <Eye size={12} /> },
                                            { val: 'rewatched', label: 'Rewatched', icon: <History size={12} /> },
                                            { val: 'abandoned', label: 'Abandoned', icon: <X size={12} /> },
                                        ].map(({ val, label, icon }) => (
                                            <button
                                                key={val}
                                                onClick={() => setStatus(val as 'watched' | 'rewatched' | 'abandoned')}
                                                className={`btn ${status === val ? 'btn-primary' : 'btn-ghost'}`}
                                                style={{ fontSize: '0.6rem', padding: '0.35em 0.7em', gap: '0.3em', flex: 1, justifyContent: 'center' }}
                                            >
                                                {icon} {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Abandoned reason */}
                                {status === 'abandoned' && (
                                    <div>
                                        <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                            WHY DID YOU ABANDON IT?
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            {ABANDONED_REASONS.map((r) => (
                                                <button
                                                    key={r}
                                                    onClick={() => setAbandoned(r)}
                                                    className={`tag ${abandoned === r ? 'tag-flicker' : ''}`}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Rating */}
                                {status !== 'abandoned' && (
                                    <div>
                                        <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                            YOUR RATING
                                        </label>
                                        <ReelRating value={rating} onChange={setRating} size="lg" />
                                        {rating > 0 && (
                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', marginTop: '0.3rem' }}>
                                                {['', 'Unwatchable', 'Not Great', 'Fine', 'Really Good', 'Masterpiece'][Math.ceil(rating)]}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ─── MORE DETAILS toggle ─── */}
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setMoreOpen(!moreOpen)}
                                        style={{
                                            background: 'none', border: 'none', width: '100%',
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em',
                                            color: 'var(--sepia)', cursor: 'pointer', padding: '0.5rem 0',
                                            borderTop: '1px solid var(--ash)',
                                        }}
                                    >
                                        <span style={{ transition: 'transform 0.2s', transform: moreOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▸</span>
                                        MORE DETAILS
                                        <span style={{ flex: 1 }} />
                                        <span style={{ fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>DATE · COMPANION · MEDIA · NOTES</span>
                                    </button>
                                </div>

                                <AnimatePresence>
                                {moreOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                                        style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
                                    >

                                {/* Date */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                        <Clock size={10} style={{ display: 'inline', marginRight: '0.25rem' }} />
                                        DATE WATCHED
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                        <button type="button" onClick={() => { setDate(new Date().toISOString().slice(0, 10)); setCalendarOpen(false) }} className={`btn ${date === new Date().toISOString().slice(0, 10) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '0.3em 0.8em', fontSize: '0.55rem' }}>TODAY</button>
                                        <button type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); setCalendarOpen(false) }} className={`btn ${date === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '0.3em 0.8em', fontSize: '0.55rem' }}>YESTERDAY</button>
                                    </div>
                                    {/* Clickable date display */}
                                    <button
                                        type="button"
                                        onClick={() => setCalendarOpen(!calendarOpen)}
                                        style={{
                                            width: '100%', padding: '0.65rem 1rem',
                                            background: 'rgba(10, 7, 3, 0.8)', border: '1px solid var(--ash)',
                                            borderRadius: 'var(--radius-wobbly)', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            transition: 'border-color 0.2s',
                                            borderColor: calendarOpen ? 'var(--sepia)' : 'var(--ash)',
                                        }}
                                    >
                                        <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                                            {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                                        </span>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: calendarOpen ? 'var(--sepia)' : 'var(--fog)' }}>
                                            {calendarOpen ? '▲ CLOSE' : '▼ CHANGE'}
                                        </span>
                                    </button>
                                    {calendarOpen && (
                                        <div style={{ marginTop: '0.5rem' }}>
                                            <NitrateCalendar value={date} onChange={(v) => { setDate(v); setCalendarOpen(false) }} />
                                        </div>
                                    )}
                                </div>

                                {/* Watched With */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                        ♡ WATCHED WITH (OPTIONAL)
                                    </label>
                                    <input
                                        className="input"
                                        placeholder="A name, a memory, or @username..."
                                        value={watchedWith}
                                        onChange={(e) => setWatchedWith(e.target.value)}
                                        maxLength={60}
                                    />
                                </div>

                                {status !== 'abandoned' && (
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                        REVIEW (OPTIONAL)
                                    </label>
                                    <textarea
                                        ref={(el) => {
                                            // Auto-size on mount and when review changes externally (e.g. draft restore)
                                            if (el) {
                                                el.style.height = 'auto'
                                                el.style.height = Math.max(120, el.scrollHeight) + 'px'
                                            }
                                        }}
                                        className="input"
                                        style={{
                                            minHeight: 120,
                                            resize: 'none',
                                            overflow: 'hidden',
                                            fontFamily: 'var(--font-body)',
                                            fontSize: '0.9rem',
                                            lineHeight: 1.7,
                                            letterSpacing: '0.01em',
                                            transition: 'border-color 0.2s, box-shadow 0.2s',
                                        }}
                                        placeholder="Write your thoughts as if typing on a manuscript..."
                                        value={review}
                                        onChange={(e) => {
                                            setReview(e.target.value)
                                            // Auto-expand on every keystroke
                                            const el = e.target
                                            el.style.height = 'auto'
                                            el.style.height = Math.max(120, el.scrollHeight) + 'px'
                                        }}
                                        onFocus={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--sepia)'
                                            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(139,105,20,0.2), inset 0 2px 8px rgba(0,0,0,0.3)'
                                        }}
                                        onBlur={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--ash)'
                                            e.currentTarget.style.boxShadow = 'none'
                                        }}
                                        maxLength={2000}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', alignItems: 'center' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={isSpoiler}
                                                onChange={(e) => setIsSpoiler(e.target.checked)}
                                                style={{ accentColor: 'var(--blood-reel)' }}
                                            />
                                            CONTAINS SPOILERS
                                        </label>
                                        <span style={{
                                            fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                                            color: review.length > 1800 ? 'var(--flicker)' : 'var(--fog)',
                                            transition: 'color 0.3s',
                                        }}>
                                            {review.length}/2000
                                        </span>
                                    </div>
                                </div>
                                )}

                                {/* Editorial Desk (Archivist+) */}
                                {(isPremium) && status !== 'abandoned' && review.length > 0 && (
                                <EditorialDesk
                                    dropCap={dropCap}
                                    setDropCap={setDropCap}
                                    pullQuote={pullQuote}
                                    setPullQuote={setPullQuote}
                                    editorialHeader={editorialHeader}
                                    setEditorialHeader={setEditorialHeader}
                                    availableBackdrops={availableBackdrops}
                                />
                                )}

                                {/* Auteur Features - Collapsed by default to prevent bloat */}
                                {status !== 'abandoned' && (
                                <AuteurToolkit
                                    isAuteur={isAuteur}
                                    autopsyOpen={autopsyOpen}
                                    setAutopsyOpen={setAutopsyOpen}
                                    isAutopsied={isAutopsied}
                                    setIsAutopsied={setIsAutopsied}
                                    autopsy={autopsy}
                                    setAutopsy={setAutopsy}
                                    altPoster={altPoster}
                                    setAltPoster={setAltPoster}
                                    availablePosters={availablePosters}
                                    onUpgrade={() => { closeLogModal(); navigate('/patronage') }}
                                />
                                )}

                                {/* Physical Media */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Archive size={10} style={{ display: 'inline' }} />
                                            THE PHYSICAL ARCHIVE
                                        </div>
                                        {!isPremium && (
                                            <span style={{ color: 'var(--fog)', fontSize: '0.5rem', cursor: 'pointer' }} onClick={() => openSignupModal('archivist')}>
                                                <Lock size={8} style={{ display: 'inline', marginRight: '0.1rem' }} /> REQUIRES ARCHIVIST TIER
                                            </span>
                                        )}
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', opacity: isPremium ? 1 : 0.5, pointerEvents: isPremium ? 'auto' : 'none', marginTop: '0.5rem' }}>
                                        {['None', 'DVD', 'Blu-Ray', '4K UHD', 'VHS', 'Film Print'].map((format) => {
                                            const isActive = physicalMedia === format;
                                            return (
                                                <button
                                                    key={format}
                                                    onClick={() => setPhysicalMedia(format)}
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        fontFamily: 'var(--font-ui)',
                                                        fontSize: '0.6rem',
                                                        letterSpacing: '0.1em',
                                                        color: isActive ? 'var(--parchment)' : 'var(--fog)',
                                                        background: isActive ? 'var(--ink)' : 'var(--soot)',
                                                        border: `1px solid ${isActive ? 'var(--sepia)' : 'var(--ash)'}`,
                                                        borderRadius: '2px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        // Tactile switch effect
                                                        boxShadow: isActive
                                                            ? 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 0 10px rgba(139,105,20,0.1)'
                                                            : '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                                                        transform: isActive ? 'translateY(1px)' : 'translateY(0)'
                                                    }}
                                                >
                                                    {format}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {!isPremium && (
                                        <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.6rem', justifyContent: 'center', borderColor: 'var(--ash)', color: 'var(--fog)' }} onClick={() => { closeLogModal(); navigate('/patronage') }}>
                                            Upgrade to Unlock Physical Tracking
                                        </button>
                                    )}
                                </div>

                {/* Private Notes — Archivist+ (The Vault) */}
                                <div style={{ position: 'relative' }}>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Lock size={10} style={{ display: 'inline' }} />
                                            PRIVATE NOTES (THE CUTTING ROOM FLOOR)
                                        </div>
                                        {!isPremium && (
                                            <span style={{ color: 'var(--fog)', fontSize: '0.5rem' }}>
                                                <Lock size={8} style={{ display: 'inline', marginRight: '0.1rem' }} /> ARCHIVIST TIER
                                            </span>
                                        )}
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <textarea
                                            className="input"
                                            style={{ minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-body)', background: 'var(--ink)', opacity: isPremium ? 1 : 0.4 }}
                                            placeholder={isPremium ? "Hidden from the public. Your personal thoughts, contexts, or reminders..." : "Upgrade to Archivist to unlock private notes..."}
                                            value={isPremium ? privateNotes : ''}
                                            onChange={(e) => isPremium && setPrivateNotes(e.target.value)}
                                            maxLength={1000}
                                            readOnly={!isPremium}
                                        />
                                        {!isPremium && (
                                            <button
                                                onClick={() => { closeLogModal(); navigate('/society') }}
                                                style={{
                                                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                                                    background: 'rgba(10,7,3,0.6)', border: 'none', cursor: 'pointer',
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                                    borderRadius: 'var(--radius-card)',
                                                }}
                                            >
                                                <Lock size={16} color="var(--sepia)" />
                                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>UNLOCK WITH ARCHIVIST</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                    </motion.div>
                                )}
                                </AnimatePresence>

                                {/* Add to Anthology */}
                                {lists.length > 0 && status !== 'abandoned' && (
                                    <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                        <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.75rem' }}>
                                            ✛ ADD TO ANTHOLOGY
                                        </label>
                                        <div className="horizontal-scroll" style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', WebkitOverflowScrolling: 'touch' }}>
                                            {lists.map(list => {
                                                const isActive = list.films.some((f: any) => f.id === film.id);
                                                return (
                                                    <button
                                                        key={list.id}
                                                        type="button"
                                                        onClick={async (e) => {
                                                            e.preventDefault();
                                                            try {
                                                                if (isActive) await removeFilmFromList(list.id, film.id);
                                                                else await addFilmToList(list.id, film);
                                                            } catch {
                                                                toast.error('Failed to update list');
                                                            }
                                                        }}
                                                        style={{
                                                            flexShrink: 0,
                                                            padding: '0.5rem 1rem',
                                                            fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                                                            borderRadius: '2px', cursor: 'pointer', transition: 'all 0.2s',
                                                            background: isActive ? 'var(--sepia)' : 'var(--ink)',
                                                            color: isActive ? 'var(--ink)' : 'var(--bone)',
                                                            border: `1px solid ${isActive ? 'var(--sepia)' : 'var(--ash)'}`,
                                                            fontWeight: isActive ? 'bold' : 'normal',
                                                            boxShadow: isActive ? '0 4px 10px rgba(139,105,20,0.2)' : 'none',
                                                        }}
                                                    >
                                                        {isActive ? <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> </> : '+ '}{list.title.toUpperCase()}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Submit */}
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleLog} disabled={submitting}>
                                        {submitting ? 'SAVING...' : (logModalEditLogId ? 'Save Changes' : 'Log This Film')}
                                    </button>
                                    <button className="btn btn-ghost" onClick={closeLogModal}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        )}

            {shareCardData && (
                <ShareCardModal
                    data={shareCardData}
                    onClose={() => setShareCardData(null)}
                />
            )}
        </>
    )
}
