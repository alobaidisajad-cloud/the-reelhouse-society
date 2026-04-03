/**
 * FocusView — The expanded cinematic layout for a single log.
 * Pure presentation: receives all state/handlers as props from ActivityCard.
 */
import React, { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { ReelRating } from '../UI'
import { tmdb } from '../../tmdb'
import { Heart, MessageSquare, Download, Send, Lock, Edit3, MessageCircle, Bookmark } from 'lucide-react'
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
        <div className="fade-in-up" onClick={e => e.stopPropagation()} style={{ padding: '0.5rem 0 3rem 0', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* ── CINEMATIC HERO (Archivist Editorial Backdrop) ── */}
            {log.editorialHeader && (
                <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
                    <div style={{ position: 'relative', width: '100%', height: IS_TOUCH ? 280 : 400, overflow: 'hidden' }}>
                        <img
                            src={tmdb.backdrop(log.editorialHeader, 'w1280')}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', filter: 'sepia(0.12) contrast(1.1) brightness(0.35)' }}
                        />
                        {/* Seamless vignette fading into the rest of the page */}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,7,3,0) 0%, rgba(10,7,3,0.3) 30%, rgba(10,7,3,0.85) 75%, var(--ink) 100%)' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center 30%, transparent 20%, rgba(10,7,3,0.65) 100%)' }} />
                        {/* Film grain layer */}
                        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} />

                        {/* Editorial Badge — floats in the top left over the backdrop */}
                        <div style={{ position: 'absolute', top: '2rem', left: '2rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.3em', color: 'rgba(218,165,32,0.85)', background: 'rgba(11,10,8,0.5)', backdropFilter: 'blur(8px)', padding: '0.4rem 0.85rem', borderRadius: '2px', border: '1px solid rgba(196,150,26,0.2)' }}>
                            ✦ EDITORIAL
                        </div>
                    </div>
                </div>
            )}

            {/* ── STANDARD UNIFIED POSTER & USER ROW ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '1rem' }}>
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
                                <span>{/\<[a-z][\s\S]*\>/i.test(log.review) ? <span dangerouslySetInnerHTML={{ __html: log.review.replace(/<blockquote>[\s\n]*<\/blockquote>/gi, '') }} /> : log.review.slice(1)}</span>
                            </>
                        ) : (
                            <span>{/\<[a-z][\s\S]*\>/i.test(log.review) ? <span dangerouslySetInnerHTML={{ __html: log.review.replace(/<blockquote>[\s\n]*<\/blockquote>/gi, '') }} /> : log.review}</span>
                        )}
                    </div>
                </div>
            )}

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



            {/* Focus Action Deck (Premium Grid) */}
            <div onClick={e => e.stopPropagation()} style={{ 
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', 
                background: 'rgba(139,105,20,0.15)', borderRadius: '6px', overflow: 'hidden', 
                marginTop: '0.5rem', border: '1px solid rgba(139,105,20,0.2)' 
            }}>
                <button onClick={handleEndorse} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: canEndorse ? (endorsed ? 'var(--sepia)' : 'var(--fog)') : 'var(--ash)', cursor: canEndorse ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                    {canEndorse ? <Heart size={16} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} /> : <Lock size={16} />}
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>{endorsed ? 'CERTIFIED' : canEndorse ? 'CERTIFY' : 'LOCKED'}</span>
                </button>
                <button onClick={handleAnnotateToggle} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: canAnnotate ? (annotateOpen ? 'var(--parchment)' : 'var(--fog)') : 'var(--ash)', cursor: canAnnotate ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                    {canAnnotate ? <MessageSquare size={16} /> : <Lock size={16} />}
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>CRITIQUE</span>
                </button>
                {isOwner ? (
                    <button onClick={(e) => { e.stopPropagation(); openLogModal({ id: log.film?.id || log.filmId, title: log.film?.title, poster_path: log.film?.poster, release_date: log.film?.year + '-01-01' }, log.id) }} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--fog)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                        <Edit3 size={16} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>EDIT</span>
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
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>{filmSaved ? 'SAVED ✦' : 'SAVE'}</span>
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); if (isLoungeEligible) setShowShareLounge(true); else reelToast.error('Patron upgrade required to share directly to The Lounge.') }} style={{ background: 'var(--ink)', border: 'none', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: isLoungeEligible ? 'var(--fog)' : 'var(--ash)', cursor: isLoungeEligible ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }} onMouseEnter={e => { if(isLoungeEligible) e.currentTarget.style.background = 'rgba(139,105,20,0.05)' }} onMouseLeave={e => e.currentTarget.style.background = 'var(--ink)'}>
                    {isLoungeEligible ? <MessageCircle size={16} /> : <span style={{ position: 'relative' }}><MessageCircle size={16} opacity={0.5} /><Lock size={8} style={{ position: 'absolute', bottom: -2, right: -2 }} /></span>}
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>LOUNGE</span>
                </button>
            </div>

            <AnnotationPanel logId={log.id} open={annotateOpen} isExpandedView={true} />

            {log.isAutopsied && log.autopsy && (
                <div style={{ marginTop: '0.5rem' }}>
                    <Suspense fallback={null}><RadarChart autopsy={log.autopsy} size={260} /></Suspense>
                    
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
