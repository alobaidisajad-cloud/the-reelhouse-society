import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../../store'
import { ReelRating, RadarChart } from '../UI'
import { tmdb } from '../../tmdb'
import { Heart, MessageSquare, Download, Send, RefreshCw } from 'lucide-react'
import ReactionBar from '../ReactionBar'
import { supabase, isSupabaseConfigured } from '../../supabaseClient'
import toast from 'react-hot-toast'
import { throttleAction } from '../../errorLogger'
import AnnotationPanel from './AnnotationPanel'
import { DossierExportHTML } from './DossierExportHTML'

export default function ActivityCard({ log, isExpandedView = false }: { log: any, isExpandedView?: boolean }) {
    const navigate = useNavigate()
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

    return (
        <div
            className="fade-in-up"
            onClick={handleCardClick}
            style={{
                background: isExpandedView ? 'transparent' : 'var(--soot)',
                border: isExpandedView ? 'none' : '1px solid var(--ash)',
                borderRadius: '2px',
                padding: isExpandedView ? '0.5rem 0' : '1.25rem',
                position: 'relative',
                display: 'flex',
                gap: '1.25rem',
                borderLeft: isExpandedView ? 'none' : '3px solid var(--sepia)',
                cursor: isExpandedView ? 'default' : 'pointer',
            }}
        >
            {/* Timestamp */}
            <div style={{ position: 'absolute', top: '1rem', right: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                {log.timestamp || 'RECENT'}
            </div>

            {/* Poster */}
            <div
                style={{ width: 80, height: 120, flexShrink: 0, borderRadius: '2px', overflow: 'hidden', background: 'var(--ink)', border: '1px solid var(--ash)', position: 'relative', cursor: 'pointer' }}
            >
                {log.film?.poster ? (
                    <img
                        src={tmdb.poster(log.film.poster, 'w185')}
                        alt={log.film.title}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9, mixBlendMode: 'luminosity' }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0b09', borderRadius: '2px' }}>
                        <img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ width: '75%', height: 'auto', opacity: 0.9 }} />
                    </div>
                )}
                <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(139,105,20,0.1)', pointerEvents: 'none', zIndex: 10 }} />
                
                {/* ── SOCIETY STAMP OVERLAY ── */}
                {endorsed && (
                    <div className="society-stamp" style={{ '--stamp-rotation': stampRotation, position: 'absolute', bottom: '-15%', right: '-45%', zIndex: 20 } as React.CSSProperties}>
                        <svg className="stamp-svg" viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg" style={{ width: '110px' }}>
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

            {/* Content Body */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', paddingRight: '5.5rem', overflow: 'hidden' }}>
                    <Link to={`/user/${log.user}`} onClick={e => e.stopPropagation()} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        @{(log.user || 'anonymous').toUpperCase()}
                    </Link>
                    <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                        color: log.userRole === 'auteur' ? 'var(--sepia)' : 'var(--fog)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        — {(log.userRole || 'cinephile').toUpperCase()} {log.userRole === 'auteur' && '✦'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span
                        style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', textDecoration: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.5)', cursor: 'pointer' }}
                    >
                        {log.film?.title}
                    </span>
                    {log.film?.year && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            {log.film.year}
                        </span>
                    )}
                </div>

                {log.rating > 0 && (
                    <div style={{ display: 'block', marginBottom: '0.2rem', width: '100%', flexShrink: 0 }}>
                        <ReelRating value={log.rating} size="sm" />
                    </div>
                )}

                {/* Pull Quote */}
                {log.pullQuote && (
                    <div style={{
                        marginTop: '1rem', marginBottom: '1rem', paddingLeft: '1rem', borderLeft: '4px solid var(--sepia)',
                        fontFamily: 'var(--font-display)', fontSize: 'clamp(0.95rem, 4vw, 1.2rem)', color: 'var(--sepia)', fontStyle: 'italic',
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
                        {log.isSpoiler && !spoilersRevealed ? (
                            <div 
                                onClick={(e) => { e.stopPropagation(); setSpoilersRevealed(true); }}
                                style={{ 
                                    background: 'rgba(0,0,0,0.5)', border: '1px dashed rgba(139,105,20,0.2)',
                                    padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer',
                                    borderRadius: '2px', display: 'flex', flexDirection: 'column', 
                                    alignItems: 'center', gap: '0.4rem', transition: 'background 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
                            >
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                                    [ CLASSIFIED DOSSIER ]
                                </span>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic' }}>
                                    This transmission contains spoilers. Tap to decode.
                                </span>
                            </div>
                        ) : log.dropCap ? (
                            <>
                                <span style={{
                                    float: 'left', fontSize: 'clamp(2.2rem, 8vw, 3rem)', lineHeight: 'clamp(1.8rem, 6vw, 2.5rem)',
                                    padding: '0.2rem 0.5rem 0 0', fontFamily: 'var(--font-display)',
                                    color: 'var(--sepia)'
                                }}>
                                    {log.review.charAt(0)}
                                </span>
                                <span>{isExpanded ? log.review.slice(1) : (log.review.length > 300 ? log.review.slice(1, 300) + '… Read more' : log.review.slice(1))}</span>
                            </>
                        ) : (
                            <span>{isExpanded ? log.review : (log.review.length > 300 ? log.review.slice(0, 300) + '… Read more' : log.review)}</span>
                        )}
                    </div>
                )}

                {log.isAutopsied && log.autopsy && (
                    <RadarChart autopsy={log.autopsy} size={140} />
                )}

            {/* Social Interaction Bar */}
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: isExpandedView ? '1.5rem' : '1rem', width: '100%', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(139,105,20,0.2)', flexWrap: 'wrap', flexShrink: 0, position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                    <button onClick={handleEndorse} aria-label={endorsed ? 'Remove endorsement' : 'Endorse this log'} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: isExpandedView ? '0.75rem' : '0.55rem', letterSpacing: '0.15em', color: canEndorse ? (endorsed ? 'var(--sepia)' : 'var(--fog)') : 'var(--ash)', cursor: canEndorse ? 'pointer' : 'not-allowed', transition: 'color 0.2s' }} onMouseEnter={e => { if (canEndorse) e.currentTarget.style.color = 'var(--parchment)' }} onMouseLeave={e => { if (canEndorse) e.currentTarget.style.color = endorsed ? 'var(--sepia)' : 'var(--fog)' }}>
                        {canEndorse ? (
                            <Heart size={isExpandedView ? 16 : 12} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} />
                        ) : (
                            <span style={{ fontSize: isExpandedView ? '12px' : '10px' }}>🔒</span>
                        )}
                        {endorsed ? 'ENDORSED' : canEndorse ? 'ENDORSE' : 'RESTRICTED'} ({endorsementCount})
                    </button>
                </div>
                {canAnnotate ? (
                    <button
                        onClick={handleAnnotateToggle}
                        aria-label="Annotate this log"
                        style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: isExpandedView ? '0.75rem' : '0.55rem', letterSpacing: '0.15em', color: annotateOpen ? 'var(--parchment)' : 'var(--fog)', cursor: 'pointer', transition: 'color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'}
                        onMouseLeave={e => e.currentTarget.style.color = annotateOpen ? 'var(--parchment)' : 'var(--fog)'}
                    >
                        <MessageSquare size={isExpandedView ? 16 : 12} /> ANNOTATE
                    </button>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: isExpandedView ? '0.75rem' : '0.55rem', letterSpacing: '0.15em', color: 'var(--ash)', cursor: 'not-allowed' }}>
                        <span style={{ fontSize: isExpandedView ? '12px' : '10px' }}>🔒</span> RESTRICTED
                    </div>
                )}
                <button
                    onClick={handleRetransmit}
                    aria-label="Retransmit this log"
                    style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: isExpandedView ? '0.75rem' : '0.55rem', letterSpacing: '0.15em', color: retransmitted ? 'var(--sepia)' : 'var(--fog)', cursor: retransmitted ? 'default' : 'pointer', transition: 'color 0.2s', marginLeft: 'auto' }}
                    onMouseEnter={e => { if (!retransmitted) e.currentTarget.style.color = 'var(--sepia)' }}
                    onMouseLeave={e => { if (!retransmitted) e.currentTarget.style.color = 'var(--fog)' }}
                >
                    <RefreshCw size={isExpandedView ? 16 : 12} /> {retransmitted ? 'RETRANSMITTED ✦' : 'RE-TRANSMIT'}
                </button>
                {log.isAutopsied && log.autopsy && (
                    <button onClick={exportDossier} disabled={isExporting} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: isExpandedView ? '0.75rem' : '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', cursor: 'pointer', transition: 'color 0.2s', opacity: isExporting ? 0.5 : 1 }} onMouseEnter={e => e.currentTarget.style.color = 'var(--flicker)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--sepia)'}>
                        <Download size={isExpandedView ? 16 : 12} /> {isExporting ? 'ENCODING...' : 'TRANSMIT DOSSIER'}
                    </button>
                )}
                </div>

            {/* ── ANNOTATION PANEL ── */}
            <AnnotationPanel logId={log.id} open={annotateOpen} isExpandedView={!!isExpandedView} />

                {log.isAutopsied && log.autopsy && (
                    <DossierExportHTML ref={dossierRef} log={log} isExporting={isExporting} />
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
