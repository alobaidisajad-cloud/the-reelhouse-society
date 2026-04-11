/**
 * FocusView — The expanded cinematic layout for a single log.
 * Pure presentation: receives all state/handlers as props from ActivityCard.
 */
import React, { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { ReelRating } from '../UI'
import { tmdb } from '../../tmdb'
import { Heart, MessageSquare, Download, Send, Lock, Edit3, MessageCircle, Bookmark } from 'lucide-react'
import { sanitizeHTML } from '../../utils/sanitize'
import ReactionBar from '../ReactionBar'
import AnnotationPanel from './AnnotationPanel'
import { DossierExportHTML } from './DossierExportHTML'
import type { ActivityCardViewProps } from './types'

const RadarChart = lazy(() => import('../UI').then(m => ({ default: m.RadarChart })))

export default function FocusView({
    log, IS_TOUCH, navigate, openLogModal,
    endorsed, endorsementCount, handleEndorse, canEndorse,
    annotateOpen, handleAnnotateToggle, canAnnotate,
    autopsyOpen, setAutopsyOpen,
    isExporting, exportDossier, dossierRef,
    isOwner, filmSaved, addToWatchlist, removeFromWatchlist,
    isLoungeEligible, setShowShareLounge,
    stampRotation, isPremiumLog, isAuteurLog, isArchivistLog,
    strippedReview, showFullText, spoilersRevealed, setSpoilersRevealed,
    currentUser, reelToast,
}: ActivityCardViewProps) {
    return (
        <div className="fade-in-up" onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '100%', isolation: 'isolate', overflow: 'hidden' }}>
            {/* ── IMMERSIVE FULL-BLEED BACKDROP ── */}
            {(log.editorialHeader || log.film?.poster) && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: IS_TOUCH ? '45vh' : '65vh', zIndex: -1, overflow: 'hidden' }}>
                    <img
                        src={tmdb.backdrop(log.editorialHeader || log.film.poster, 'w1280')}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', filter: 'sepia(0.2) contrast(1.1) brightness(0.25) blur(4px)' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,7,3,0) 0%, rgba(10,7,3,0.4) 40%, rgba(10,7,3,0.95) 85%, var(--ink) 100%)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} />

                    {/* Editorial Badge floating dynamically */}
                    {log.editorialHeader && (
                        <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.3em', color: 'rgba(218,165,32,0.85)', background: 'rgba(11,10,8,0.5)', backdropFilter: 'blur(8px)', padding: '0.4rem 0.85rem', borderRadius: '2px', border: '1px solid rgba(196,150,26,0.2)' }}>
                            ✦ EDITORIAL
                        </div>
                    )}
                </div>
            )}

            {/* Transparent Overlap Spacer to push content down into parallax */}
            <div style={{ height: IS_TOUCH ? '10vh' : '20vh', flexShrink: 0, pointerEvents: 'none' }} />

            {/* ── OVERLAPPING CONTENT CARD ── */}
            <div style={{ 
                background: 'rgba(10,7,3,0.85)', backdropFilter: 'blur(16px)',
                borderRadius: '12px 12px 0 0', flex: 1, display: 'flex', flexDirection: 'column',
                padding: IS_TOUCH ? '1.5rem 1rem' : '2.5rem 2rem', 
                borderTop: '1px solid rgba(139,105,20,0.15)',
                boxShadow: '0 -20px 40px rgba(0,0,0,0.8)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                        <Link to={`/user/${log.user}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--sepia)', textDecoration: 'none', textTransform: 'uppercase', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '15ch', display: 'inline-block' }}>
                            @{log.user || 'anonymous'}
                        </Link>
                        {log.userRole === 'archivist' && <span className="reel-archivist-badge" style={{ fontSize: '0.4rem', padding: '0.1rem 0.5rem' }}>✦ ARCHIVIST</span>}
                        {log.userRole === 'auteur' && <span className="reel-auteur-badge" style={{ fontSize: '0.4rem', padding: '0.1rem 0.5rem' }}>★ AUTEUR</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                        {log.timestamp || 'RECENT'}
                    </div>
                </div>

                    {/* ── LEFT COLUMN (DESKTOP) / TOP (MOBILE) ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', minWidth: IS_TOUCH ? undefined : 200 }}>
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
                        </div>

                        {/* Title & Rating on Desktop under poster */}
                        {!IS_TOUCH && (
                            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                                <div>
                                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'var(--parchment)', lineHeight: 1.1, margin: 0, textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                        {log.film?.title}
                                    </h1>
                                    {log.film?.year && (
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.3em', color: 'var(--fog)', marginTop: '0.5rem' }}>
                                            {log.film.year}
                                        </div>
                                    )}
                                </div>
                                {log.rating > 0 && <ReelRating value={log.rating} size="lg" />}
                            </div>
                        )}

                        {/* Focus Action Deck (Premium Grid) */}
                        <div onClick={e => e.stopPropagation()} style={{ 
                            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', 
                            background: 'rgba(139,105,20,0.15)', borderRadius: '6px', overflow: 'hidden', 
                            width: '100%', border: '1px solid rgba(139,105,20,0.2)' 
                        }}>
                            <button onClick={handleEndorse} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: canEndorse ? (endorsed ? 'var(--sepia)' : 'var(--fog)') : 'var(--ash)', cursor: canEndorse ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                                {canEndorse ? <Heart size={16} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} /> : <Lock size={16} />}
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em' }}>{endorsed ? 'CERTIFIED' : canEndorse ? 'CERT' : 'LOCK'}</span>
                            </button>
                            <button onClick={handleAnnotateToggle} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: canAnnotate ? (annotateOpen ? 'var(--parchment)' : 'var(--fog)') : 'var(--ash)', cursor: canAnnotate ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                                {canAnnotate ? <MessageSquare size={16} /> : <Lock size={16} />}
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em' }}>CRITIQUE</span>
                            </button>
                            {isOwner ? (
                                <button onClick={(e) => { e.stopPropagation(); openLogModal({ id: log.film?.id || log.filmId, title: log.film?.title, poster_path: log.film?.poster, release_date: log.film?.year + '-01-01' }, log.id) }} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--fog)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                                    <Edit3 size={16} />
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em' }}>EDIT</span>
                                </button>
                            ) : (
                                <button onClick={(e) => {
                                        e.stopPropagation()
                                        const filmId = log.film?.id || log.filmId
                                        if (filmSaved) {
                                            removeFromWatchlist(filmId)
                                            reelToast.success('Removed from watchlist')
                                        } else {
                                            addToWatchlist({ id: filmId, title: log.film?.title || 'Film', poster_path: log.film?.poster, release_date: log.film?.year ? `${log.film.year}-01-01` : undefined })
                                            reelToast.success('Saved to watchlist ✦')
                                        }
                                    }} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: filmSaved ? 'var(--sepia)' : 'var(--fog)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                                    <Bookmark size={16} fill={filmSaved ? 'var(--sepia)' : 'none'} color={filmSaved ? 'var(--sepia)' : 'currentColor'} />
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em' }}>{filmSaved ? 'SAVED' : 'SAVE'}</span>
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); if (isLoungeEligible) setShowShareLounge(true); else reelToast.error('Patron upgrade required to share directly to The Lounge.') }} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: isLoungeEligible ? 'var(--fog)' : 'var(--ash)', cursor: isLoungeEligible ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => { if(isLoungeEligible) e.currentTarget.style.background = 'rgba(139,105,20,0.05)' }} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                                {isLoungeEligible ? <MessageCircle size={16} /> : <span style={{ position: 'relative' }}><MessageCircle size={16} opacity={0.5} /><Lock size={8} style={{ position: 'absolute', bottom: -2, right: -2 }} /></span>}
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em' }}>LOUNGE</span>
                            </button>
                        </div>
                    </div>

                    {/* ── RIGHT COLUMN (DESKTOP) / BOTTOM (MOBILE) ── */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        
                        {/* Title & Rating on Mobile above review */}
                        {IS_TOUCH && (
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
                        )}

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
                <div style={{ padding: '0 1.5rem' }}>
                    <div style={{
                        fontFamily: 'var(--font-body)', fontSize: IS_TOUCH ? '0.95rem' : '1.05rem',
                        color: 'var(--bone)', lineHeight: 1.85, opacity: 0.9,
                    }}>
                        {log.isSpoiler && !spoilersRevealed ? (
                            <div onClick={(e) => { e.stopPropagation(); setSpoilersRevealed(true); }} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(139,105,20,0.15)', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>[ CLASSIFIED ]</span>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', fontStyle: 'italic' }}>Tap to decode spoilers.</span>
                            </div>
                        ) : log.dropCap ? (
                            <>{/* Drop cap rendering */}
                                <span style={{ float: 'left', fontSize: IS_TOUCH ? '2.5rem' : '3rem', lineHeight: IS_TOUCH ? '2.2rem' : '2.6rem', padding: '0.2rem 0.5rem 0 0', fontFamily: 'var(--font-display)', color: 'var(--sepia)', textShadow: '0 2px 8px rgba(139,105,20,0.2)' }}>{strippedReview.charAt(0)}</span>
                                <span>{/\<[a-z][\s\S]*\>/i.test(log.review) ? <span dangerouslySetInnerHTML={{ __html: sanitizeHTML(log.review.replace(/<blockquote>[\s\n]*<\/blockquote>/gi, '')) }} /> : log.review.slice(1)}</span>
                            </>
                        ) : (
                            <span>{/\<[a-z][\s\S]*\>/i.test(log.review) ? <span dangerouslySetInnerHTML={{ __html: sanitizeHTML(log.review.replace(/<blockquote>[\s\n]*<\/blockquote>/gi, '')) }} /> : log.review}</span>
                        )}
                    </div>
                </div>
            )}

            {/* ── VIEWING CHRONICLE — Horizontal swipeable review carousel ── */}
            {log.viewingHistory && log.viewingHistory.length > 0 && (() => {
                const allViewings = [
                    // Current review as the first page
                    ...(log.review ? [{
                        label: '◆ LATEST VIEWING',
                        date: log.watchedDate || log.watched_date,
                        rating: log.rating,
                        review: log.review,
                        watchedWith: log.watchedWith || log.watched_with,
                        isCurrent: true,
                    }] : []),
                    // Past reviews
                    ...log.viewingHistory.map((entry: any, idx: number) => ({
                        label: idx === log.viewingHistory.length - 1 ? '◆ FIRST WATCH' : `VIEWING ${log.viewingHistory.length - idx}`,
                        date: entry.date,
                        rating: entry.rating,
                        review: entry.review,
                        watchedWith: entry.watchedWith,
                        isCurrent: false,
                    })),
                ]
                return (
                    <div style={{ padding: '0 1.5rem', marginTop: '1.5rem' }}>
                        <div style={{ background: 'linear-gradient(135deg, rgba(139,105,20,0.05), rgba(10,7,3,0.4))', border: '1px solid rgba(139,105,20,0.18)', borderRadius: 6, overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(139,105,20,0.1)' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sepia)', display: 'inline-block' }} />
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>
                                    VIEWING CHRONICLE — {allViewings.length} viewings
                                </span>
                            </div>
                            {/* Horizontal scroll container */}
                            <div
                                style={{
                                    display: 'flex',
                                    overflowX: 'auto',
                                    scrollSnapType: 'x mandatory',
                                    scrollbarWidth: 'none',
                                    WebkitOverflowScrolling: 'touch',
                                }}
                                className="chronicle-scroll"
                            >
                                {allViewings.map((entry, idx) => (
                                    <div key={idx} style={{
                                        minWidth: '100%',
                                        maxWidth: '100%',
                                        scrollSnapAlign: 'start',
                                        padding: '1rem 1.25rem',
                                        boxSizing: 'border-box',
                                    }}>
                                        {/* Viewing label + date */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                            <span style={{
                                                fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em',
                                                color: entry.isCurrent ? 'var(--sepia)' : 'var(--fog)',
                                                background: entry.isCurrent ? 'rgba(139,105,20,0.12)' : 'transparent',
                                                padding: entry.isCurrent ? '0.15rem 0.4rem' : 0,
                                                borderRadius: '2px',
                                            }}>
                                                {entry.label}
                                            </span>
                                            {entry.date && (
                                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>
                                                    · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                        {/* Rating */}
                                        {entry.rating > 0 && (
                                            <div style={{ marginBottom: '0.3rem' }}>
                                                <ReelRating value={entry.rating} size="sm" />
                                            </div>
                                        )}
                                        {/* Review text */}
                                        {entry.review && (
                                            <p style={{
                                                fontFamily: 'var(--font-body)',
                                                fontSize: entry.isCurrent ? '0.95rem' : '0.85rem',
                                                color: 'var(--bone)',
                                                lineHeight: 1.7,
                                                opacity: entry.isCurrent ? 0.9 : 0.7,
                                                fontStyle: entry.isCurrent ? 'normal' : 'italic',
                                                margin: 0,
                                                maxHeight: '12rem',
                                                overflowY: 'auto',
                                                scrollbarWidth: 'thin',
                                                scrollbarColor: 'rgba(139,105,20,0.3) transparent',
                                            }}>
                                                {entry.isCurrent ? '' : '"'}{typeof entry.review === 'string' ? entry.review.replace(/<[^>]+>/g, '').trim() : ''}{entry.isCurrent ? '' : '"'}
                                            </p>
                                        )}
                                        {/* Watched with */}
                                        {entry.watchedWith && (
                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.08em', color: 'var(--fog)', marginTop: '0.4rem', display: 'block' }}>
                                                ♡ {entry.watchedWith}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {/* Dot indicators */}
                            {allViewings.length > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', padding: '0.5rem 0 0.75rem' }}>
                                    {allViewings.map((_, idx) => (
                                        <span key={idx} style={{
                                            width: 5, height: 5, borderRadius: '50%',
                                            background: idx === 0 ? 'var(--sepia)' : 'rgba(139,105,20,0.25)',
                                            transition: 'background 0.3s',
                                        }} />
                                    ))}
                                </div>
                            )}
                        </div>
                        <style>{`.chronicle-scroll::-webkit-scrollbar { display: none; }`}</style>
                    </div>
                )
            })()}

            {/* Autopsy */}
            {log.isAutopsied && log.autopsy && (
                <div style={{ padding: '0 1.25rem' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
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
                            <Suspense fallback={null}><RadarChart autopsy={log.autopsy} size={180} /></Suspense>
                        </div>
                    )}
                </div>
            )}
                    <AnnotationPanel logId={log.id} open={annotateOpen} isExpandedView={true} />

                    {log.isAutopsied && log.autopsy && (
                        <div style={{ padding: '0 1rem 1rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={exportDossier} disabled={isExporting} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--sepia)', cursor: 'pointer', opacity: isExporting ? 0.5 : 1 }}>
                                <Download size={14} /> {isExporting ? 'ENCODING...' : 'TRANSMIT HYPER-DOSSIER'}
                            </button>
                        </div>
                    )}

                    <div style={{ marginTop: '0.5rem' }}>
                        <ReactionBar logId={log.id} logAuthor={log.user} filmTitle={log.film?.title} />
                    </div>

                </div>
            </div>

            {/* Dossier Hidden HTML Canvas */}
            <DossierExportHTML ref={dossierRef} log={log} />
        </div>
    )
}
