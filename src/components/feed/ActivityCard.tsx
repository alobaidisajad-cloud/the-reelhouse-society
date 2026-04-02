import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../../store'
import { ReelRating, RadarChart } from '../UI'
import { tmdb } from '../../tmdb'
import { Heart, MessageSquare, Download, Send, RefreshCw, Lock, Edit3, MessageCircle, Bookmark } from 'lucide-react'
import ReactionBar from '../ReactionBar'
import { supabase, isSupabaseConfigured } from '../../supabaseClient'
import reelToast from '../../utils/reelToast'
import { throttleAction } from '../../errorLogger'
import AnnotationPanel from './AnnotationPanel'
import { DossierExportHTML } from './DossierExportHTML'
import ShareToLoungeModal from '../ShareToLoungeModal'


import { useViewport } from '../../hooks/useViewport'

export default function ActivityCard({ log, isExpandedView = false }: { log: any, isExpandedView?: boolean }) {
    const { isTouch: IS_TOUCH, isMobile } = useViewport()
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
        if (!canEndorse) return reelToast.error('This dossier is locked to followers only ✦')
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
    const [showShareLounge, setShowShareLounge] = useState(false)
    const isLoungeEligible = currentUser && ['archivist', 'auteur'].includes((currentUser as any).role)

    // ── SPOILER GUARD & EXPANSION ──
    const [spoilersRevealed, setSpoilersRevealed] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [autopsyOpen, setAutopsyOpen] = useState(false)
    const showFullText = isExpandedView || isExpanded

    // ── WATCHLIST QUICK SAVE ──
    const watchlist = useFilmStore(state => state.watchlist)
    const addToWatchlist = useFilmStore(state => state.addToWatchlist)
    const removeFromWatchlist = useFilmStore(state => state.removeFromWatchlist)
    const filmSaved = watchlist.some((w: any) => w.filmId === (log.film?.id || log.filmId))

    // ── PRIVACY ENFORCEMENT ──
    const privacyEndorsements = log.privacyEndorsements || 'everyone'
    const privacyAnnotations = log.privacyAnnotations || 'everyone'
    const isOwner = currentUser?.username === log.user
    const isFollowing = currentUser?.following?.includes(log.user)
    
    const canEndorse = isOwner || privacyEndorsements === 'everyone' || (privacyEndorsements === 'followers' && isFollowing) || log.user === 'anonymous'
    const canAnnotate = isOwner || privacyAnnotations === 'everyone' || (privacyAnnotations === 'followers' && isFollowing) || log.user === 'anonymous'

    const handleAnnotateToggle = () => {
        if (!canAnnotate) return reelToast.error('This dossier is locked to followers only ✦')
        if (!isExpandedView) {
            navigate(`/log/${log.id}`) // Take them to detail page instead of opening inline on feed
        } else {
            setAnnotateOpen(!annotateOpen)
        }
    }

    // ── RE-TRANSMIT ──
    const [retransmitted, setRetransmitted] = useState(false)

    const handleRetransmit = () => {
        if (!currentUser) { reelToast.error('Sign in to retransmit.'); return }
        if (retransmitted) return
        throttleAction(`retransmit-${log.id}`, async () => {
            // Optimistic update
            setRetransmitted(true)
            reelToast.success('Signal retransmitted to your archive.')

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
                    reelToast.error('Retransmit failed — please try again.')
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

    // ── Premium Tier Detection (shared by both views) ──
    const isAuteurLog = log.userRole === 'auteur'
    const isArchivistLog = log.userRole === 'archivist'
    const hasEditorialFeatures = !!(log.editorialHeader || log.dropCap || log.pullQuote)
    const isPremiumLog = isArchivistLog || isAuteurLog || hasEditorialFeatures

    // ── EXPANDED FOCUS VIEW (CINEMATIC LAYOUT) ──
    if (isExpandedView) {
        return (
            <div className="fade-in-up" onClick={e => e.stopPropagation()} style={{ padding: '0.5rem 0 3rem 0', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* ── CINEMATIC HERO (Archivist Editorial) ── */}
                {log.editorialHeader ? (
                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                        {/* Full-bleed editorial backdrop */}
                        <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
                            <div style={{ position: 'relative', width: '100%', paddingBottom: '50%', minHeight: 280 }}>
                                <img
                                    src={tmdb.backdrop(log.editorialHeader, 'w1280')}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', filter: 'sepia(0.08) contrast(1.1) brightness(0.55)' }}
                                />
                                {/* Deep cinematic vignette — fades seamlessly into page background */}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,10,8,0.2) 0%, transparent 20%, transparent 40%, rgba(11,10,8,0.95) 85%, rgba(11,10,8,1) 100%)' }} />
                                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center 30%, transparent 30%, rgba(11,10,8,0.55) 100%)' }} />
                                {/* Film grain */}
                                <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)', pointerEvents: 'none' }} />

                                {/* Editorial badge — floats in the header */}
                                <div style={{ position: 'absolute', top: '1rem', left: '1rem', fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.3em', color: 'rgba(218,165,32,0.85)', background: 'rgba(11,10,8,0.5)', backdropFilter: 'blur(8px)', padding: '0.35rem 0.7rem', borderRadius: '2px', border: '1px solid rgba(196,150,26,0.2)' }}>
                                    ✦ EDITORIAL
                                </div>

                                {/* User identity — sits inside the header at the bottom */}
                                <div style={{ position: 'absolute', bottom: '4.5rem', left: '1rem', right: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Link to={`/user/${log.user}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.15em', color: 'rgba(232,223,200,0.9)', textDecoration: 'none', textTransform: 'uppercase', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                                            @{log.user || 'anonymous'}
                                        </Link>
                                        {log.userRole === 'archivist' && <span className="reel-archivist-badge" style={{ fontSize: '0.4rem', padding: '0.1rem 0.5rem' }}>✦ ARCHIVIST</span>}
                                        {log.userRole === 'auteur' && <span className="reel-auteur-badge" style={{ fontSize: '0.4rem', padding: '0.1rem 0.5rem' }}>★ AUTEUR</span>}

                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'rgba(232,223,200,0.5)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                                        {log.timestamp || 'RECENT'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Poster emerging from the darkness — overlaps the header bottom */}
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: '-3.5rem', zIndex: 3 }}>
                            {/* Warm projector light behind the poster */}
                            {log.film?.poster && (
                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 220, height: 300, background: 'radial-gradient(ellipse, rgba(139,105,20,0.15) 0%, rgba(139,105,20,0.05) 40%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
                            )}
                            <Link to={`/film/${log.film?.id}`} onClick={e => e.stopPropagation()} style={{ display: 'block', width: 140, height: 210, borderRadius: '3px', overflow: 'hidden', border: '1px solid rgba(196,150,26,0.3)', position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.9), 0 0 40px rgba(139,105,20,0.08), 0 0 0 1px rgba(196,150,26,0.1)', cursor: 'pointer', transition: 'transform 0.3s, box-shadow 0.3s', zIndex: 1 }} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 28px 70px rgba(0,0,0,0.95), 0 0 50px rgba(139,105,20,0.12)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 24px 60px rgba(0,0,0,0.9), 0 0 40px rgba(139,105,20,0.08), 0 0 0 1px rgba(196,150,26,0.1)' }}>
                                {log.film?.poster ? (
                                    <img src={tmdb.poster(log.film.poster, 'w342')} alt={log.film.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', background: '#0d0b09', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ width: '60%', opacity: 0.8 }} /></div>
                                )}
                            </Link>

                            {/* Watermark Stamp */}
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
                    </div>
                ) : (
                    <>
                    {/* Non-editorial: standard user row + poster */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Link to={`/user/${log.user}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--sepia)', textDecoration: 'none', textTransform: 'uppercase' }}>
                                @{log.user || 'anonymous'}
                            </Link>
                            {log.userRole === 'archivist' && <span className="reel-archivist-badge" style={{ fontSize: '0.4rem', padding: '0.1rem 0.5rem' }}>✦ ARCHIVIST</span>}
                            {log.userRole === 'auteur' && <span className="reel-auteur-badge" style={{ fontSize: '0.4rem', padding: '0.1rem 0.5rem' }}>★ AUTEUR</span>}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                            {log.timestamp || 'RECENT'}
                        </div>
                    </div>

                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                        {isPremiumLog && log.film?.poster && (
                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 180, height: 250, background: isAuteurLog ? 'radial-gradient(ellipse, rgba(125,31,31,0.12) 0%, transparent 70%)' : 'radial-gradient(ellipse, rgba(139,105,20,0.12) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
                        )}
                        <Link to={`/film/${log.film?.id}`} onClick={e => e.stopPropagation()} style={{ display: 'block', width: 140, height: 210, borderRadius: '2px', overflow: 'hidden', border: isAuteurLog ? '1px solid rgba(180,45,45,0.35)' : isPremiumLog ? '1px solid rgba(196,150,26,0.35)' : '1px solid rgba(139,105,20,0.3)', position: 'relative', boxShadow: isAuteurLog ? '0 20px 40px rgba(0,0,0,0.8), 0 0 30px rgba(125,31,31,0.1)' : isPremiumLog ? '0 20px 40px rgba(0,0,0,0.8), 0 0 30px rgba(139,105,20,0.1)' : '0 20px 40px rgba(0,0,0,0.8)', cursor: 'pointer', transition: 'transform 0.3s, box-shadow 0.3s', zIndex: 1 }} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 24px 48px rgba(0,0,0,0.9)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.8)' }}>
                            {log.film?.poster ? (
                                <img src={tmdb.poster(log.film.poster, 'w185')} alt={log.film.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: '#0d0b09', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ width: '60%', opacity: 0.8 }} /></div>
                            )}
                            <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(139,105,20,0.1)', pointerEvents: 'none' }} />
                        </Link>

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
                    </>
                )}

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

                {/* Focus Pull Quote — Magazine Presentation */}
                {log.pullQuote && (
                    <div style={{ padding: '1.5rem 1.5rem', position: 'relative', textAlign: 'center' }}>
                        {/* Ornamental divider top */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ flex: 1, maxWidth: 80, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.4))' }} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.3em', color: 'var(--sepia)', opacity: 0.7 }}>✦</span>
                            <div style={{ flex: 1, maxWidth: 80, height: '1px', background: 'linear-gradient(90deg, rgba(139,105,20,0.4), transparent)' }} />
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.2rem, 5vw, 1.6rem)', color: 'var(--sepia)', fontStyle: 'italic', lineHeight: 1.35, textShadow: '0 2px 12px rgba(139,105,20,0.15)' }}>
                            « {log.pullQuote} »
                        </div>
                        {/* Ornamental divider bottom */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                            <div style={{ flex: 1, maxWidth: 80, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.4))' }} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.3em', color: 'var(--sepia)', opacity: 0.7 }}>✦</span>
                            <div style={{ flex: 1, maxWidth: 80, height: '1px', background: 'linear-gradient(90deg, rgba(139,105,20,0.4), transparent)' }} />
                        </div>
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
                    <div style={{ marginTop: '1rem' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setAutopsyOpen(!autopsyOpen) }}
                            style={{
                                width: '100%', background: 'linear-gradient(135deg, rgba(11,10,8,0.95) 0%, rgba(25,20,12,0.95) 100%)',
                                border: '1px solid rgba(139,105,20,0.25)', borderRadius: '4px',
                                padding: '0.75rem 1rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                transition: 'border-color 0.3s, background 0.3s',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: 'var(--sepia)',
                                    boxShadow: '0 0 8px rgba(139,105,20,0.6)',
                                    animation: autopsyOpen ? 'none' : 'pulse 2s ease-in-out infinite',
                                }} />
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--parchment)' }}>THE AUTOPSY</span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em', color: 'var(--sepia)', opacity: 0.6 }}>CONFIDENTIAL</span>
                            </div>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)', transition: 'transform 0.3s', transform: autopsyOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                        </button>
                        {autopsyOpen && (
                            <div style={{ overflow: 'hidden', animation: 'fadeSlideIn 0.3s ease-out', marginTop: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                                <RadarChart autopsy={log.autopsy} size={180} />
                            </div>
                        )}
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
                        {isLoungeEligible && (
                            <button onClick={(e) => { e.stopPropagation(); setShowShareLounge(true) }} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--fog)', cursor: 'pointer' }}>
                                <MessageCircle size={16} /> LOUNGE
                            </button>
                        )}
                    </div>
                </div>

                <AnnotationPanel logId={log.id} open={annotateOpen} isExpandedView={true} />

                {log.isAutopsied && log.autopsy && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <RadarChart autopsy={log.autopsy} size={260} />
                        
                        <div style={{ padding: '0 1rem 1rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={exportDossier} disabled={isExporting} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--sepia)', cursor: 'pointer', opacity: isExporting ? 0.5 : 1 }}>
                                <Download size={14} /> {isExporting ? 'ENCODING...' : 'TRANSMIT HYPER-DOSSIER'}
                            </button>
                        </div>
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
            className={`reel-dispatch${isArchivistLog ? ' reel-dispatch--premium' : isAuteurLog ? ' reel-dispatch--auteur' : ''}`}
            onClick={handleCardClick}
            style={{
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* ── EDITORIAL HEADER STRIP (Feed — Archivist Feature) ── */}
            {log.editorialHeader ? (
                <div style={{ position: 'relative', width: '100%', height: IS_TOUCH ? 120 : 160, overflow: 'hidden' }}>
                    <img
                        src={tmdb.backdrop(log.editorialHeader, 'w780')}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', filter: 'sepia(0.12) contrast(1.08) brightness(0.6)' }}
                    />
                    {/* Cinematic vignette layers */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,10,8,0.25) 0%, transparent 40%, rgba(11,10,8,0.9) 100%)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(11,10,8,0.4) 100%)' }} />
                    {/* Golden bottom border accent */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(196,150,26,0.4), transparent)' }} />
                    {/* Editorial badge */}
                    <div style={{ position: 'absolute', top: '0.6rem', right: '0.6rem', fontFamily: 'var(--font-ui)', fontSize: '0.35rem', letterSpacing: '0.25em', color: 'rgba(218,165,32,0.9)', background: 'rgba(11,10,8,0.6)', backdropFilter: 'blur(6px)', padding: '0.25rem 0.5rem', borderRadius: '2px', border: '1px solid rgba(196,150,26,0.25)' }}>
                        ✦ EDITORIAL
                    </div>
                </div>
            ) : isPremiumLog && log.film?.poster ? (
                /* Atmospheric blurred poster backdrop for archivist cards without editorial header */
                <div style={{ position: 'relative', width: '100%', height: IS_TOUCH ? 60 : 70, overflow: 'hidden' }}>
                    <img
                        src={tmdb.poster(log.film.poster, 'w342')}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', filter: 'blur(18px) sepia(0.25) brightness(0.3) saturate(0.7)', transform: 'scale(1.3)' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,10,8,0.3) 0%, rgba(11,10,8,0.95) 100%)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(196,150,26,0.2), transparent)' }} />
                </div>
            ) : null}
            <div className="reel-feed-card-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'row', gap: '1.25rem', alignItems: 'flex-start' }}>
            {/* Poster with Ambient Echo */}
            <Link to={`/film/${log.film?.id}`} onClick={e => e.stopPropagation()} className="reel-poster-wrap reel-feed-poster" style={{ width: 100, height: 150, display: 'block', textDecoration: 'none', cursor: 'pointer', flexShrink: 0 }}>
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
            </Link>

            {/* Content Body */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
                {/* User + timestamp row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                        <Link to={`/user/${log.user}`} onClick={e => e.stopPropagation()} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'text-shadow 0.2s' }} onMouseEnter={e => e.currentTarget.style.textShadow = '0 0 8px rgba(139,105,20,0.4)'} onMouseLeave={e => e.currentTarget.style.textShadow = 'none'}>
                            @{(log.user || 'anonymous').toUpperCase()}
                        </Link>
                        {log.userRole === 'archivist' && <span className="reel-archivist-badge">✦ ARCHIVIST</span>}
                        {log.userRole === 'auteur' && <span className="reel-auteur-badge">★ AUTEUR</span>}
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

                {/* Pull Quote — Premium inline treatment */}
                {log.pullQuote && (
                    <div style={{ margin: '0.6rem 0', padding: '0.65rem 0.85rem', borderLeft: isAuteurLog ? '3px solid rgba(180,45,45,0.6)' : isPremiumLog ? '3px solid rgba(218,165,32,0.6)' : '3px solid var(--sepia)', background: isAuteurLog ? 'linear-gradient(90deg, rgba(125,31,31,0.06) 0%, transparent 60%)' : isPremiumLog ? 'linear-gradient(90deg, rgba(139,105,20,0.06) 0%, transparent 60%)' : 'none', borderRadius: '0 2px 2px 0' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '0.95rem' : '1.1rem', fontStyle: 'italic', color: isAuteurLog ? 'rgba(180,45,45,0.9)' : isPremiumLog ? 'rgba(218,165,32,0.9)' : 'var(--sepia)', lineHeight: 1.35, textShadow: isPremiumLog ? (isAuteurLog ? '0 1px 8px rgba(125,31,31,0.15)' : '0 1px 8px rgba(139,105,20,0.15)') : 'none' }}>
                            « {log.pullQuote} »
                        </div>
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
                        {!isOwner && currentUser && (log.film?.id || log.filmId) && (
                            <button className="reel-action-btn" onClick={(e) => {
                                e.stopPropagation()
                                const filmId = log.film?.id || log.filmId
                                if (filmSaved) {
                                    removeFromWatchlist(filmId)
                                    reelToast.success('Removed from watchlist')
                                } else {
                                    addToWatchlist({ id: filmId, title: log.film?.title || 'Film', poster_path: log.film?.poster, release_date: log.film?.year ? `${log.film.year}-01-01` : undefined })
                                    reelToast.success('Saved to watchlist ✦')
                                }
                            }} style={{ color: filmSaved ? 'var(--sepia)' : 'var(--fog)' }}>
                                <Bookmark size={12} fill={filmSaved ? 'var(--sepia)' : 'none'} /> {filmSaved ? 'SAVED ✦' : 'SAVE'}
                            </button>
                        )}
                        {isLoungeEligible && (
                            <button className="reel-action-btn" onClick={(e) => { e.stopPropagation(); setShowShareLounge(true) }} style={{ color: 'var(--fog)' }}>
                                <MessageCircle size={12} /> LOUNGE
                            </button>
                        )}
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

            {/* ── AUTOPSY — Full-width outside the poster+content row ── */}
            {log.isAutopsied && log.autopsy && (
                <div style={{ padding: IS_TOUCH ? '0 1rem 1rem' : '0 1.25rem 1.25rem' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setAutopsyOpen(!autopsyOpen) }}
                        style={{
                            width: '100%', background: 'linear-gradient(135deg, rgba(11,10,8,0.95) 0%, rgba(25,20,12,0.95) 100%)',
                            border: '1px solid rgba(139,105,20,0.25)', borderRadius: '4px',
                            padding: '0.75rem 1rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            transition: 'border-color 0.3s, background 0.3s',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: 'var(--sepia)',
                                boxShadow: '0 0 8px rgba(139,105,20,0.6)',
                                animation: autopsyOpen ? 'none' : 'pulse 2s ease-in-out infinite',
                            }} />
                            <span style={{
                                fontFamily: 'var(--font-display)', fontSize: '0.75rem',
                                letterSpacing: '0.15em', color: 'var(--parchment)',
                            }}>
                                THE AUTOPSY
                            </span>
                            <span style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.45rem',
                                letterSpacing: '0.2em', color: 'var(--sepia)', opacity: 0.6,
                            }}>
                                CONFIDENTIAL
                            </span>
                        </div>
                        <span style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                            letterSpacing: '0.15em', color: 'var(--fog)',
                            transition: 'transform 0.3s',
                            transform: autopsyOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}>
                            ▼
                        </span>
                    </button>
                    {autopsyOpen && (
                        <div style={{
                            overflow: 'hidden',
                            animation: 'fadeSlideIn 0.3s ease-out',
                            marginTop: '0.5rem',
                        }}>
                            <RadarChart autopsy={log.autopsy} />
                        </div>
                    )}
                </div>
            )}

            {showShareLounge && (
                <ShareToLoungeModal
                    payload={{
                        type: 'log_share',
                        title: log.film?.title || 'Film',
                        subtitle: `${log.rating > 0 ? '★'.repeat(Math.round(log.rating)) + ' · ' : ''}by @${log.user || 'anonymous'}`,
                        image: log.film?.poster ? `https://image.tmdb.org/t/p/w185${log.film.poster}` : undefined,
                        metadata: {
                            logId: log.id,
                            filmId: log.film?.id || log.filmId,
                            title: log.film?.title,
                            poster: log.film?.poster,
                            rating: log.rating,
                            reviewer: log.user,
                            review: log.review?.slice(0, 200),
                        },
                    }}
                    onClose={() => setShowShareLounge(false)}
                />
            )}
        </div>
    )
}
