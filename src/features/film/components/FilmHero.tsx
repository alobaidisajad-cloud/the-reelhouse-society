import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Clock, Globe, Bookmark, Plus, X, Film, Play, Camera, ArrowUpRight, Check, RotateCcw, Eye, MessageCircle } from 'lucide-react'
import { tmdb, obscurityScore, formatRuntime, getYear } from '../../../tmdb'
import { ReelRating, ObscurityBadge, GenreTags } from '../../../components/UI'
import Poster from '../../../components/film/Poster'
import DossierExportModal from '../../../components/film/DossierExportModal'
import ShareToLoungeModal from '../../../components/ShareToLoungeModal'
import { useUIStore, useFilmStore, useAuthStore } from '../../../store'
import { supabase } from '../../../supabaseClient'
import reelToast from '../../../utils/reelToast'
import { useViewport } from '../../../hooks/useViewport'
import { useFilmMutations } from '../hooks/useFilmMutations'

export function FilmHero({ film, onPlayTrailer }: any) {
    const { isTouch: IS_TOUCH } = useViewport()
    const openLogModal = useUIStore(s => s.openLogModal)
    const _watchlistIndex = useFilmStore(s => s._watchlistIndex)
    const { useAddToWatchlist, useRemoveFromWatchlist, useMarkAsWatched, useUnmarkWatched } = useFilmMutations()
    const { mutateAsync: addToWatchlist } = useAddToWatchlist()
    const { mutateAsync: removeFromWatchlist } = useRemoveFromWatchlist()
    const { mutateAsync: markAsWatched } = useMarkAsWatched()
    const { mutateAsync: unmarkWatched } = useUnmarkWatched()
    const _loggedIndex = useFilmStore(s => s._loggedIndex)
    const [showExport, setShowExport] = useState(false)
    const [showShareLounge, setShowShareLounge] = useState(false)
    const user = useAuthStore(s => s.user)
    const isArchivist = user && ['archivist', 'auteur'].includes(user.role)
    const isWatchlisted = !!_watchlistIndex[film.id]
    const score = obscurityScore(film)
    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')
    const trailer = film.videos?.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
        || film.videos?.results?.find((v: any) => v.site === 'YouTube')
    const existingLog = _loggedIndex[film.id] || null
    const statusLabel: any = { watched: <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> WATCHED</>, rewatched: <><RotateCcw size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /> REWATCHED</>, abandoned: <><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> ABANDONED</> }

    // --- Smart Review Count Fallback ---
    const { data: localCount = 0 } = useQuery({
        queryKey: ['local-reviews', film?.id],
        queryFn: async () => {
            if (!film?.id) return 0
            const { count } = await supabase.from('logs').select('id', { count: 'exact', head: true }).eq('film_id', film.id)
            return count || 0
        },
        enabled: !!film?.id
    })
    
    // ── Parallax Backdrop ──
    const backdropRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        let pendingRaf = 0
        const handleScroll = () => {
            if (!backdropRef.current) return
            const sy = window.scrollY
            if (sy > 800) return // optimize
            if (pendingRaf) return // dedup — only 1 RAF queued at a time
            pendingRaf = requestAnimationFrame(() => {
                pendingRaf = 0
                if (backdropRef.current) {
                    backdropRef.current.style.transform = `translate3d(0, ${sy * 0.4}px, 0)`
                }
            })
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', handleScroll)
            if (pendingRaf) cancelAnimationFrame(pendingRaf)
        }
    }, [])

    const reviewText = localCount > 0 
        ? `${localCount} SOCIETY REVIEW${localCount === 1 ? '' : 'S'}`
        : `${Math.round((film?.vote_count || 0) / 100) * 100}+ GLOBAL RATINGS`

    const toggleWatchlist = async () => {
        if (isWatchlisted) { removeFromWatchlist(film.id); reelToast(`Removed from watchlist`) }
        else {
            try { await addToWatchlist(film); reelToast.success(`Added to watchlist!`) }
            catch { reelToast.error('Failed to add to watchlist') }
        }
    }

    return (
        <>
        {/* ─── MOBILE HERO: Full-bleed cinematic layout ─── */}
        {IS_TOUCH ? (
            <div style={{ position: 'relative', width: '100%' }}>
                {/* Full-bleed backdrop */}
            <div style={{ position: 'relative', width: '100vw', marginLeft: 'calc(-50vw + 50%)', height: '55vw', minHeight: 220, maxHeight: 320, overflow: 'hidden' }}>
                    {film.backdrop_path ? (
                        <div ref={IS_TOUCH ? backdropRef : null} className="anamorphic-focus-pull" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -50, backgroundImage: `url(${tmdb.backdrop(film.backdrop_path)})`, backgroundSize: 'cover', backgroundPosition: 'center 20%', filter: 'sepia(0.25) brightness(0.50) contrast(1.1)', willChange: 'transform' }} />
                    ) : (
                        <div className="anamorphic-focus-pull" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--soot), var(--ink))' }} />
                    )}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,7,3,0.05) 0%, rgba(10,7,3,0.40) 65%, var(--ink) 100%)' }} />
                </div>

                {/* Poster — floats out of the backdrop into the info section */}
                <div style={{ position: 'relative', marginTop: -80, display: 'flex', justifyContent: 'center', zIndex: 2 }}>
                    <div style={{ position: 'relative' }}>
                        <div className="card-film scanlines" style={{ width: 140, boxShadow: '0 16px 48px rgba(0,0,0,0.8), 0 0 24px rgba(139,105,20,0.2)', borderRadius: 6, overflow: 'hidden' }}>
                            {film.poster_path ? (
                                <Poster path={film.poster_path} title={film.title} sizeHint="md" style={{ filter: 'sepia(0.15) contrast(1.1)' }} />
                            ) : (
                                <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--soot)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)' }}>NO POSTER</span>
                                </div>
                            )}
                        </div>
                        {/* Watched/logged badge — floats bottom of poster */}
                        {existingLog && (
                            <div style={{ position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: 'linear-gradient(135deg, #8B6914, #DAA520)', padding: '0.25rem 0.75rem', borderRadius: 20, fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: '#0E0B08', fontWeight: 700, boxShadow: '0 4px 12px rgba(139,105,20,0.4)' }}>
                                {statusLabel[existingLog.status] || <><Check size={9} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> LOGGED</>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Info block */}
                <div style={{ padding: '1.75rem 1.25rem 0.5rem', textAlign: 'center' }}>
                    {/* Genre tags */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                        <GenreTags genres={film.genres} />
                    </div>

                    {/* Title */}
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 7vw, 2.5rem)', color: 'var(--parchment)', lineHeight: 1.1, margin: '0 0 0.4rem' }}>{film.title}</h1>

                    {/* Tagline */}
                    {film.tagline && (
                        <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--bone)', fontStyle: 'italic', opacity: 0.75, marginBottom: '0.9rem' }}>"{film.tagline}"</p>
                    )}

                    {/* Meta strip */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={10} />{formatRuntime(film.runtime)}
                        </span>
                        <span style={{ color: 'var(--ash)', fontSize: '0.5rem' }}>·</span>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{getYear(film.release_date)}</span>
                        {film.production_countries?.[0] && (
                            <>
                                <span style={{ color: 'var(--ash)', fontSize: '0.5rem' }}>·</span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Globe size={10} />{film.production_countries[0].name}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Rating reels + review count */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
                        <ReelRating value={Math.round((film.vote_average || 0) / 2)} size="lg" />
                    </div>
                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.78rem', color: 'var(--bone)', opacity: 0.7, marginBottom: '1rem' }}>
                        {film.vote_average?.toFixed(1)} · {reviewText}
                    </div>

                    {/* Director */}
                    {director && (
                        <Link to={`/person/${director.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.12em', color: 'var(--bone)', marginBottom: '1.25rem' }}>
                            <span style={{ color: 'var(--fog)' }}>DIR.</span>
                            <span style={{ textDecoration: 'underline', textDecorationColor: 'var(--ash)' }}>{director.name}</span>
                            <ArrowUpRight size={10} color="var(--fog)" />
                        </Link>
                    )}

                    {/* Existing log details + review + viewing chronicle */}
                    {existingLog && (
                        <div style={{ background: 'linear-gradient(135deg, rgba(139,105,20,0.08), rgba(10,7,3,0.5))', border: '1px solid rgba(139,105,20,0.2)', borderRadius: 8, padding: '0.85rem 1.1rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {/* Rating + meta row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {(existingLog.rating ?? 0) > 0 && (
                                    <ReelRating value={existingLog.rating} size="sm" />
                                )}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)', textAlign: 'right' }}>
                                    {existingLog.watchedDate && new Date(existingLog.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {existingLog.watchedWith && <span> · ♡ {existingLog.watchedWith}</span>}
                                    {(existingLog.viewCount || 1) > 1 && <span> · <RotateCcw size={8} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> {existingLog.viewCount} viewings</span>}
                                </div>
                            </div>
                            {/* Review preview — truncated, tap to read full log */}
                            {existingLog.review && (() => {
                                const stripped = existingLog.review.replace(/<[^>]+>/g, '').trim()
                                const isLong = stripped.length > 120
                                return (
                                    <Link to={`/log/${existingLog.id}`} style={{ textDecoration: 'none' }}>
                                        <p style={{
                                            fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--bone)',
                                            lineHeight: 1.65, margin: '0.3rem 0 0', opacity: 0.8,
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                        }}>
                                            {stripped}
                                        </p>
                                        {isLong && (
                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginTop: '0.25rem', display: 'inline-block' }}>
                                                READ FULL CRITIQUE →
                                            </span>
                                        )}
                                    </Link>
                                )
                            })()}
                        </div>
                    )}

                    {/* CTA Buttons */}
                    <div className="hero-cta-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingBottom: '1rem' }}>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.72rem', padding: '0.85rem' }} onClick={() => openLogModal(film, existingLog?.id)}>
                            <Plus size={15} /> {existingLog ? 'Edit Log' : 'Log This Film'}
                        </button>
                        {existingLog && (
                            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: '0.68rem', padding: '0.75rem', borderColor: 'rgba(139,105,20,0.5)', color: 'var(--sepia)' }} onClick={() => openLogModal(film)}>
                                <RotateCcw size={13} /> Log Rewatch{(existingLog?.viewCount || 1) > 1 ? ` (${(existingLog?.viewCount || 1) + 1})` : ''}
                            </button>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                            {existingLog && (
                                <button className="btn btn-ghost" style={{ flex: '1 1 auto', justifyContent: 'center', fontSize: '0.65rem', borderColor: 'rgba(139,105,20,0.5)', color: 'var(--sepia)' }} onClick={() => setShowExport(true)}>
                                    <Camera size={13} /> Dossier
                                </button>
                            )}
                            <button className={`btn ${isWatchlisted ? 'btn-danger' : 'btn-ghost'}`} style={{ flex: '1 1 auto', justifyContent: 'center', fontSize: '0.65rem' }} onClick={toggleWatchlist}>
                                <Bookmark size={13} fill={isWatchlisted ? 'currentColor' : 'none'} />
                                {isWatchlisted ? 'Saved' : 'Watchlist'}
                            </button>
                            {!existingLog && (
                                <button className="btn btn-ghost" style={{ flex: '1 1 auto', justifyContent: 'center', fontSize: '0.65rem' }}
                                    onClick={async () => {
                                        try {
                                            await markAsWatched(film)
                                            reelToast.success('Marked as watched!')
                                        } catch { }
                                    }}
                                >
                                    <Eye size={13} /> Watched
                                </button>
                            )}
                            {trailer && (
                                <button className="btn btn-ghost" style={{ flex: '1 1 auto', justifyContent: 'center', fontSize: '0.65rem' }} onClick={() => onPlayTrailer(trailer.key)}>
                                    <Play size={13} /> Trailer
                                </button>
                            )}
                            {isArchivist && (
                                <button className="btn btn-ghost" style={{ flex: '1 1 auto', justifyContent: 'center', fontSize: '0.65rem', borderColor: 'rgba(139,105,20,0.4)', color: 'var(--sepia)' }} onClick={() => setShowShareLounge(true)}>
                                    <MessageCircle size={13} /> Lounge
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        ) : (
        /* ─── DESKTOP HERO: cinematic full-bleed dossier layout ─── */
        <div style={{ position: 'relative', minHeight: '88vh', display: 'flex', alignItems: 'flex-end', paddingBottom: '3.5rem', paddingTop: 0, flexShrink: 0 }}>
            {/* Backdrop */}
            {film.backdrop_path && (
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                    <div ref={!IS_TOUCH ? backdropRef : null} className="anamorphic-focus-pull" style={{ position: 'absolute', inset: -100, top: 0, backgroundImage: `url(${tmdb.backdrop(film.backdrop_path)})`, backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'sepia(0.3) brightness(0.40) contrast(1.1)', zIndex: 0, willChange: 'transform' }} />
                </div>
            )}
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ink) 15%, rgba(10,7,3,0.85) 45%, rgba(10,7,3,0.2) 80%, transparent)', zIndex: 1 }} />

            {/* Trailer play button overlay on backdrop */}
            {trailer && (
                <button className="hero-play-overlay" onClick={() => onPlayTrailer(trailer.key)}
                    style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2, background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(139,105,20,0.6)', borderRadius: '50%', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s', backdropFilter: 'blur(4px)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.3)'; e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)'; e.currentTarget.style.borderColor = 'rgba(139,105,20,0.6)'; e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)' }}
                >
                    <Play size={24} fill="rgba(242,232,160,0.9)" color="transparent" />
                </button>
            )}
            {/* Film-strip perforation bar — ReelHouse signature, sits at edge of content */}
            <div style={{ position: 'absolute', bottom: '3.5rem', left: 0, right: 0, zIndex: 2, pointerEvents: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', opacity: 0.20, paddingBottom: '1.5rem' }}>
                    {Array.from({ length: 22 }).map((_, i) => (
                        <div key={i} style={{ width: 16, height: 10, border: '1px solid var(--sepia)', borderRadius: '1px', flexShrink: 0 }} />
                    ))}
                </div>
            </div>

            <div className="container hero-grid" style={{ position: 'relative', zIndex: 2, width: '100%' }}>
                <div>
                    {/* Poster */}
                    <div style={{ flexShrink: 0, position: 'relative' }}>
                        {film.poster_path && (
                            <div style={{ position: 'absolute', inset: -20, zIndex: 0, backgroundImage: `url(${tmdb.poster(film.poster_path, 'w342')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) sepia(0.5) saturate(2)', opacity: 0.25, transform: 'scale(1.05)' }} />
                        )}
                        <div className="card-film scanlines" style={{ position: 'relative', zIndex: 1, boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(139,105,20,0.2)' }}>
                            {film.poster_path ? (
                                <Poster path={film.poster_path} title={film.title} sizeHint="hero" style={{ filter: 'sepia(0.2) contrast(1.1)' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: 'var(--soot)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)' }}>NO POSTER</span>
                                </div>
                            )}
                        </div>
                        {existingLog && (
                            <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: 'linear-gradient(135deg, rgba(139,105,20,0.12), rgba(10,7,3,0.8))', border: '1px solid rgba(139,105,20,0.3)', borderRadius: 'var(--radius-card)', borderLeft: '2px solid var(--sepia)' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.3rem' }}>{statusLabel[existingLog.status] || <><Check size={12} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> LOGGED</>}</div>
                                {existingLog.rating > 0 && <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--flicker)', marginBottom: '0.15rem' }}>{'★'.repeat(Math.round(existingLog.rating))}{'☆'.repeat(5 - Math.round(existingLog.rating))}</div>}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>
                                    {existingLog.watchedDate && new Date(existingLog.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {existingLog.watchedWith && <span> · ♡ {existingLog.watchedWith}</span>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <GenreTags genres={film.genres} />
                    {/* Massive editorial title — the defining visual of the page */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                        <div style={{ width: '3px', flexShrink: 0, alignSelf: 'stretch', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker), transparent)', borderRadius: '2px', minHeight: '3rem', marginTop: '0.2rem', boxShadow: '0 0 12px rgba(196,150,26,0.5)' }} />
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5.5vw, 5rem)', color: 'var(--parchment)', lineHeight: 1.05, letterSpacing: '-0.01em', textShadow: '3px 3px 0 rgba(139,105,20,0.3), 0 0 60px rgba(242,232,160,0.08)' }}>{film.title}</h1>
                    </div>
                    {film.tagline && <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)', fontStyle: 'italic' }}>"{film.tagline}"</p>}

                    {/* Meta */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            <Clock size={10} style={{ display: 'inline', marginRight: '0.25rem' }} />{formatRuntime(film.runtime)}
                        </span>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{getYear(film.release_date)}</span>
                        {film.production_countries?.[0] && (
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                <Globe size={10} style={{ display: 'inline', marginRight: '0.25rem' }} />{film.production_countries[0].name}
                            </span>
                        )}
                        {film.production_companies?.some((c: any) => ['a24', 'neon', 'mubi', 'criterion'].some((l: any) => c.name.toLowerCase().includes(l))) && (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--ink)', background: 'var(--sepia)', padding: '0.1rem 0.4rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem', boxShadow: '0 0 10px rgba(139,105,20,0.5)' }}>
                                <Film size={8} /> PRESTIGE LABEL
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <ReelRating value={Math.round((film.vote_average || 0) / 2)} size="lg" />
                        <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--bone)' }}>{film.vote_average?.toFixed(1)} · {reviewText}</span>
                    </div>

                    <ObscurityBadge score={score} />

                    {director && (
                        <Link to={`/person/${director.id}`} style={{ textDecoration: 'none', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--bone)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--flicker)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--bone)'}
                        >
                            <span style={{ color: 'var(--fog)' }}>DIR.</span>
                            <span style={{ textDecoration: 'underline', textDecorationColor: 'var(--ash)' }}>{director.name}</span>
                            <span style={{ color: 'var(--fog)', fontSize: '0.5rem' }}><ArrowUpRight size={10} style={{ display: 'inline-block', verticalAlign: 'middle' }} /></span>
                        </Link>
                    )}

                    <div className="hero-cta-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        <button className="btn btn-primary" style={{ fontSize: '0.75rem' }} onClick={() => openLogModal(film, existingLog?.id)}>
                            <Plus size={14} /> {existingLog ? 'Edit Log' : 'Log This Film'}
                        </button>
                        {existingLog && (
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem', borderColor: 'rgba(139,105,20,0.5)', color: 'var(--sepia)' }} onClick={() => openLogModal(film)}>
                                <RotateCcw size={14} /> Log Rewatch{(existingLog?.viewCount || 1) > 1 ? ` (${(existingLog?.viewCount || 1) + 1})` : ''}
                            </button>
                        )}
                        {existingLog && (
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem', borderColor: 'var(--sepia)', color: 'var(--sepia)' }} onClick={() => setShowExport(true)}>
                                <Camera size={14} /> Export Dossier
                            </button>
                        )}
                        <button className={`btn ${isWatchlisted ? 'btn-danger' : 'btn-ghost'}`} style={{ fontSize: '0.75rem' }} onClick={toggleWatchlist}>
                            <Bookmark size={14} fill={isWatchlisted ? 'currentColor' : 'none'} />
                            {isWatchlisted ? 'In Watchlist' : 'Add to Watchlist'}
                        </button>
                        {!existingLog && (
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem', borderColor: 'rgba(139,105,20,0.4)', color: 'var(--bone)' }}
                                onClick={async () => {
                                    try {
                                        await markAsWatched(film)
                                        reelToast.success('Marked as watched!')
                                    } catch { }
                                }}
                            >
                                <Eye size={14} /> Mark Watched
                            </button>
                        )}
                        {trailer && (
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => onPlayTrailer(trailer.key)}>
                                <Play size={14} /> Watch Trailer
                            </button>
                        )}
                        {isArchivist && (
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem', borderColor: 'rgba(139,105,20,0.4)', color: 'var(--sepia)' }} onClick={() => setShowShareLounge(true)}>
                                <MessageCircle size={14} /> Share to Lounge
                            </button>
                        )}
                    </div>

                    {/* Existing log details + review + viewing chronicle (desktop) */}
                    {existingLog && (
                        <div style={{ background: 'linear-gradient(135deg, rgba(139,105,20,0.08), rgba(10,7,3,0.5))', border: '1px solid rgba(139,105,20,0.2)', borderRadius: 8, padding: '0.85rem 1.1rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: 520 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {(existingLog.rating ?? 0) > 0 && (
                                    <ReelRating value={existingLog.rating} size="sm" />
                                )}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)', textAlign: 'right' }}>
                                    {existingLog.watchedDate && new Date(existingLog.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {existingLog.watchedWith && <span> · ♡ {existingLog.watchedWith}</span>}
                                    {(existingLog.viewCount || 1) > 1 && <span> · <RotateCcw size={8} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> {existingLog.viewCount} viewings</span>}
                                </div>
                            </div>
                            {existingLog.review && (() => {
                                const stripped = existingLog.review.replace(/<[^>]+>/g, '').trim()
                                const isLong = stripped.length > 120
                                return (
                                    <Link to={`/log/${existingLog.id}`} style={{ textDecoration: 'none' }}>
                                        <p style={{
                                            fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)',
                                            lineHeight: 1.65, margin: '0.3rem 0 0', opacity: 0.8,
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                        }}>
                                            {stripped}
                                        </p>
                                        {isLong && (
                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginTop: '0.25rem', display: 'inline-block' }}>
                                                READ FULL CRITIQUE →
                                            </span>
                                        )}
                                    </Link>
                                )
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </div>
        )}

        {showExport && existingLog && <DossierExportModal film={film} log={existingLog} onClose={() => setShowExport(false)} />}
        {showShareLounge && (
            <ShareToLoungeModal
                payload={{
                    type: 'film_share',
                    title: film.title,
                    subtitle: film.release_date?.slice(0, 4),
                    image: film.poster_path ? `https://image.tmdb.org/t/p/w185${film.poster_path}` : undefined,
                    metadata: {
                        filmId: film.id,
                        title: film.title,
                        poster: film.poster_path,
                        year: film.release_date?.slice(0, 4),
                        rating: film.vote_average,
                    },
                }}
                onClose={() => setShowShareLounge(false)}
            />
        )}
        </>
    )
}
