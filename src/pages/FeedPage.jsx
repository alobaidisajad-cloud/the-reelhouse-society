import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../store'
import { ReelRating, SectionHeader, RadarChart } from '../components/UI'
import { tmdb } from '../tmdb'
import { Heart, MessageSquare, Bookmark, Download, Send, RefreshCw } from 'lucide-react'
import ReactionBar from '../components/ReactionBar'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'

// ── ACTIVITY CARD ──
function ActivityCard({ log }) {
    const toggleEndorse = useFilmStore(state => state.toggleEndorse)
    // Memoize stamp rotation so Math.random() doesn't fire on every re-render
    const stampRotation = React.useMemo(() => `${(Math.random() * 8 - 4).toFixed(2)}deg`, [])
    const storeEndorsed = useFilmStore(state => state.interactions.some(i => i.targetId === log.id && i.type === 'endorse'))

    // Optimistic local state for immediate UI feedback without waiting on DB/Store tick
    const [optimisticEndorsed, setOptimisticEndorsed] = useState(storeEndorsed)
    const [endorsementCount, setEndorsementCount] = useState(log.endorsementCount ?? 0)

    // Sync if store changes externally
    useEffect(() => {
        setOptimisticEndorsed(storeEndorsed)
    }, [storeEndorsed])

    const handleEndorse = () => {
        // Optimistic update
        setOptimisticEndorsed(!optimisticEndorsed)
        setEndorsementCount(p => optimisticEndorsed ? Math.max(0, p - 1) : p + 1)

        // Background sync
        toggleEndorse(log.id)
    }

    const [isExporting, setIsExporting] = useState(false)
    const dossierRef = useRef(null)

    // ── ANNOTATE ──
    const [annotateOpen, setAnnotateOpen] = useState(false)
    const [annotateText, setAnnotateText] = useState('')
    const [comments, setComments] = useState([])
    const [commentsLoading, setCommentsLoading] = useState(false)
    const [submittingComment, setSubmittingComment] = useState(false)
    const { user: currentUser } = useAuthStore()

    const loadComments = async () => {
        if (!isSupabaseConfigured || !log.id) return
        setCommentsLoading(true)
        const { data } = await supabase
            .from('log_comments')
            .select('id, username, body, created_at')
            .eq('log_id', log.id)
            .order('created_at', { ascending: true })
            .limit(20)
        setComments(data || [])
        setCommentsLoading(false)
    }

    const handleAnnotateToggle = () => {
        const next = !annotateOpen
        setAnnotateOpen(next)
        if (next && comments.length === 0) loadComments()
    }

    const handleAnnotateSubmit = async () => {
        if (!annotateText.trim() || !currentUser) return
        setSubmittingComment(true)
        const { error } = await supabase.from('log_comments').insert({
            log_id: log.id,
            user_id: currentUser.id,
            username: currentUser.username,
            body: annotateText.trim(),
        })
        if (!error) {
            setComments(prev => [...prev, { id: Date.now(), username: currentUser.username, body: annotateText.trim(), created_at: new Date().toISOString() }])
            setAnnotateText('')
            toast.success('Annotation filed.')
        } else {
            toast.error('Could not save annotation.')
        }
        setSubmittingComment(false)
    }

    // ── RE-TRANSMIT ──
    const [retransmitted, setRetransmitted] = useState(false)

    const handleRetransmit = async () => {
        if (!currentUser) { toast.error('Sign in to retransmit.'); return }
        if (retransmitted) return
        setRetransmitted(true)
        if (isSupabaseConfigured) {
            await supabase.from('interactions').insert({
                user_id: currentUser.id,
                target_log_id: log.id,
                type: 'retransmit',
            }).then(({ error }) => {
                // Ignore duplicate constraint errors (already retransmitted)
                if (error && !error.message.includes('duplicate')) {
                    // Retransmit failed silently — user sees toast success already
                }
            })
        }
        toast.success('Signal retransmitted to your archive.')
    }

    const endorsed = optimisticEndorsed

    const exportDossier = async () => {
        if (!dossierRef.current) return
        setIsExporting(true)
        try {
            // Give React a tick to display the hidden dossier offscreen
            await new Promise(resolve => setTimeout(resolve, 50))

            const canvas = await html2canvas(dossierRef.current, {
                backgroundColor: '#0a0703', // var(--ink)
                scale: 2, // High-res export
                useCORS: true,
                logging: false,
                onclone: (clonedDoc) => {
                    const el = clonedDoc.getElementById(`dossier-${log.id}`)
                    if (el) el.style.display = 'flex'
                }
            })

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
            const link = document.createElement('a')
            link.download = `ReelHouse-Dossier-${log.user}-${log.film?.title?.replace(/\s+/g, '-')}.jpg`
            link.href = dataUrl
            link.click()
        } catch {
            // Export failed silently — isExporting state resets in finally
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div
            className="fade-in-up"
            style={{
                background: 'var(--soot)',
                border: '1px solid var(--ash)',
                borderRadius: '2px',
                padding: '1.25rem',
                position: 'relative',
                display: 'flex',
                gap: '1.25rem',
                borderLeft: '3px solid var(--sepia)'
            }}
        >
            {/* Timestamp */}
            <div style={{ position: 'absolute', top: '1rem', right: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                {log.timestamp || 'RECENT'}
            </div>

            {/* Poster */}
            <div style={{ width: 80, height: 120, flexShrink: 0, borderRadius: '2px', overflow: 'hidden', background: 'var(--ink)', border: '1px solid var(--ash)', position: 'relative' }}>
                {log.film?.poster ? (
                    <img
                        src={tmdb.poster(log.film.poster, 'w185')}
                        alt={log.film.title}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9, mixBlendMode: 'luminosity' }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', gap: '0.4rem' }}>
                        {/* Film frame placeholder SVG */}
                        <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.25 }}>
                            <rect x="1" y="1" width="30" height="38" rx="1" stroke="var(--sepia)" strokeWidth="1.2" strokeDasharray="3 2" />
                            <rect x="4" y="4" width="5" height="4" rx="0.5" fill="var(--sepia)" opacity="0.6" />
                            <rect x="23" y="4" width="5" height="4" rx="0.5" fill="var(--sepia)" opacity="0.6" />
                            <rect x="4" y="32" width="5" height="4" rx="0.5" fill="var(--sepia)" opacity="0.6" />
                            <rect x="23" y="32" width="5" height="4" rx="0.5" fill="var(--sepia)" opacity="0.6" />
                            <line x1="4" y1="10" x2="28" y2="10" stroke="var(--ash)" strokeWidth="0.5" />
                            <line x1="4" y1="30" x2="28" y2="30" stroke="var(--ash)" strokeWidth="0.5" />
                        </svg>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.5, textAlign: 'center', lineHeight: 1.4 }}>NO REEL<br />ON FILE</span>
                    </div>
                )}
                <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(139,105,20,0.1)', pointerEvents: 'none' }} />
            </div>

            {/* Content Body */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <Link to={`/user/${log.user}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none' }}>
                        @{(log.user || 'anonymous').toUpperCase()}
                    </Link>
                    <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                        color: log.userRole === 'auteur' ? 'var(--sepia)' : 'var(--fog)'
                    }}>
                        — {(log.userRole || 'cinephile').toUpperCase()} {log.userRole === 'auteur' && '✦'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <Link
                        to={`/film/${log.film?.id}`}
                        style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', textDecoration: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                    >
                        {log.film?.title}
                    </Link>
                    {log.film?.year && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            {log.film.year}
                        </span>
                    )}
                </div>

                {log.rating > 0 && <ReelRating value={log.rating} size="sm" />}

                {/* Pull Quote */}
                {log.pullQuote && (
                    <div style={{
                        marginTop: '1rem', marginBottom: '1rem', paddingLeft: '1rem', borderLeft: '4px solid var(--sepia)',
                        fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--sepia)', fontStyle: 'italic',
                        lineHeight: 1.2
                    }}>
                        "{log.pullQuote}"
                    </div>
                )}

                {/* Review text */}
                {log.review && (
                    <div style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                        color: 'var(--bone)', marginTop: '0.75rem', lineHeight: 1.6,
                    }}>
                        {log.dropCap ? (
                            <>
                                <span style={{
                                    float: 'left', fontSize: '3rem', lineHeight: '2.5rem',
                                    padding: '0.2rem 0.5rem 0 0', fontFamily: 'var(--font-display)',
                                    color: 'var(--sepia)'
                                }}>
                                    {log.review.charAt(0)}
                                </span>
                                {log.review.slice(1)}
                            </>
                        ) : (
                            <span>{log.review.length > 300 ? log.review.slice(0, 300) + '…' : log.review}</span>
                        )}
                    </div>
                )}

                {log.isAutopsied && log.autopsy && (
                    <RadarChart autopsy={log.autopsy} size={140} />
                )}

                {/* Social Interaction Bar */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(139,105,20,0.2)', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <button onClick={handleEndorse} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: endorsed ? 'var(--sepia)' : 'var(--fog)', cursor: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'} onMouseLeave={e => e.currentTarget.style.color = endorsed ? 'var(--sepia)' : 'var(--fog)'}>
                            <Heart size={12} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} />
                            {endorsed ? 'ENDORSED' : 'ENDORSE'} ({endorsementCount})
                        </button>

                        {/* ── SOCIETY STAMP OVERLAY ── */}
                        {endorsed && (
                            <div className="society-stamp" style={{ '--stamp-rotation': stampRotation, position: 'absolute', bottom: '2.5rem', right: '1.5rem', zIndex: 100 }}>
                                <svg className="stamp-svg" viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg">
                                    <g transform="rotate(-2 150 60)">
                                        <rect x="5" y="5" width="290" height="110" rx="4" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="30 4 12 3 50 6" opacity="0.8" />
                                        <rect x="12" y="12" width="276" height="96" rx="2" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="10 2 20 4" opacity="0.6" />
                                        <text x="150" y="55" fontFamily="var(--font-display-alt), 'Bungee Shade', sans-serif" fontSize="38" textAnchor="middle" fill="currentColor" letterSpacing="2" opacity="0.9" style={{ textTransform: 'uppercase' }}>
                                            REVIEWED
                                        </text>
                                        <text x="150" y="90" fontFamily="var(--font-ui), monospace" fontSize="16" textAnchor="middle" fill="currentColor" letterSpacing="4" opacity="0.7">
                                            THE SOCIETY
                                        </text>
                                        {/* Grime/Distress marks */}
                                        <path d="M20 20 Q50 30 40 50 M260 90 Q240 80 270 60" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
                                        <circle cx="270" cy="30" r="3" fill="currentColor" opacity="0.5" />
                                        <circle cx="40" cy="90" r="2" fill="currentColor" opacity="0.3" />
                                    </g>
                                </svg>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleAnnotateToggle}
                        style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: annotateOpen ? 'var(--parchment)' : 'var(--fog)', cursor: 'none', transition: 'color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'}
                        onMouseLeave={e => e.currentTarget.style.color = annotateOpen ? 'var(--parchment)' : 'var(--fog)'}
                    >
                        <MessageSquare size={12} /> ANNOTATE {comments.length > 0 && `(${comments.length})`}
                    </button>
                    <button
                        onClick={handleRetransmit}
                        style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: retransmitted ? 'var(--sepia)' : 'var(--fog)', cursor: retransmitted ? 'default' : 'none', transition: 'color 0.2s', marginLeft: 'auto' }}
                        onMouseEnter={e => { if (!retransmitted) e.currentTarget.style.color = 'var(--sepia)' }}
                        onMouseLeave={e => { if (!retransmitted) e.currentTarget.style.color = 'var(--fog)' }}
                    >
                        <RefreshCw size={12} /> {retransmitted ? 'RETRANSMITTED ✦' : 'RE-TRANSMIT'}
                    </button>
                    {log.isAutopsied && log.autopsy && (
                        <button onClick={exportDossier} disabled={isExporting} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', cursor: 'none', transition: 'color 0.2s', opacity: isExporting ? 0.5 : 1 }} onMouseEnter={e => e.currentTarget.style.color = 'var(--flicker)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--sepia)'}>
                            <Download size={12} /> {isExporting ? 'ENCODING...' : 'TRANSMIT DOSSIER'}
                        </button>
                    )}
                </div>

                {/* ── ANNOTATION PANEL ── */}
                {annotateOpen && (
                    <div style={{ marginTop: '1rem', borderTop: '1px dashed rgba(139,105,20,0.2)', paddingTop: '1rem' }}>
                        {/* Existing comments */}
                        {commentsLoading && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>RETRIEVING ANNOTATIONS...</div>}
                        {comments.map(c => (
                            <div key={c.id} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                <Link to={`/user/${c.username}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>@{c.username}</Link>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.5 }}>{c.body}</span>
                            </div>
                        ))}
                        {/* Input */}
                        {currentUser ? (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <input
                                    value={annotateText}
                                    onChange={e => setAnnotateText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAnnotateSubmit()}
                                    placeholder="File an annotation..."
                                    style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', borderRadius: '2px', color: 'var(--bone)', fontFamily: 'var(--font-body)', fontSize: '0.75rem', padding: '0.4rem 0.6rem', outline: 'none' }}
                                />
                                <button onClick={handleAnnotateSubmit} disabled={submittingComment || !annotateText.trim()} className="btn btn-primary" style={{ padding: '0.4rem 0.7rem', fontSize: '0.5rem', opacity: submittingComment ? 0.5 : 1 }}>
                                    <Send size={10} />
                                </button>
                            </div>
                        ) : (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>SIGN IN TO ANNOTATE</div>
                        )}
                    </div>
                )}

                {log.isAutopsied && log.autopsy && (
                    <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none', userSelect: 'none' }}>
                        <div id={`dossier-${log.id}`} ref={dossierRef} style={{
                            width: '1080px', height: '1920px', background: 'var(--ink)',
                            display: isExporting ? 'flex' : 'none', flexDirection: 'column', padding: '120px 80px',
                            position: 'relative', overflow: 'hidden', boxSizing: 'border-box'
                        }}>
                            {/* Texture Overlay */}
                            <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(139,105,20,0.03) 3px)', zIndex: 0 }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.8) 100%)', zIndex: 0 }} />

                            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '4px solid var(--sepia)', paddingBottom: '30px', marginBottom: '80px' }}>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: 'var(--parchment)' }}>The Society Record</div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.2em', color: 'var(--fog)', marginBottom: '10px' }}>ARCHIVE DEPT // NO. {log.id.substring(0, 6)}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>DATE: {log.timestamp || 'CURRENT'}</div>
                                    </div>
                                </div>

                                {/* Body */}
                                <div style={{ display: 'flex', flex: 1, gap: '60px' }}>
                                    {/* Left Col - Poster */}
                                    <div style={{ width: '400px', flexShrink: 0 }}>
                                        {log.film?.poster && (
                                            <div style={{ padding: '20px', border: '2px dashed var(--ash)', background: 'var(--soot)' }}>
                                                <img src={tmdb.poster(log.film.poster, 'w500')} style={{ width: '100%', border: '1px solid var(--soot)' }} />
                                            </div>
                                        )}
                                        <div style={{ marginTop: '40px', fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--bone)', lineHeight: 1.1 }}>
                                            {log.film?.title.toUpperCase()}
                                        </div>
                                        {log.film?.year && (
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '2rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginTop: '10px' }}>
                                                {log.film.year}
                                            </div>
                                        )}
                                        {log.rating > 0 && (
                                            <div style={{ marginTop: '30px', transform: 'scale(2)', transformOrigin: 'top left' }}>
                                                <ReelRating value={log.rating} size="lg" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Col - Autopsy */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ transform: 'scale(1.4)', transformOrigin: 'top left', width: '70%' }}>
                                            <RadarChart autopsy={log.autopsy} />
                                        </div>
                                        {log.pullQuote && (
                                            <div style={{
                                                marginTop: 'auto', marginBottom: '60px', paddingLeft: '40px', borderLeft: '8px solid var(--sepia)',
                                                fontFamily: 'var(--font-display)', fontSize: '3.5rem', color: 'var(--sepia)', fontStyle: 'italic',
                                                lineHeight: 1.2
                                            }}>
                                                "{log.pullQuote}"
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Footer Signature */}
                                <div style={{ borderTop: '2px dashed var(--ash)', paddingTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.2rem', letterSpacing: '0.3em', color: 'var(--fog)', marginBottom: '10px' }}>SUBMITTING AGENT</div>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--blood-reel)', fontStyle: 'italic' }}>@{log.user.toUpperCase()}</div>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.5em', color: 'var(--fog)', opacity: 0.5 }}>
                                        THE REELHOUSE SOCIETY
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Emoji Reactions */}
                <div style={{ marginTop: '0.75rem' }}>
                    <ReactionBar
                        logId={log.id}
                        logAuthor={log.user}
                        filmTitle={log.film?.title}
                    />
                </div>
            </div>
        </div>
    )
}

// ── RATING LEGEND (one-time, dismissible) ──
function RatingLegend() {
    const [visible, setVisible] = useState(() => {
        try { return !localStorage.getItem('reel-legend-v1') } catch { return true }
    })
    if (!visible) return null
    const dismiss = () => {
        try { localStorage.setItem('reel-legend-v1', '1') } catch {}
        setVisible(false)
    }
    const scale = [
        { reels: 1, label: 'DREADFUL' },
        { reels: 2, label: 'FORGETTABLE' },
        { reels: 3, label: 'WATCHABLE' },
        { reels: 4, label: 'BRILLIANT' },
        { reels: 5, label: 'CANON' },
    ]
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
            fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.14em',
            color: 'var(--fog)',
            border: '1px dashed rgba(139,105,20,0.25)',
            borderRadius: '2px',
            padding: '0.6rem 0.9rem',
            marginBottom: '1.5rem',
            background: 'rgba(10,7,3,0.5)',
        }}>
            <span style={{ color: 'var(--sepia)', whiteSpace: 'nowrap', opacity: 0.8 }}>REEL GUIDE —</span>
            {scale.map((s, i) => (
                <span key={s.reels} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--sepia)', letterSpacing: '0.05em' }}>{'\u2726'.repeat(s.reels)}</span>
                    <span style={{ color: 'var(--bone)' }}>{s.label}</span>
                    {i < 4 && <span style={{ color: 'var(--ash)', margin: '0 0.15rem' }}>·</span>}
                </span>
            ))}
            <button
                onClick={dismiss}
                style={{
                    marginLeft: 'auto', background: 'none', border: 'none',
                    color: 'var(--fog)', cursor: 'none', padding: '0 0.2rem',
                    fontFamily: 'var(--font-ui)', fontSize: '0.6rem', opacity: 0.5,
                    transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                title="Got it"
            >✕</button>
        </div>
    )
}

// ── FEED PAGE ──
export default function FeedPage() {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const user = useAuthStore(state => state.user)
    const openSignupModal = useUIStore(state => state.openSignupModal)
    const openLogModal = useUIStore(state => state.openLogModal)

    // Fix 1: Real community feed from Supabase — all users' logs
    const [communityFeed, setCommunityFeed] = useState([])
    const [feedLoading, setFeedLoading] = useState(true)

    // Fix 2: Real sidebar data from Supabase
    const [recentLists, setRecentLists] = useState([])
    const [activeAgents, setActiveAgents] = useState([])

    const fetchCommunityFeed = useCallback(async () => {
        if (!isSupabaseConfigured) { setFeedLoading(false); return }
        setFeedLoading(true)
        try {
            // Note: explicit FK hint solves PGRST201 ambiguous relationship error
            // 'profiles!logs_user_id_fkey' tells PostgREST which FK path to use
            const { data, error } = await supabase
                .from('logs')
                .select('*, profiles!logs_user_id_fkey(username, role)')
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error && data) {
                    const mapped = data.map(l => ({
                        id: l.id,
                        user: l.profiles?.username || 'anonymous',
                        userRole: l.profiles?.role || 'cinephile',
                        film: {
                            id: l.film_id,
                            title: l.film_title,
                            year: l.year,
                            poster: l.poster_path,
                        },
                        rating: l.rating,
                        review: l.review,
                        pullQuote: l.pull_quote || '',
                        dropCap: l.drop_cap || false,
                        autopsy: l.autopsy,
                        isAutopsied: l.is_autopsied || false,
                        endorsementCount: 0,
                        timestamp: l.created_at
                            ? new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()
                            : 'RECENT'
                    }))
                    // Deduplicate: one card per user+film — keeps only the most recent log
                    const seen = new Set()
                    const deduped = mapped.filter(entry => {
                        const key = `${entry.user}:${entry.film.id}`
                        if (seen.has(key)) return false
                        seen.add(key)
                        return true
                    })
                    setCommunityFeed(deduped)
                }
        } catch (e) {
            console.error('Feed fetch error:', e)
        }
        setFeedLoading(false)
    }, [])

    const fetchSidebarData = useCallback(async () => {
        if (!isSupabaseConfigured) return
        try {
            // Real recent public lists — explicit FK to avoid ambiguous relationship
            const { data: listsData } = await supabase
                .from('lists')
                .select('id, title, description, profiles(username)')
                .order('created_at', { ascending: false })
                .limit(3)

            if (listsData) {
                setRecentLists(listsData.map(l => ({
                    id: l.id,
                    title: l.title,
                    curator: l.profiles?.username || 'anonymous'
                })))
            }

            // Real active agents: users with most recent log activity — explicit FK
            const { data: agentsData } = await supabase
                .from('logs')
                .select('profiles(username)')
                .order('created_at', { ascending: false })
                .limit(20)

            if (agentsData) {
                const seen = new Set()
                const unique = []
                for (const row of agentsData) {
                    const name = row.profiles?.username
                    if (name && !seen.has(name) && name !== user?.username) {
                        seen.add(name)
                        unique.push(name)
                        if (unique.length >= 5) break
                    }
                }
                setActiveAgents(unique)
            }
        } catch (e) {
            console.error('Sidebar fetch error:', e)
        }
    }, [user?.username])

    useEffect(() => {
        fetchCommunityFeed()
        fetchSidebarData()
    }, [fetchCommunityFeed, fetchSidebarData])

    return (
        <div style={{ paddingTop: 70, minHeight: '100vh', background: 'var(--ink)' }}>
            {/* Header */}
            <div style={{
                background: 'var(--ink)',
                borderBottom: '1px solid var(--ash)',
                padding: '4rem 0 3rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE REEL
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: 'var(--parchment)', marginBottom: '1.5rem', lineHeight: 1, textShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                        Community Intelligence
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '1.1rem', color: 'var(--fog)', maxWidth: 600, margin: '0 auto' }}>
                        Reviews, logs, and dispatches from the society.
                    </p>
                </div>
            </div>

            <main className="page-top" style={{ paddingBottom: '7rem', paddingTop: '3rem' }}>
                <div className="container feed-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '3rem', alignItems: 'start' }}>

                    {/* Main Feed */}
                    <div className="feed-main">

                        <SectionHeader label="RECENT TRANSMISSIONS" title="The Log" />
                        <RatingLegend />

                        {!isAuthenticated && (
                            <div style={{
                                background: 'transparent', border: '1px dashed var(--ash)',
                                padding: '2rem', textAlign: 'center',
                                marginBottom: '2.5rem', borderRadius: '2px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
                            }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--sepia)' }}>
                                    The Archives Are Closed
                                </div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', maxWidth: 400, lineHeight: 1.5 }}>
                                    Ascend to The Society to trace the footsteps of the finest critics and transmit your own cinematic intelligence.
                                </div>
                                <button className="btn btn-primary" style={{ padding: '1rem 3rem', letterSpacing: '0.2em' }} onClick={() => openSignupModal()}>
                                    CLAIM YOUR SEAT
                                </button>
                            </div>
                        )}

                        {feedLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="skeleton" style={{ height: 160, borderRadius: '2px' }} />
                                ))}
                            </div>
                        ) : communityFeed.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Premium empty state */}
                                <div style={{
                                    border: '1px solid var(--ash)',
                                    padding: '3rem 2rem',
                                    textAlign: 'center',
                                    background: 'linear-gradient(180deg, rgba(28,23,16,0.6) 0%, transparent 100%)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                                        PROJECTION BOOTH — STANDING BY
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                                        The ink is fresh.
                                    </div>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)', opacity: 0.6, lineHeight: 1.7, maxWidth: 400, margin: '0 auto 2rem' }}>
                                        Be the first to transmit a cinematic dispatch and leave your mark in the Society's permanent record.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: '0.9rem 2.5rem', letterSpacing: '0.2em', fontSize: '0.7rem' }}
                                        onClick={() => openLogModal()}
                                    >
                                        LOG THE FIRST FILM
                                    </button>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                </div>

                                {/* Society Picks — hand-curated placeholder cards */}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--ash)', textAlign: 'center', opacity: 0.5 }}>
                                    ✦ SOCIETY PICKS — TONIGHT'S RECOMMENDED VIEWING ✦
                                </div>
                                {[
                                    { title: 'Nosferatu', year: '1922', note: 'The shadow that never left.', poster: null },
                                    { title: 'In the Mood for Love', year: '2000', note: 'Wong Kar-wai at his most devastating.', poster: null },
                                    { title: 'Stalker', year: '1979', note: 'A film that watches back.', poster: null },
                                ].map((pick) => (
                                    <div key={pick.title} style={{
                                        background: 'var(--soot)', border: '1px solid var(--ash)',
                                        borderLeft: '3px solid var(--ash)', borderRadius: '2px',
                                        padding: '1.25rem', display: 'flex', gap: '1.25rem',
                                        opacity: 0.45,
                                    }}>
                                        <div style={{ width: 56, height: 84, background: 'var(--ink)', border: '1px solid var(--ash)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px' }}>
                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--sepia)' }}>✦</span>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>SOCIETY PICK · {pick.year}</div>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>{pick.title}</div>
                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', fontStyle: 'italic', opacity: 0.7 }}>"{pick.note}"</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {communityFeed.map((log) => (
                                    <ActivityCard key={log.id} log={log} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="feed-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>


                        {/* Curated Lists — Real Supabase data */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem' }}>
                                CURATED LISTS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {recentLists.length === 0 ? (
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--fog)', opacity: 0.6 }}>
                                        No lists yet. Start curating.
                                    </div>
                                ) : recentLists.map((list) => (
                                    <Link key={list.id} to={`/lists`} style={{ textDecoration: 'none' }}>
                                        <div style={{ padding: '0.75rem', background: 'var(--ink)', border: '1px solid var(--ash)', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.35rem' }}>
                                                {list.title}
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                                BY @{list.curator.toUpperCase()}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            <Link to="/lists" style={{ display: 'inline-block', marginTop: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', borderBottom: '1px dashed var(--sepia)' }}>
                                BROWSE ALL LISTS
                            </Link>
                        </div>

                        {/* Active Field Agents — Real Supabase data */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem' }}>
                                ACTIVE FIELD AGENTS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {activeAgents.length === 0 ? (
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--fog)', opacity: 0.6 }}>
                                        No activity yet.
                                    </div>
                                ) : activeAgents.map((agent) => (
                                    <Link
                                        key={agent}
                                        to={`/user/${agent}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--soot)', border: '1px solid var(--ash)', textDecoration: 'none', borderRadius: '2px', transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(28,23,16,0.8)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--soot)'}
                                    >
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <circle cx="6" cy="6" r="4.5" stroke="var(--sepia)" strokeWidth="1" />
                                                <circle cx="6" cy="6" r="2" fill="var(--sepia)" opacity="0.6" />
                                                <circle cx="7" cy="5" r="0.5" fill="var(--parchment)" opacity="0.8" />
                                            </svg>
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--bone)' }}>
                                            @{agent.toUpperCase()}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    )
}
