import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../../store'
import { ReelRating, RadarChart } from '../UI'
import { tmdb } from '../../tmdb'
import { Heart, MessageSquare, Download, Send, RefreshCw, Lock, Edit3 } from 'lucide-react'
import ReactionBar from '../ReactionBar'
import { supabase, isSupabaseConfigured } from '../../supabaseClient'
import toast from 'react-hot-toast'
import { throttleAction } from '../../errorLogger'
import AnnotationPanel from './AnnotationPanel'
import { DossierExportHTML } from './DossierExportHTML'

import { useViewport } from '../../hooks/useViewport'

export default function ActivityCard({ log, isExpandedView = false }: { log: any, isExpandedView?: boolean }) {
    const { isTouch: IS_TOUCH } = useViewport()
    const navigate = useNavigate()
    const { openLogModal } = useUIStore()
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
        if (!canEndorse) return toast.error('This dossier is locked to followers only ✦')
        throttleAction(`endorse-${log.id}`, () => {
            // Optimistic update
            setOptimisticEndorsed(!optimisticEndorsed)
            setEndorsementCount((p: number) => optimisticEndorsed ? Math.max(0, p - 1) : p + 1)
            // Background sync (rollback handled in store)
            toggleEndorse(log.id)
        })
    }

    const [isExporting, setIsExporting] = useState(false)
    const dossierRef = useRef<HTMLDivElement>(null)

    // ── ANNOTATE ──
    const [annotateOpen, setAnnotateOpen] = useState(isExpandedView)
    const { user: currentUser } = useAuthStore()

    // ── SPOILER GUARD & EXPANSION ──
    const [spoilersRevealed, setSpoilersRevealed] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const showFullText = isExpandedView || isExpanded

    // ── PRIVACY ENFORCEMENT ──
    const privacyEndorsements = log.privacyEndorsements || 'everyone'
    const privacyAnnotations = log.privacyAnnotations || 'everyone'
    const isOwner = currentUser?.username === log.user
    const isFollowing = currentUser?.following?.includes(log.user)
    
    const canEndorse = isOwner || privacyEndorsements === 'everyone' || (privacyEndorsements === 'followers' && isFollowing) || log.user === 'anonymous'
    const canAnnotate = isOwner || privacyAnnotations === 'everyone' || (privacyAnnotations === 'followers' && isFollowing) || log.user === 'anonymous'

    const handleAnnotateToggle = () => {
        if (!canAnnotate) return toast.error('This dossier is locked to followers only ✦')
        if (!isExpandedView) {
            navigate(`/log/${log.id}`) // Take them to detail page instead of opening inline on feed
        } else {
            setAnnotateOpen(!annotateOpen)
        }
    }

    // ── RE-TRANSMIT ──
    const [retransmitted, setRetransmitted] = useState(false)

    const handleRetransmit = () => {
        if (!currentUser) { toast.error('Sign in to retransmit.'); return }
        if (retransmitted) return
        throttleAction(`retransmit-${log.id}`, async () => {
            // Optimistic update
            setRetransmitted(true)
            toast.success('Signal retransmitted to your archive.')

            // Background sync — rollback on failure
            if (isSupabaseConfigured) {
                try {
                    const { error } = await supabase.from('interactions').insert({
                        user_id: currentUser.id,
                        target_log_id: log.id,
                        type: 'retransmit',
                    })
                    if (error && !error.message?.includes('duplicate')) throw error
                } catch {
                    setRetransmitted(false)
                    toast.error('Retransmit failed — please try again.')
                }
            }
        })
    }

    const endorsed = optimisticEndorsed

    // ── Navigation routing ──
    const handleCardClick = () => {
        if (!isExpandedView) {
            navigate(`/log/${log.id}`)
        }
    }

    const exportDossier = async () => {
        if (!dossierRef.current) return
        setIsExporting(true)
        try {
            // Give React a tick to display the hidden dossier offscreen
            await new Promise(resolve => setTimeout(resolve, 50))

            const { default: html2canvas } = await import('html2canvas')
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

    // ── EXPANDED FOCUS VIEW (CINEMATIC LAYOUT) ──
    if (isExpandedView) {
        return (
            <div className="fade-in-up" onClick={e => e.stopPropagation()} style={{ padding: '0.5rem 0 3rem 0', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Focus Header: User Identity & Time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Link to={`/user/${log.user}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--sepia)', textDecoration: 'none', textTransform: 'uppercase' }}>
                            @{log.user || 'anonymous'}
                        </Link>
                        {log.userRole === 'auteur' && <span style={{ color: 'var(--sepia)', fontSize: '0.8rem' }}>✦</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                        {log.timestamp || 'RECENT'}
                    </div>
                </div>

                {/* Focus Poster & Watermark Stamp */}
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 140, height: 210, borderRadius: '2px', overflow: 'hidden', border: '1px solid rgba(139,105,20,0.3)', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
                        {log.film?.poster ? (
                            <img src={tmdb.poster(log.film.poster, 'w185')} alt={log.film.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', background: '#0d0b09', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ width: '60%', opacity: 0.8 }} />
                            </div>
                        )}
                        <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(139,105,20,0.1)', pointerEvents: 'none' }} />
                    </div>

                    {/* Watermark Stamp directly overlapping bottom-right safely (No text overlap) */}
                    {endorsed && (
                        <div className="society-stamp" style={{ '--stamp-rotation': stampRotation, position: 'absolute', bottom: '-20px', right: '50%', transform: 'translateX(90px)', zIndex: 10, pointerEvents: 'none' } as React.CSSProperties}>
                            <svg className="stamp-svg" viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg" style={{ width: '140px', opacity: 0.15, mixBlendMode: 'screen', filter: 'none' }}>
                                <g transform="rotate(-2 150 60)">
                                    <rect x="5" y="5" width="290" height="110" rx="4" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="30 4 12 3 50 6" opacity="0.8" />
                                    <rect x="12" y="12" width="276" height="96" rx="2" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="10 2 20 4" opacity="0.6" />
                                    <text x="150" y="55" fontFamily="var(--font-display-alt), 'Bungee Shade', sans-serif" fontSize="38" textAnchor="middle" fill="currentColor" letterSpacing="2" opacity="0.9" style={{ textTransform: 'uppercase' }}>REVIEWED</text>
                                    <text x="150" y="90" fontFamily="var(--font-ui), monospace" fontSize="16" textAnchor="middle" fill="currentColor" letterSpacing="4" opacity="0.7">THE SOCIETY</text>
                                    <path d="M20 20 Q50 30 40 50 M260 90 Q240 80 270 60" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
                                    <circle cx="270" cy="30" r="3" fill="currentColor" opacity="0.5" />
                                    <circle cx="40" cy="90" r="2" fill="currentColor" opacity="0.3" />
                                </g>
                            </svg>
                        </div>
                    )}
                </div>

                {/* Focus Title & Rating */}
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 8vw, 2.75rem)', color: 'var(--parchment)', lineHeight: 1.1, margin: 0, textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                            {log.film?.title}
                        </h1>
                        {log.film?.year && (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.3em', color: 'var(--fog)', marginTop: '0.5rem' }}>
                                {log.film.year}
                            </div>
                        )}
                    </div>
                    {log.rating > 0 && <ReelRating value={log.rating} size="lg" />}
                </div>

                {/* Focus Pull Quote */}
                {log.pullQuote && (
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.2rem, 5vw, 1.6rem)', color: 'var(--sepia)', fontStyle: 'italic', textAlign: 'center', padding: '0 1.5rem', lineHeight: 1.3 }}>
                        "{log.pullQuote}"
                    </div>
                )}

                {/* Focus Review Body */}
                {log.review && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '1.05rem', color: 'var(--bone)', lineHeight: 1.7, padding: '0 0.5rem' }}>
                        {log.isSpoiler && !spoilersRevealed ? (
                            <div 
                                onClick={(e) => { e.stopPropagation(); setSpoilersRevealed(true); }}
                                style={{ background: 'rgba(0,0,0,0.5)', border: '1px dashed rgba(139,105,20,0.3)', padding: '3rem 1rem', textAlign: 'center', cursor: 'pointer', borderRadius: '2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', transition: 'background 0.2s' }}
                            >
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>[ CLASSIFIED DOSSIER ]</span>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', fontStyle: 'italic' }}>This transmission contains spoilers. Tap to decode.</span>
                            </div>
                        ) : log.dropCap ? (
                            <>
                                <span style={{ float: 'left', fontSize: '4rem', lineHeight: '3.5rem', padding: '0.4rem 0.6rem 0 0', fontFamily: 'var(--font-display)', color: 'var(--sepia)' }}>
                                    {log.review.charAt(0)}
                                </span>
                                <span>{log.review.slice(1)}</span>
                            </>
                        ) : (
                            <span>{log.review}</span>
                        )}
                    </div>
                )}

                {log.isAutopsied && log.autopsy && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                        <RadarChart autopsy={log.autopsy} size={180} />
                    </div>
                )}

                {/* Focus Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(139,105,20,0.15)', borderBottom: '1px solid rgba(139,105,20,0.15)', padding: '1.25rem 0.5rem', marginTop: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <button onClick={handleEndorse} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: canEndorse ? (endorsed ? 'var(--sepia)' : 'var(--fog)') : 'var(--ash)', cursor: canEndorse ? 'pointer' : 'not-allowed' }}>
                            {canEndorse ? <Heart size={16} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} /> : <span><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>}
                            {endorsed ? 'CERTIFIED' : canEndorse ? 'CERTIFY' : 'RESTRICTED'} ({endorsementCount})
                        </button>
                        {canAnnotate ? (
                            <button onClick={handleAnnotateToggle} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: annotateOpen ? 'var(--parchment)' : 'var(--fog)', cursor: 'pointer' }}>
                                <MessageSquare size={16} /> CRITIQUE
                            </button>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--ash)', cursor: 'not-allowed' }}>
                                <span><Lock size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></span> RESTRICTED
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {isOwner && (
                            <button onClick={(e) => { e.stopPropagation(); openLogModal({ id: log.film?.id || log.filmId, title: log.film?.title, poster_path: log.film?.poster, release_date: log.film?.year + '-01-01' }, log.id) }} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--fog)', cursor: 'pointer' }}>
                                <Edit3 size={14} /> EDIT
                            </button>
                        )}
                        <button onClick={handleRetransmit} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: retransmitted ? 'var(--sepia)' : 'var(--fog)', cursor: retransmitted ? 'default' : 'pointer' }}>
                            <RefreshCw size={16} /> {retransmitted ? 'PUBLISHED ✦' : 'PUBLISH'}
                        </button>
                    </div>
                </div>

                <AnnotationPanel logId={log.id} open={annotateOpen} isExpandedView={true} />

                {log.isAutopsied && log.autopsy && (
                    <div style={{ padding: '0 0.5rem' }}>
                        <button onClick={exportDossier} disabled={isExporting} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--sepia)', cursor: 'pointer', opacity: isExporting ? 0.5 : 1 }}>
                            <Download size={16} /> {isExporting ? 'ENCODING...' : 'TRANSMIT HYPER-DOSSIER'}
                        </button>
                    </div>
                )}
                
                {log.isAutopsied && log.autopsy && <DossierExportHTML ref={dossierRef} log={log} isExporting={isExporting} />}
                
                <div style={{ marginTop: '0.5rem' }}>
                    <ReactionBar logId={log.id} logAuthor={log.user} filmTitle={log.film?.title} />
                </div>
            </div>
        )
    }

    // ── STANDARD FEED VIEW (INLINE LAYOUT) — "THE UNDERGROUND" ──
    return (
        <div
            className="reel-dispatch"
            onClick={handleCardClick}
            style={{
                padding: IS_TOUCH ? '1rem' : '1.25rem',
                display: 'flex',
                gap: IS_TOUCH ? '1rem' : '1.25rem',
            }}
        >
            {/* Poster with Ambient Echo */}
            <div className="reel-poster-wrap" style={{ width: IS_TOUCH ? 100 : 100, height: IS_TOUCH ? 150 : 150 }}>
                {/* Ambient glow — blurred poster echo behind */}
                {log.film?.poster && (
                    <img
                        src={tmdb.poster(log.film.poster, 'w92')}
                        alt=""
                        aria-hidden="true"
                        className="reel-poster-glow"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                )}
                <div className="reel-poster-frame scanlines" style={{ width: '100%', height: '100%' }}>
                    {log.film?.poster ? (
                        <img src={tmdb.poster(log.film.poster, 'w185')} alt={log.film.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.12) contrast(1.05)' }} />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0b09' }}><img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ width: '60%', opacity: 0.7 }} /></div>
                    )}
                    
                    {/* ── SOCIETY STAMP OVERLAY (FEED) ── */}
                    {endorsed && (
                        <div className="society-stamp" style={{ '--stamp-rotation': stampRotation, position: 'absolute', bottom: '-15%', right: '-35%', zIndex: 20 } as React.CSSProperties}>
                            <svg className="stamp-svg" viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg" style={{ width: '90px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                                <g transform="rotate(-2 150 60)">
                                    <rect x="5" y="5" width="290" height="110" rx="4" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="30 4 12 3 50 6" opacity="0.8" />
                                    <rect x="12" y="12" width="276" height="96" rx="2" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="10 2 20 4" opacity="0.6" />
                                    <text x="150" y="55" fontFamily="var(--font-display-alt), 'Bungee Shade', sans-serif" fontSize="38" textAnchor="middle" fill="currentColor" letterSpacing="2" opacity="0.9" style={{ textTransform: 'uppercase' }}>REVIEWED</text>
                                    <text x="150" y="90" fontFamily="var(--font-ui), monospace" fontSize="16" textAnchor="middle" fill="currentColor" letterSpacing="4" opacity="0.7">THE SOCIETY</text>
                                    <path d="M20 20 Q50 30 40 50 M260 90 Q240 80 270 60" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
                                    <circle cx="270" cy="30" r="3" fill="currentColor" opacity="0.5" />
                                    <circle cx="40" cy="90" r="2" fill="currentColor" opacity="0.3" />
                                </g>
                            </svg>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {/* User + timestamp row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                        <Link to={`/user/${log.user}`} onClick={e => e.stopPropagation()} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'text-shadow 0.2s' }} onMouseEnter={e => e.currentTarget.style.textShadow = '0 0 8px rgba(139,105,20,0.4)'} onMouseLeave={e => e.currentTarget.style.textShadow = 'none'}>
                            @{(log.user || 'anonymous').toUpperCase()}
                        </Link>
                        {log.userRole === 'auteur' && <span className="reel-auteur-badge">✦ AUTEUR</span>}
                    </div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', whiteSpace: 'nowrap', flexShrink: 0, opacity: 0.7 }}>
                        {log.timestamp || 'RECENT'}
                    </span>
                </div>

                {/* Title + Year */}
                <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.2rem' : '1.4rem', color: 'var(--parchment)', lineHeight: 1.15 }}>
                        {log.film?.title}
                    </span>
                    {log.film?.year && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', marginLeft: '0.6rem' }}>{log.film.year}</span>}
                </div>

                {/* Rating */}
                {log.rating > 0 && <div style={{ marginBottom: '0.5rem' }}><ReelRating value={log.rating} size="sm" /></div>}

                {/* Pull Quote — with French quotation marks */}
                {log.pullQuote && (
                    <div className="reel-pull-quote" style={{ marginTop: '0.5rem', marginBottom: '0.5rem', fontSize: IS_TOUCH ? '0.95rem' : '1.1rem' }}>
                        {log.pullQuote}
                    </div>
                )}

                {/* Review */}
                {log.review && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: IS_TOUCH ? '0.8rem' : '0.85rem', color: 'var(--bone)', marginTop: '0.4rem', lineHeight: 1.65, opacity: 0.85 }}>
                        {log.isSpoiler && !spoilersRevealed ? (
                            <div onClick={(e) => { e.stopPropagation(); setSpoilersRevealed(true); }} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(139,105,20,0.15)', padding: '1rem', textAlign: 'center', cursor: 'pointer', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>[ CLASSIFIED ]</span>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic' }}>Tap to decode spoilers.</span>
                            </div>
                        ) : log.dropCap ? (
                            <><span style={{ float: 'left', fontSize: IS_TOUCH ? '2rem' : '2.5rem', lineHeight: IS_TOUCH ? '1.8rem' : '2.2rem', padding: '0.15rem 0.4rem 0 0', fontFamily: 'var(--font-display)', color: 'var(--sepia)', textShadow: '0 2px 8px rgba(139,105,20,0.2)' }}>{log.review.charAt(0)}</span><span>{showFullText ? log.review.slice(1) : (log.review.length > 300 ? log.review.slice(1, 300) : log.review.slice(1))}</span>{!showFullText && log.review.length > 300 && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginLeft: '0.3rem', opacity: 0.7 }}>… DECODE FULL DISPATCH →</span>}</>
                        ) : (
                            <><span>{showFullText ? log.review : (log.review.length > 300 ? log.review.slice(0, 300) : log.review)}</span>{!showFullText && log.review.length > 300 && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginLeft: '0.3rem', opacity: 0.7 }}>… DECODE FULL DISPATCH →</span>}</>
                        )}
                    </div>
                )}

                {log.isAutopsied && log.autopsy && <RadarChart autopsy={log.autopsy} size={130} />}

                {/* Feed Action Bar */}
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '1rem', width: '100%', marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(139,105,20,0.1)', flexWrap: 'wrap', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <button className="reel-action-btn" onClick={handleEndorse} style={{ color: canEndorse ? (endorsed ? 'var(--sepia)' : 'var(--fog)') : 'var(--ash)', cursor: canEndorse ? 'pointer' : 'not-allowed' }}>
                            {canEndorse ? <Heart size={12} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} /> : <span style={{ fontSize: '10px' }}><Lock size={9} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>}
                            {endorsed ? 'CERTIFIED' : canEndorse ? 'CERTIFY' : 'LOCKED'} ({endorsementCount})
                        </button>
                    </div>
                    {canAnnotate ? (
                        <button className="reel-action-btn" onClick={handleAnnotateToggle} style={{ color: annotateOpen ? 'var(--parchment)' : 'var(--fog)' }}>
                            <MessageSquare size={12} /> CRITIQUE
                        </button>
                    ) : (
                        <div className="reel-action-btn" style={{ color: 'var(--ash)', cursor: 'not-allowed' }}>
                            <span style={{ fontSize: '9px' }}><Lock size={9} style={{ display: "inline-block", verticalAlign: "middle" }} /></span> LOCKED
                        </div>
                    )}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {isOwner && (
                            <button className="reel-action-btn" onClick={(e) => { e.stopPropagation(); openLogModal({ id: log.film?.id || log.filmId, title: log.film?.title, poster_path: log.film?.poster, release_date: log.film?.year + '-01-01' }, log.id) }} style={{ color: 'var(--fog)' }}>
                                <Edit3 size={12} /> EDIT
                            </button>
                        )}
                        <button className="reel-action-btn" onClick={handleRetransmit} style={{ color: retransmitted ? 'var(--sepia)' : 'var(--fog)', cursor: retransmitted ? 'default' : 'pointer' }}>
                            <RefreshCw size={12} /> {retransmitted ? 'SENT ✦' : 'PUBLISH'}
                        </button>
                    </div>
                </div>

                {annotateOpen && <AnnotationPanel logId={log.id} open={annotateOpen} />}
                
                {log.isAutopsied && log.autopsy && isExporting && <DossierExportHTML ref={dossierRef} log={log} isExporting={isExporting} />}
                
                {/* 
                  * Note: ReactionBar is entirely removed from the Feed layout. 
                  * Emoji fetching 50x was blocking the main thread. It remains exclusively in Focus Views. 
                  */}
            </div>
        </div>
    )
}
