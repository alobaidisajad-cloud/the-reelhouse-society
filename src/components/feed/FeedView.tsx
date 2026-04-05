/**
 * FeedView — The compact inline layout for logs in the feed.
 * Pure presentation: receives all state/handlers as props from ActivityCard.
 */
import React, { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { ReelRating } from '../UI'
import { tmdb } from '../../tmdb'
import { Heart, MessageSquare, Lock, Edit3, MessageCircle, Bookmark } from 'lucide-react'
import { sanitizeHTML } from '../../utils/sanitize'
import AnnotationPanel from './AnnotationPanel'
import { DossierExportHTML } from './DossierExportHTML'
import type { ActivityCardViewProps } from './types'

const RadarChart = lazy(() => import('../UI').then(m => ({ default: m.RadarChart })))
const ShareToLoungeModal = lazy(() => import('../ShareToLoungeModal'))

export default function FeedView({
    log, IS_TOUCH, navigate, openLogModal,
    endorsed, endorsementCount, handleEndorse, canEndorse,
    annotateOpen, handleAnnotateToggle, canAnnotate,
    autopsyOpen, setAutopsyOpen,
    isExporting, dossierRef,
    isOwner, filmSaved, addToWatchlist, removeFromWatchlist,
    isLoungeEligible, setShowShareLounge, showShareLounge,
    stampRotation, isPremiumLog, isAuteurLog, isArchivistLog,
    strippedReview, showFullText, spoilersRevealed, setSpoilersRevealed,
    handleCardClick, reelToast,
}: ActivityCardViewProps) {
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
                            <><span style={{ float: 'left', fontSize: IS_TOUCH ? '2rem' : '2.5rem', lineHeight: IS_TOUCH ? '1.8rem' : '2.2rem', padding: '0.15rem 0.4rem 0 0', fontFamily: 'var(--font-display)', color: 'var(--sepia)', textShadow: '0 2px 8px rgba(139,105,20,0.2)' }}>{strippedReview.charAt(0)}</span><span>{showFullText ? (/<[a-z][\s\S]*>/i.test(log.review) ? <span dangerouslySetInnerHTML={{ __html: sanitizeHTML(log.review.replace(/<blockquote>[\s\n]*<\/blockquote>/gi, '')) }} /> : log.review.slice(1)) : (strippedReview.length > 300 ? strippedReview.slice(1, 300) : strippedReview.slice(1))}</span>{!showFullText && strippedReview.length > 300 && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginLeft: '0.3rem', opacity: 0.7 }}>… DECODE FULL DISPATCH →</span>}</>
                        ) : (
                            <><span>{showFullText ? (/<[a-z][\s\S]*>/i.test(log.review) ? <span dangerouslySetInnerHTML={{ __html: sanitizeHTML(log.review.replace(/<blockquote>[\s\n]*<\/blockquote>/gi, '')) }} /> : log.review) : (strippedReview.length > 300 ? strippedReview.slice(0, 300) : strippedReview)}</span>{!showFullText && strippedReview.length > 300 && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginLeft: '0.3rem', opacity: 0.7 }}>… DECODE FULL DISPATCH →</span>}</>
                        )}
                    </div>
                )}
                {/* Feed Action Deck (Premium Grid) */}
                <div onClick={e => e.stopPropagation()} style={{ 
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', 
                    background: 'rgba(139,105,20,0.15)', borderRadius: '6px', overflow: 'hidden', 
                    marginTop: '1.25rem', border: '1px solid rgba(139,105,20,0.2)' 
                }}>
                    <button onClick={handleEndorse} style={{ background: 'var(--ink)', border: 'none', padding: '0.8rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: canEndorse ? (endorsed ? 'var(--sepia)' : 'var(--fog)') : 'var(--ash)', cursor: canEndorse ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                        {canEndorse ? <Heart size={14} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} /> : <Lock size={14} />}
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em' }}>{endorsed ? 'CERTIFIED' : canEndorse ? 'CERTIFY' : 'LOCKED'}</span>
                    </button>
                    <button onClick={handleAnnotateToggle} style={{ background: 'var(--ink)', border: 'none', padding: '0.8rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: canAnnotate ? (annotateOpen ? 'var(--parchment)' : 'var(--fog)') : 'var(--ash)', cursor: canAnnotate ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                        {canAnnotate ? <MessageSquare size={14} /> : <Lock size={14} />}
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em' }}>CRITIQUE</span>
                    </button>
                    {isOwner ? (
                        <button onClick={(e) => { e.stopPropagation(); openLogModal({ id: log.film?.id || log.filmId, title: log.film?.title, poster_path: log.film?.poster, release_date: log.film?.year + '-01-01' }, log.id) }} style={{ background: 'var(--ink)', border: 'none', padding: '0.8rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: 'var(--fog)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                            <Edit3 size={14} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em' }}>EDIT</span>
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
                            }} style={{ background: 'var(--ink)', border: 'none', padding: '0.8rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: filmSaved ? 'var(--sepia)' : 'var(--fog)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                            <Bookmark size={14} fill={filmSaved ? 'var(--sepia)' : 'none'} color={filmSaved ? 'var(--sepia)' : 'currentColor'} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em' }}>{filmSaved ? 'SAVED ✦' : 'SAVE'}</span>
                        </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); if (isLoungeEligible) setShowShareLounge(true); else reelToast.error('Patron upgrade required to share directly to The Lounge.') }} style={{ background: 'var(--ink)', border: 'none', padding: '0.8rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: isLoungeEligible ? 'var(--fog)' : 'var(--ash)', cursor: isLoungeEligible ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => { if(isLoungeEligible) e.currentTarget.style.background = 'rgba(139,105,20,0.05)' }} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                        {isLoungeEligible ? <MessageCircle size={14} /> : <span style={{ position: 'relative' }}><MessageCircle size={14} opacity={0.5} /><Lock size={8} style={{ position: 'absolute', bottom: -2, right: -2 }} /></span>}
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em' }}>LOUNGE</span>
                    </button>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
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
                            <Suspense fallback={null}><RadarChart autopsy={log.autopsy} /></Suspense>
                        </div>
                    )}
                </div>
            )}

            {showShareLounge && (
                <Suspense fallback={null}>
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
                </Suspense>
            )}
        </div>
    )
}
