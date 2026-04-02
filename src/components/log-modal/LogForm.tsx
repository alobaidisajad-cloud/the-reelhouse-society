import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Eye, History, Lock, Archive, Check } from 'lucide-react'
import { useFilmStore, useAuthStore, useUIStore } from '../../store'
import { tmdb } from '../../tmdb'
import { ReelRating } from '../UI'
import EditorialDesk from './EditorialDesk'
import AuteurToolkit from './AuteurToolkit'
import LogDateSelector from './LogDateSelector'
import LogReviewEditor from './LogReviewEditor'
import LogActionRow from './LogActionRow'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const AUTOPSY_INIT = Object.freeze({ story: 0, script: 0, acting: 0, cinematography: 0, editing: 0, sound: 0 })
const ABANDONED_REASONS = ['Too Slow', 'Too Upsetting', 'Life Got in the Way', "I'll Return Someday", "Lost the Plot", "Wrong Mood"]

export default function LogForm({ film }: { film: any }) {
    const navigate = useNavigate()
    const logModalOpen = useUIStore(state => state.logModalOpen)
    const logModalEditLogId = useUIStore(state => state.logModalEditLogId)
    const closeLogModal = useUIStore(state => state.closeLogModal)
    const openSignupModal = useUIStore(state => state.openSignupModal)

    const addLog = useFilmStore(state => state.addLog)
    const updateLog = useFilmStore(state => state.updateLog)
    const removeLog = useFilmStore(state => state.removeLog)
    const logs = useFilmStore(state => state.logs)
    const lists = useFilmStore(state => state.lists)
    const addFilmToList = useFilmStore(state => state.addFilmToList)
    const removeFilmFromList = useFilmStore(state => state.removeFilmFromList)

    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const user = useAuthStore(state => state.user)

    const [status, setStatus] = useState<'watched' | 'rewatched' | 'abandoned'>('watched')
    const [rating, setRating] = useState(0)
    const [review, setReview] = useState('')
    const [isSpoiler, setIsSpoiler] = useState(false)
    const [abandoned, setAbandoned] = useState('')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [watchedWith, setWatchedWith] = useState('')
    const [privateNotes, setPrivateNotes] = useState('')
    const [physicalMedia, setPhysicalMedia] = useState('None')
    const [autopsy, setAutopsy] = useState<Record<string, number>>({ ...AUTOPSY_INIT })
    const [altPoster, setAltPoster] = useState<string | null>(null)
    const [availablePosters, setAvailablePosters] = useState<any[]>([])
    const [editorialHeader, setEditorialHeader] = useState<string | null>(null)
    const [dropCap, setDropCap] = useState(false)
    const [pullQuote, setPullQuote] = useState('')
    const [availableBackdrops, setAvailableBackdrops] = useState<any[]>([])
    const [autopsyOpen, setAutopsyOpen] = useState(false)
    const [isAutopsied, setIsAutopsied] = useState(false)
    const [moreOpen, setMoreOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches)
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const isPremium = user?.role === 'archivist' || user?.role === 'auteur' || user?.role === 'projectionist'
    const isAuteur = user?.role === 'auteur' || user?.role === 'projectionist'

    useEffect(() => {
        if (film && isPremium) {
            tmdb.movieImages(film.id).then((imgs: any) => {
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
        if (film && logModalEditLogId) {
            const existingLog = logs.find(l => l.id === logModalEditLogId)
            if (existingLog) {
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
                setMoreOpen(!!(existingLog.watchedWith || existingLog.privateNotes || (existingLog.physicalMedia && existingLog.physicalMedia !== 'None')))
            }
        }
    }, [film, logModalEditLogId, logs])

    useEffect(() => {
        if (film && !logModalEditLogId && logModalOpen) {
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
    }, [film, logModalEditLogId, logModalOpen])

    useEffect(() => {
        if (film && !logModalEditLogId && logModalOpen) {
            const debounce = setTimeout(() => {
                const draft = { rating, review, status, isSpoiler, abandoned, watchedWith, privateNotes, autopsy, autopsyOpen }
                localStorage.setItem(`reelhouse_draft_${film.id}`, JSON.stringify(draft))
            }, 1000)
            return () => clearTimeout(debounce)
        }
    }, [film, logModalEditLogId, logModalOpen, rating, review, status, isSpoiler, abandoned, watchedWith, privateNotes, autopsy, autopsyOpen])


    const handleLog = async () => {
        if (submitting) return
        if (!film) return
        if (!isAuthenticated) {
            closeLogModal()
            toast('Sign in to log films.', { icon: '✦' })
            return
        }
        if (rating === 0 && !review.trim() && status !== 'abandoned') {
            toast('Rate the film or write a review before logging.', { icon: '✦' })
            return
        }

        const logData = {
            filmId: film.id,
            title: film.title,
            poster: altPoster || film.poster_path, // Base legacy
            altPoster: altPoster, // Explicit alt
            year: film.release_date?.split('-')[0] || '',
            rating,
            review,
            isSpoiler,
            status,
            abandonedReason: status === 'abandoned' ? abandoned : null,
            watchedDate: date,
            watchedWith,
            privateNotes,
            physicalMedia,
            isAutopsied: isPremium && isAutopsied,
            autopsy: isPremium && isAutopsied ? autopsy : null,
            editorialHeader: isPremium ? editorialHeader : null,
            dropCap: isPremium ? dropCap : false,
            pullQuote: isPremium ? pullQuote : undefined
        }

        setSubmitting(true)
        try {
            if (logModalEditLogId) {
                await updateLog(logModalEditLogId, logData as any)
                toast.success('Log updated flawlessly.', { style: { background: 'var(--soot)', color: 'var(--sepia)', border: '1px solid var(--sepia)' } })
            } else {
                await addLog(logData as any)
                localStorage.removeItem(`reelhouse_draft_${film.id}`)
                toast.success('Film logged to your archive.', { style: { background: 'var(--ink)', color: 'var(--parchment)', border: '1px solid var(--sepia)' } })
            }
            closeLogModal()
        } catch (err: any) {
            toast.error(err.message || 'Failed to save log.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <LogDateSelector
                date={date}
                setDate={setDate}
                calendarOpen={calendarOpen}
                setCalendarOpen={setCalendarOpen}
            />

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
                <LogReviewEditor
                    review={review}
                    setReview={setReview}
                    isSpoiler={isSpoiler}
                    setIsSpoiler={setIsSpoiler}
                />
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
            <LogActionRow
                showDeleteConfirm={showDeleteConfirm}
                setShowDeleteConfirm={setShowDeleteConfirm}
                logModalEditLogId={logModalEditLogId}
                removeLog={removeLog}
                closeLogModal={closeLogModal}
                handleLog={handleLog}
                submitting={submitting}
            />
        </div>
    )
}
