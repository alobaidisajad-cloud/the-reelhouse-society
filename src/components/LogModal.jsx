import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Star, BookOpen, EyeOff, Clock, Lock } from 'lucide-react'
import { useUIStore, useFilmStore, useAuthStore, useSoundscape } from '../store'
import { tmdb } from '../tmdb'
import { ReelRating } from './UI'
import toast from 'react-hot-toast'

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

    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const openSignupModal = useAuthStore(state => state.openSignupModal)
    const user = useAuthStore(state => state.user)

    const playShutter = useSoundscape(state => state.playShutter)

    const [step, setStep] = useState(0) // 0=search, 1=log
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [searchType, setSearchType] = useState('exact')
    const [searchContext, setSearchContext] = useState('')
    const [searching, setSearching] = useState(false)
    const [film, setFilm] = useState(logModalFilm)
    const [status, setStatus] = useState('watched')
    const [rating, setRating] = useState(0)
    const [review, setReview] = useState('')
    const [isSpoiler, setIsSpoiler] = useState(false)
    const [abandoned, setAbandoned] = useState('')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [watchedWith, setWatchedWith] = useState('')
    const [privateNotes, setPrivateNotes] = useState('')
    const [physicalMedia, setPhysicalMedia] = useState('None')
    const [autopsy, setAutopsy] = useState({ story: 0, script: 0, acting: 0, cinematography: 0, editing: 0, sound: 0 })
    const [altPoster, setAltPoster] = useState(null)
    const [availablePosters, setAvailablePosters] = useState([])
    const [editorialHeader, setEditorialHeader] = useState(null)
    const [dropCap, setDropCap] = useState(false)
    const [pullQuote, setPullQuote] = useState('')
    const [availableBackdrops, setAvailableBackdrops] = useState([])
    const [autopsyOpen, setAutopsyOpen] = useState(false) // Toggle to hide bloat
    const [isAutopsied, setIsAutopsied] = useState(false) // Master flag for 0/10 intentionality
    const searchTimeout = useRef(null)

    const isPremium = user?.role === 'archivist' || user?.role === 'auteur'
    const isAuteur = user?.role === 'auteur'

    useEffect(() => {
        if (film && isPremium) {
            tmdb.movieImages(film.id).then(imgs => {
                // Poster curation — Auteur-only (matches MembershipPage)
                if (isAuteur && imgs.posters) {
                    const validPosters = imgs.posters.filter(p => p.iso_639_1 === 'en' || !p.iso_639_1).slice(0, 15)
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
                setAutopsy(existingLog.autopsy || { story: 0, script: 0, acting: 0, cinematography: 0, editing: 0, sound: 0 })
                setAltPoster(existingLog.altPoster || null)
                setEditorialHeader(existingLog.editorialHeader || null)
                setDropCap(existingLog.dropCap || false)
                setPullQuote(existingLog.pullQuote || '')
                setIsAutopsied(existingLog.isAutopsied || false)
                setAutopsyOpen(existingLog.isAutopsied || false)
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
        }
    }, [logModalFilm, logModalOpen, logModalEditLogId, logs])

    useEffect(() => {
        if (!logModalOpen) {
            setQuery(''); setResults([])
            setRating(0); setReview(''); setIsSpoiler(false)
            setStatus('watched'); setAbandoned('')
            setWatchedWith(''); setPrivateNotes('')
            setPhysicalMedia('None')
            setAutopsy({ cinematography: 0, screenplay: 0, sound: 0, direction: 0, pacing: 0 })
            setAltPoster(null)
            setAvailablePosters([])
            setEditorialHeader(null)
            setDropCap(false)
            setPullQuote('')
            setAvailableBackdrops([])
            setAutopsyOpen(false)
            setIsAutopsied(false)
        }
    }, [logModalOpen])

    const handleSearch = (q) => {
        setQuery(q)
        clearTimeout(searchTimeout.current)
        if (!q.trim()) { setResults([]); return }
        setSearching(true)
        searchTimeout.current = setTimeout(async () => {
            try {
                const data = await tmdb.search(q)
                // Filter out people for the log modal
                const filmsOnly = data.results?.filter(i => i.media_type !== 'person') || []
                setResults(filmsOnly.slice(0, 6))
                setSearchType(data.searchType || 'exact')
                setSearchContext(data.matchedContext || '')
            } catch { setResults([]); setSearchType('exact') }
            finally { setSearching(false) }
        }, 400)
    }

    const selectFilm = (f) => {
        setFilm(f)
        setStep(1)
        setResults([])
        setQuery('')
    }

    const handleLog = () => {
        if (!film) return
        if (!isAuthenticated) {
            closeLogModal()
            toast('Sign in to log films!', { icon: '🎬' })
            return
        }

        playShutter()

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
            privateNotes: privateNotes.trim() || null,
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
            updateLog(logModalEditLogId, logData)
            toast.success(`Log updated for ${film.title}`)
        } else {
            addLog(logData)
            const statusEmoji = { watched: '🎬', rewatched: '🔄', abandoned: '🚪' }

            // ── One-tap share after log ──
            const shareText = rating > 0
                ? `${statusEmoji[status]} ${film.title} (${film.year ?? ''}) — ${rating}/5 ✦ The ReelHouse Society`
                : `${statusEmoji[status]} Just logged ${film.title} on The ReelHouse Society`
            const shareUrl = 'https://thereelhousesociety.com'

            toast(
                (t) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.62rem', letterSpacing: '0.1em', color: '#E8DFC8' }}>
                            {statusEmoji[status]} {film.title} logged to the archive.
                        </div>
                        <button
                            onClick={() => {
                                toast.dismiss(t.id)
                                if (navigator.share) {
                                    navigator.share({ title: film.title, text: shareText, url: shareUrl }).catch(() => { })
                                } else {
                                    navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
                                        toast.success('Copied to clipboard')
                                    }).catch(() => { })
                                }
                            }}
                            style={{
                                background: 'rgba(139,105,20,0.2)', border: '1px solid rgba(139,105,20,0.4)',
                                color: '#E8DFC8', fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                                letterSpacing: '0.15em', padding: '0.4rem 0.8rem', cursor: 'pointer',
                                borderRadius: '2px', alignSelf: 'flex-start',
                                transition: 'background 0.2s',
                            }}
                        >
                            ✦ SHARE THIS LOG
                        </button>
                    </div>
                ),
                { duration: 5000 }
            )
        }

        closeLogModal()

    }

    if (!logModalOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                key="modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeLogModal}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(10,7,3,0.85)', // Slightly more transparent to allow blur
                    backdropFilter: 'blur(12px)', // Premium frosted glass effect
                    WebkitBackdropFilter: 'blur(12px)', // Safari support
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
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
                        maxHeight: 'calc(100vh - 2rem)',
                        overflow: 'auto',
                        position: 'relative',
                        margin: 'auto auto'
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid var(--ash)',
                    }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>
                                {logModalEditLogId ? 'THE SPLICER (EDITING)' : 'TICKET BOOTH'}
                            </div>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)' }}>
                                {step === 0 ? 'Log a Film' : film?.title || 'Log a Film'}
                            </h3>
                        </div>
                        <button
                            onClick={closeLogModal}
                            style={{ background: 'none', border: 'none', color: 'var(--fog)', padding: '0.25rem' }}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div style={{ padding: '1.5rem' }}>
                        {/* Step 0: Search */}
                        {step === 0 && (
                            <div>
                                <div style={{ position: 'relative' }}>
                                    <Search
                                        size={16}
                                        style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--fog)' }}
                                    />
                                    <input
                                        className="input"
                                        style={{ paddingLeft: '2.25rem' }}
                                        placeholder="Search for a film..."
                                        value={query}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                {searching && (
                                    <motion.div
                                        initial={{ opacity: 0.4 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ repeat: Infinity, duration: 0.8, direction: 'alternate' }}
                                        style={{ textAlign: 'center', padding: '1.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', color: 'var(--sepia)', letterSpacing: '0.2em' }}
                                    >
                                        TRANSMITTING QUERY...
                                    </motion.div>
                                )}

                                {results.length > 0 && (
                                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {searchType === 'person' && (
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--sepia)', letterSpacing: '0.1em', padding: '0.25rem 0' }}>✦ ACTOR/DIRECTOR MATCH: {searchContext.toUpperCase()}</div>
                                        )}
                                        {searchType === 'typo' && (
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--flicker)', letterSpacing: '0.1em', padding: '0.25rem 0' }}>✦ FUZZY RESCUE: {searchContext.toUpperCase()}</div>
                                        )}
                                        {searchType === 'semantic' && (
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--parchment)', letterSpacing: '0.1em', padding: '0.25rem 0' }}>✦ SEMANTIC MATCH: {searchContext.toUpperCase()}</div>
                                        )}
                                        {results.map((r) => (
                                            <button
                                                key={r.id}
                                                onClick={() => selectFilm(r)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                    background: 'var(--ink)', border: '1px solid var(--ash)',
                                                    borderRadius: 'var(--radius-wobbly)',
                                                    padding: '0.6rem 0.75rem',
                                                    textAlign: 'left', transition: 'border-color 0.2s, background 0.2s',
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--sepia)'}
                                                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--ash)'}
                                            >
                                                {r.poster_path && (
                                                    <img
                                                        src={tmdb.poster(r.poster_path, 'w92')}
                                                        alt={r.title}
                                                        style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: '2px', filter: 'sepia(0.3)' }}
                                                    />
                                                )}
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{r.title}</div>
                                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                                        {r.release_date?.slice(0, 4)} · {r.vote_average?.toFixed(1)} ★
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {!searching && query && results.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--fog)', fontFamily: 'var(--font-sub)', fontSize: '0.85rem' }}>
                                        No films found for "{query}"
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 1: Log form */}
                        {step === 1 && film && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {/* Film preview */}
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    {film.poster_path && (
                                        <img
                                            src={tmdb.poster(film.poster_path, 'w92')}
                                            alt={film.title}
                                            style={{ width: 56, height: 84, objectFit: 'cover', borderRadius: 'var(--radius-card)', filter: 'sepia(0.3)', flexShrink: 0 }}
                                        />
                                    )}
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.2 }}>
                                            {film.title}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.3rem' }}>
                                            {film.release_date?.slice(0, 4)}
                                        </div>
                                        <button
                                            onClick={() => { setStep(0); setFilm(null) }}
                                            style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', background: 'none', border: 'none', marginTop: '0.4rem', textDecoration: 'underline' }}
                                        >
                                            Change Film
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
                                            { val: 'watched', label: 'Watched', icon: <Star size={12} /> },
                                            { val: 'rewatched', label: 'Rewatched', icon: <BookOpen size={12} /> },
                                            { val: 'abandoned', label: 'Abandoned', icon: <X size={12} /> },
                                        ].map(({ val, label, icon }) => (
                                            <button
                                                key={val}
                                                onClick={() => setStatus(val)}
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
                                                    style={{ cursor: 'none' }}
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

                                {/* Date */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                        <Clock size={10} style={{ display: 'inline', marginRight: '0.25rem' }} />
                                        DATE WATCHED
                                    </label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>

                                {/* Watched With */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                        ♡ WATCHED WITH (OPTIONAL)
                                    </label>
                                    <input
                                        className="input"
                                        placeholder="A name, a memory..."
                                        value={watchedWith}
                                        onChange={(e) => setWatchedWith(e.target.value)}
                                        maxLength={60}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                        REVIEW (OPTIONAL)
                                    </label>
                                    <textarea
                                        className="input"
                                        style={{ minHeight: 100, resize: 'vertical', fontFamily: 'var(--font-body)' }}
                                        placeholder="Write your thoughts as if typing on a manuscript..."
                                        value={review}
                                        onChange={(e) => setReview(e.target.value)}
                                        maxLength={2000}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', cursor: 'none' }}>
                                            <input
                                                type="checkbox"
                                                checked={isSpoiler}
                                                onChange={(e) => setIsSpoiler(e.target.checked)}
                                                style={{ accentColor: 'var(--blood-reel)' }}
                                            />
                                            CONTAINS SPOILERS
                                        </label>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                            {review.length}/2000
                                        </span>
                                    </div>
                                </div>

                                {/* Editorial Desk (Archivist+) */}
                                {(isPremium) && status !== 'abandoned' && review.length > 0 && (
                                    <div style={{ padding: '1.25rem', border: '1px solid var(--sepia)', borderRadius: 'var(--radius-card)', background: 'rgba(139,105,20,0.05)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--sepia)' }}>
                                                ✦ The Editorial Desk
                                            </div>
                                        </div>

                                        {/* Drop Cap */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)' }}>
                                                STYLIZED DROP CAP
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={dropCap}
                                                    onChange={(e) => setDropCap(e.target.checked)}
                                                    style={{ accentColor: 'var(--sepia)' }}
                                                />
                                                ENABLE
                                            </label>
                                        </div>

                                        {/* Pull Quote */}
                                        <div>
                                            <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block', marginBottom: '0.5rem' }}>
                                                PULL QUOTE
                                            </label>
                                            <input
                                                className="input"
                                                placeholder="Highlight a memorable line from your review..."
                                                value={pullQuote}
                                                onChange={(e) => setPullQuote(e.target.value)}
                                                maxLength={120}
                                                style={{ borderStyle: 'dashed', borderColor: 'var(--sepia)', fontFamily: 'var(--font-sub)', fontStyle: 'italic' }}
                                            />
                                        </div>

                                        {/* Header Still */}
                                        <div>
                                            <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block', marginBottom: '0.75rem' }}>
                                                ARTICLE HEADER (STILL)
                                            </label>
                                            {availableBackdrops.length > 0 ? (
                                                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
                                                    <button
                                                        onClick={() => setEditorialHeader(null)}
                                                        style={{ flexShrink: 0, width: 80, height: 45, background: editorialHeader === null ? 'var(--sepia)' : 'var(--ink)', border: editorialHeader === null ? '2px solid var(--sepia)' : '1px solid var(--ash)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: editorialHeader === null ? 'var(--ink)' : 'var(--fog)' }}
                                                    >
                                                        NONE
                                                    </button>
                                                    {availableBackdrops.map(p => (
                                                        <img
                                                            key={p.file_path}
                                                            src={tmdb.backdrop(p.file_path, 'w300')}
                                                            onClick={() => setEditorialHeader(p.file_path)}
                                                            style={{
                                                                flexShrink: 0, width: 80, height: 45, objectFit: 'cover', borderRadius: '2px', cursor: 'pointer',
                                                                border: editorialHeader === p.file_path ? '2px solid var(--sepia)' : '1px solid transparent',
                                                                opacity: editorialHeader && editorialHeader !== p.file_path ? 0.4 : 1
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)' }}>
                                                    No stills found.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Auteur Features - Collapsed by default to prevent bloat */}
                                {status !== 'abandoned' && (
                                    <div style={{ padding: '1rem', border: '1px solid var(--blood-reel)', borderRadius: 'var(--radius-card)', background: 'rgba(162,36,36,0.05)', display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: isAuteur ? 1 : 0.6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setAutopsyOpen(!autopsyOpen)}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--blood-reel)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                ✦ Auteur Toolkit {autopsyOpen ? '[-]' : '[+]'}
                                            </div>
                                            {!isAuteur && (
                                                <button onClick={(e) => { e.stopPropagation(); closeLogModal(); navigate('/patronage') }} style={{ background: 'none', border: 'none', color: 'var(--blood-reel)', textDecoration: 'underline', fontSize: '0.6rem', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                    <Lock size={10} /> UPGRADE
                                                </button>
                                            )}
                                        </div>

                                        <AnimatePresence>
                                            {autopsyOpen && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'hidden' }}
                                                >
                                                    {/* Autopsy Engine */}
                                                    <div style={{ opacity: isAuteur ? 1 : 0.4, pointerEvents: isAuteur ? 'auto' : 'none' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block' }}>
                                                                    THE AUTOPSY ENGINE (1-10)
                                                                </label>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--blood-reel)', letterSpacing: '0.1em' }}>
                                                                    <input type="checkbox" checked={isAutopsied} onChange={(e) => setIsAutopsied(e.target.checked)} style={{ accentColor: 'var(--blood-reel)' }} />
                                                                    ENABLE
                                                                </label>
                                                            </div>
                                                            <button onClick={(e) => {
                                                                e.preventDefault()
                                                                toast("STORY: Narrative & Structure\nSCRIPT: Dialogue & Theme\nACTING: Micro-expressions & Presence\nCINEMATOGRAPHY: Light, Shadow & Framing\nEDITING: Rhythm & Pacing\nSOUND: Score & Silence", { duration: 8000, icon: '📖', style: { background: 'var(--ink)', border: '1px solid var(--sepia)', color: 'var(--parchment)', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', textAlign: 'left', minWidth: '300px' } })
                                                            }} className="btn btn-ghost" style={{ fontSize: '0.45rem', padding: '0.2rem 0.4rem', color: 'var(--fog)' }}>
                                                                <BookOpen size={10} style={{ marginRight: '0.3rem' }} /> FIELD MANUAL
                                                            </button>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                            {Object.keys(autopsy).map(axis => {
                                                                const labels = { story: 'STORY', script: 'SCRIPT/DIALOGUE', acting: 'ACTING/CHAR', cinematography: 'CINEMATOGRAPHY', editing: 'EDITING/PACING', sound: 'SOUND DESIGN' };
                                                                return (
                                                                    <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                        <div style={{ width: '100px', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.05em', color: 'var(--fog)' }}>
                                                                            {labels[axis] || axis.toUpperCase()}
                                                                        </div>
                                                                        <input
                                                                            type="range"
                                                                            min="0" max="10" step="1"
                                                                            value={autopsy[axis]}
                                                                            onChange={(e) => setAutopsy({ ...autopsy, [axis]: parseInt(e.target.value) })}
                                                                            style={{ flex: 1, accentColor: 'var(--blood-reel)', height: '4px', background: 'var(--ash)', appearance: 'none', borderRadius: '2px', cursor: 'none' }}
                                                                        />
                                                                        <div style={{ width: '20px', textAlign: 'right', fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--bone)' }}>
                                                                            {autopsy[axis] || '-'}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Curatorial Control */}
                                                    <div style={{ opacity: isAuteur ? 1 : 0.4, pointerEvents: isAuteur ? 'auto' : 'none' }}>
                                                        <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block', marginBottom: '0.75rem' }}>
                                                            CURATORIAL CONTROL (ALT POSTER)
                                                        </label>
                                                        {availablePosters.length > 0 ? (
                                                            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
                                                                <button
                                                                    onClick={() => setAltPoster(null)}
                                                                    style={{ flexShrink: 0, width: 44, height: 66, background: altPoster === null ? 'var(--sepia)' : 'var(--ink)', border: altPoster === null ? '2px solid var(--sepia)' : '1px solid var(--ash)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: altPoster === null ? 'var(--ink)' : 'var(--fog)' }}
                                                                >
                                                                    DEFAULT
                                                                </button>
                                                                {availablePosters.map(p => (
                                                                    <img
                                                                        key={p.file_path}
                                                                        src={tmdb.poster(p.file_path, 'w92')}
                                                                        onClick={() => setAltPoster(p.file_path)}
                                                                        style={{
                                                                            flexShrink: 0, width: 44, height: 66, objectFit: 'cover', borderRadius: '2px', cursor: 'pointer',
                                                                            border: altPoster === p.file_path ? '2px solid var(--blood-reel)' : '1px solid transparent',
                                                                            opacity: altPoster && altPoster !== p.file_path ? 0.4 : 1
                                                                        }}
                                                                    />
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)' }}>
                                                                No alternative active posters found on TMDB.
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Physical Media */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <BookOpen size={10} style={{ display: 'inline' }} />
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

                                {/* Private Notes */}
                                <div>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                        <Lock size={10} style={{ display: 'inline' }} />
                                        PRIVATE NOTES (THE CUTTING ROOM FLOOR)
                                    </label>
                                    <textarea
                                        className="input"
                                        style={{ minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-body)', background: 'var(--ink)' }}
                                        placeholder="Hidden from the public. Your personal thoughts, contexts, or reminders..."
                                        value={privateNotes}
                                        onChange={(e) => setPrivateNotes(e.target.value)}
                                        maxLength={1000}
                                    />
                                </div>

                                {/* Submit */}
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleLog}>
                                        {logModalEditLogId ? 'Save Changes' : 'Log This Film'}
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
        </AnimatePresence >
    )
}
