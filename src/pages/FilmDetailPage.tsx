import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Star, Globe, Bookmark, Plus, ArrowLeft, X, Film, Play, Tv, Camera, ArrowUpRight, Check, RotateCcw } from 'lucide-react'
import { tmdb, obscurityScore, formatRuntime, getYear } from '../tmdb'
import { ReelRating, ObscurityBadge, GenreTags, FilmCard, LoadingReel, SectionHeader } from '../components/UI'
import { useSEOSync } from '../components/useSEOSync'
import { useUIStore, useFilmStore, useAuthStore } from '../store'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'
import SectionErrorBoundary from '../components/SectionErrorBoundary'

const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

import CommunityReviews from '../components/film/CommunityReviews'
import PageSEO from '../components/PageSEO'
import DossierExportModal from '../components/film/DossierExportModal'
import TrailerModal from '../components/film/TrailerModal'
import DirectorPanel from '../components/film/DirectorPanel'
import WatchProviders from '../components/film/WatchProviders'
import CountryReleases from '../components/film/CountryReleases'
import Poster from '../components/film/Poster'
import CriticsBooth from '../components/film/CriticsBooth'



// ── FILM HERO ──
function FilmHero({ film, onPlayTrailer }: any) {
    const { openLogModal } = useUIStore()
    const { watchlist, addToWatchlist, removeFromWatchlist, logs } = useFilmStore()
    const [showExport, setShowExport] = useState(false)
    const isWatchlisted = watchlist.some((f: any) => f.id === film.id)
    const score = obscurityScore(film)
    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')
    const trailer = film.videos?.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
        || film.videos?.results?.find((v: any) => v.site === 'YouTube')
    const existingLog = logs.find((l: any) => l.filmId === film.id || String(l.filmId) === String(film.id))
    const statusLabel: any = { watched: <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> WATCHED</>, rewatched: <><RotateCcw size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /> REWATCHED</>, abandoned: <><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> ABANDONED</> }

    // --- Smart Review Count Fallback ---
    const { data: localCount = 0 } = useQuery({
        queryKey: ['local-reviews', film?.id],
        queryFn: async () => {
            if (!film?.id) return 0
            const { count } = await supabase.from('logs').select('*', { count: 'exact', head: true }).eq('film_id', film.id)
            return count || 0
        },
        enabled: !!film?.id
    })
    
    const reviewText = localCount > 0 
        ? `${localCount} SOCIETY REVIEW${localCount === 1 ? '' : 'S'}`
        : `${Math.round((film?.vote_count || 0) / 100) * 100}+ GLOBAL RATINGS`

    const toggleWatchlist = async () => {
        if (isWatchlisted) { removeFromWatchlist(film.id); toast(`Removed from watchlist`) }
        else {
            try { await addToWatchlist(film); toast.success(`Added to watchlist!`) }
            catch { toast.error('Failed to add to watchlist') }
        }
    }

    return (
        <div style={{ position: 'relative', minHeight: IS_TOUCH ? 'auto' : '70vh', display: 'flex', alignItems: 'flex-end', paddingBottom: IS_TOUCH ? '1.5rem' : '3rem', flexShrink: 0 }}>
            {/* Backdrop */}
            {film.backdrop_path && (
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${tmdb.backdrop(film.backdrop_path)})`, backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'sepia(0.5) brightness(0.25) contrast(1.15)', zIndex: 0 }} />
            )}
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ink) 15%, rgba(10,7,3,0.85) 45%, rgba(10,7,3,0.2) 80%, transparent)', zIndex: 1 }} />

            {/* Trailer play button overlay on backdrop */}
            {trailer && !IS_TOUCH && (
                <button className="hero-play-overlay" onClick={() => onPlayTrailer(trailer.key)}
                    style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2, background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(139,105,20,0.6)', borderRadius: '50%', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s', backdropFilter: 'blur(4px)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.3)'; e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)'; e.currentTarget.style.borderColor = 'rgba(139,105,20,0.6)'; e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)' }}
                >
                    <Play size={24} fill="rgba(242,232,160,0.9)" color="transparent" />
                </button>
            )}

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
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.3rem' }}>{statusLabel[existingLog.status] || <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> LOGGED</>}</div>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '0.5rem' : '0.75rem' }}>
                    <GenreTags genres={film.genres} />
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 3rem)', color: 'var(--parchment)', lineHeight: 1.1 }}>{film.title}</h1>
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
                            <span style={{ color: 'var(--fog)', fontSize: '0.5rem' }}><ArrowUpRight size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>
                        </Link>
                    )}

                    <div className="hero-cta-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        <button className="btn btn-primary" style={{ fontSize: '0.75rem' }} onClick={() => openLogModal(film)}>
                            <Plus size={14} /> {existingLog ? 'Edit Log' : 'Log This Film'}
                        </button>
                        {existingLog && (
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem', borderColor: 'var(--sepia)', color: 'var(--sepia)' }} onClick={() => setShowExport(true)}>
                                <Camera size={14} /> Export Dossier
                            </button>
                        )}
                        <button className={`btn ${isWatchlisted ? 'btn-danger' : 'btn-ghost'}`} style={{ fontSize: '0.75rem' }} onClick={toggleWatchlist}>
                            <Bookmark size={14} fill={isWatchlisted ? 'currentColor' : 'none'} />
                            {isWatchlisted ? 'In Watchlist' : 'Add to Watchlist'}
                        </button>
                        {/* Mobile trailer button */}
                        {trailer && IS_TOUCH && (
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => onPlayTrailer(trailer.key)}>
                                <Play size={14} /> Watch Trailer
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {showExport && existingLog && <DossierExportModal film={film} log={existingLog} onClose={() => setShowExport(false)} />}
        </div>
    )
}

function FilmDetails({ film, onPlayVideo }: any) {
    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')
    const cast = film.credits?.cast?.slice(0, 8) || []

    // Grab all trailers + teasers for a richer video section
    const allVideos = film.videos?.results?.filter((v: any) => v.site === 'YouTube') || []
    const trailer = allVideos.find((v: any) => v.type === 'Trailer') || allVideos[0]

    // Watch providers (already in detail via append_to_response)
    const providers = film['watch/providers']?.results || null

    // Studios
    const studios = film.production_companies || []

    return (
        <div className="layout-sidebar reversed">
            <div className="teletype-container" style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '1.5rem' : '2.5rem' }}>
                <div>
                    <SectionHeader label="SYNOPSIS" title="About the Film" />
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', lineHeight: 1.8 }}>
                        {film.overview || 'No synopsis available.'}
                    </p>
                </div>

                {/* Cast */}
                {cast.length > 0 && (
                    <div>
                        <SectionHeader label="CAST" title="The Players" />
                        <div className="cast-grid">
                            {cast.map((member: any) => (
                                <Link key={member.id} to={`/person/${member.id}`} className="cast-item"
                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <div className="cast-photo">
                                        {member.profile_path ? (
                                            <img src={tmdb.profile(member.profile_path) || undefined} alt={member.name} decoding="async" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.4)' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)' }}>
                                                <Film size={24} opacity={0.3} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="cast-name">{member.name}</div>
                                    <div className="cast-role">{member.character}</div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Videos / Extra Trailers */}
                {allVideos.length > 1 && (
                    <div>
                        <SectionHeader label="FOOTAGE" title="More Videos" />
                        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '0.5rem', marginLeft: IS_TOUCH ? '-1.25rem' : 0, paddingLeft: IS_TOUCH ? '1.25rem' : 0 }}>
                            {allVideos.slice(0, 6).map((v: any) => (
                                <button key={v.id} onClick={() => onPlayVideo(v.key)}
                                    style={{ flexShrink: 0, width: IS_TOUCH ? 160 : 200, background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '2px', cursor: 'pointer', overflow: 'hidden', textAlign: 'left', padding: 0, position: 'relative' }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}
                                >
                                    <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                                        <img src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3)', display: 'block' }} />
                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(139,105,20,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Play size={14} fill="rgba(242,232,160,0.9)" color="transparent" />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.5rem 0.6rem' }}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>{v.type?.toUpperCase()}</div>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.65rem', color: 'var(--bone)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        {/* TrailerModal is lifted to page root to avoid stacking context issues */}
                    </div>
                )}

                {/* Reviews — Dynamic from Supabase, fallback to curated */}
                <CommunityReviews filmId={film.id} />
            </div>

            {/* Sidebar */}
            <div className="teletype-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Trailer — desktop inline card */}
                {trailer && !IS_TOUCH && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => onPlayVideo(trailer.key)}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}
                    >
                        <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                            <img src={`https://img.youtube.com/vi/${trailer.key}/mqdefault.jpg`} alt="Trailer" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3)', display: 'block', transition: 'transform 0.4s ease', transform: 'scale(1.02)' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(10,7,3,0.8)', border: '2px solid rgba(139,105,20,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(139,105,20,0.3)' }}>
                                    <Play size={20} fill="rgba(242,232,160,0.95)" color="transparent" />
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '0.75rem 1rem' }}>
                            <div className="ui-micro" style={{ color: 'var(--sepia)', marginBottom: '0.2rem' }}>OFFICIAL TRAILER</div>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.2 }}>{trailer.name}</div>
                        </div>
                    </div>
                )}

                {/* Director */}
                {director && (
                    <Link to={`/person/${director.id}`} className="card" style={{ textDecoration: 'none', display: 'block' }}>
                        <div className="section-title" style={{ marginBottom: '0.5rem' }}>DIRECTED BY</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)' }}>{director.name}</div>
                    </Link>
                )}

                {/* Streaming Providers */}
                <WatchProviders providers={providers} />

                {/* Film Dossier */}
                <div className="card glass-panel">
                    <div className="section-title">FILM DOSSIER</div>
                    {[
                        { label: 'GENRES', value: film.genres?.map((g: any) => g.name).join(', ') },
                        { label: 'RELEASE', value: film.release_date ? new Date(film.release_date + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : '—' },
                        { label: 'RUNTIME', value: formatRuntime(film.runtime) },
                        { label: 'STATUS', value: film.status },
                        { label: 'LANGUAGE', value: film.original_language?.toUpperCase() },
                        { label: 'BUDGET', value: film.budget > 0 ? `$${(film.budget / 1e6).toFixed(1)}M` : 'Unknown' },
                        { label: 'REVENUE', value: film.revenue > 0 ? `$${(film.revenue / 1e6).toFixed(1)}M` : 'Unknown' },
                    ].map(({ label, value }: any) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ash)' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{label}</span>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)' }}>{value || '—'}</span>
                        </div>
                    ))}
                </div>

                {/* Production Studios */}
                {studios.length > 0 && (
                    <div className="card glass-panel">
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Film size={12} /> PRODUCTION STUDIOS
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {studios.slice(0, 5).map((studio: any) => (
                                <div key={studio.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    {studio.logo_path ? (
                                        <div style={{ width: 40, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', padding: '2px' }}>
                                            <img src={`https://image.tmdb.org/t/p/w185${studio.logo_path}`} alt={studio.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'brightness(0.8) sepia(0.2)' }} />
                                        </div>
                                    ) : (
                                        <div style={{ width: 40, height: 24, flexShrink: 0, background: 'var(--ash)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Film size={10} color="var(--fog)" />
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.2 }}>{studio.name}</div>
                                        {studio.origin_country && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.1rem' }}>{studio.origin_country}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Country Releases */}
                <CountryReleases releaseDates={film.release_dates} />
            </div>
        </div>
    )
}

// ── Main Page Export ──
export default function FilmDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const [activeVideo, setActiveVideo] = useState<any>(null)

    // Single handler — both the hero play button and FilmDetails video pickers route here
    const handlePlayVideo = (key: any) => setActiveVideo(key)

    const { data: film, isLoading, error } = useQuery({
        queryKey: ['film', id],
        queryFn: () => tmdb.detail(Number(id!)),
        enabled: !!id && !isNaN(Number(id)),
        staleTime: 1000 * 60 * 10,
    })

    const { data: similar } = useQuery({
        queryKey: ['film-similar', id],
        queryFn: () => tmdb.similar(Number(id!)),
        enabled: !!id && !isNaN(Number(id)),
        staleTime: 1000 * 60 * 10,
    })

    // Dynamically inject SEO & Social tags once loaded
    useSEOSync(
        film ? `${film.title} (${film.release_date?.slice(0, 4) || 'Unknown'})` : undefined,
        film?.overview?.substring(0, 160) || undefined,
        film?.poster_path ? (tmdb.poster(film.poster_path, 'w500') ?? undefined) : undefined
    )

    if (isLoading) return (
        <div style={{ minHeight: '100dvh', background: 'var(--ink)' }}>
            {/* Hero skeleton */}
            <div style={{ height: '70vh', position: 'relative', overflow: 'hidden' }}>
                <div className="shimmer" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ink) 30%, transparent 70%)' }} />
                <div className="container" style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', alignItems: 'flex-end', paddingBottom: '3rem' }}>
                    <div className="hero-grid" style={{ width: '100%' }}>
                        <div>
                            <div className="shimmer" style={{ width: '100%', maxWidth: 220, aspectRatio: '2/3', borderRadius: '2px' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'flex-end' }}>
                            <div className="shimmer" style={{ height: '2.5rem', width: '60%', borderRadius: '2px' }} />
                            <div className="shimmer" style={{ height: '1rem', width: '35%', borderRadius: '2px' }} />
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <div className="shimmer" style={{ height: '2rem', width: 100, borderRadius: '2px' }} />
                                <div className="shimmer" style={{ height: '2rem', width: 100, borderRadius: '2px' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Content skeleton */}
            <div className="container" style={{ paddingTop: '3rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="shimmer" style={{ height: '0.7rem', width: '15%', borderRadius: '2px' }} />
                <div className="shimmer" style={{ height: '1.2rem', width: '30%', borderRadius: '2px' }} />
                {[1, 2, 3].map(i => <div key={i} className="shimmer" style={{ height: '0.8rem', width: `${90 - i * 15}%`, borderRadius: '2px' }} />)}
            </div>
        </div>
    )
    if (error || !film) return (
        <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ textAlign: 'center', border: '1px solid var(--ash)', padding: IS_TOUCH ? '2rem 1.5rem' : '4rem 3rem', maxWidth: 440, background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: 'var(--ash)', marginBottom: '1.5rem', lineHeight: 1 }}>∅</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginBottom: '0.75rem' }}>Not in the Archive</div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', lineHeight: 1.6 }}>This reel could not be found. It may have been withdrawn from circulation.</p>
            </div>
        </div>
    )

    return (
        <div className="page-top" style={{
            ...(IS_TOUCH
                ? { minHeight: '100dvh', overflowX: 'hidden' as const, position: 'relative' as const, background: 'var(--ink)' }
                : { height: '100dvh', overflow: 'hidden' as const, display: 'flex', flexDirection: 'column' as const, position: 'relative' as const, background: 'var(--ink)' }
            ),
        }}>
            {/* ── THE AMBIENT ZERO-JS COLOR GLOW ── */}
            {film?.poster_path && (
                <div style={{
                    position: 'fixed', inset: '-20%', zIndex: 0, pointerEvents: 'none',
                    backgroundImage: `url(${tmdb.poster(film.poster_path, 'w500')})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    filter: 'blur(100px) saturate(1.8) brightness(0.7) opacity(0.35)',
                    maskImage: 'radial-gradient(circle at 50% 10%, black 0%, transparent 60%)',
                    WebkitMaskImage: 'radial-gradient(circle at 50% 10%, black 0%, transparent 60%)'
                }} />
            )}
            
            <div style={{ position: 'relative', zIndex: 1, ...(IS_TOUCH ? {} : { height: '100%', display: 'flex', flexDirection: 'column' as const }) }}>
                <FilmHero film={film} onPlayTrailer={handlePlayVideo} />
                {/* Single TrailerModal rendered at root — above all stacking contexts */}
                {activeVideo && <TrailerModal trailerKey={activeVideo} onClose={() => setActiveVideo(null)} />}
            <main id="film-details-scroller" style={{
                ...(IS_TOUCH
                    ? { paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))', background: 'transparent' }
                    : { flex: 1, overflowY: 'auto' as const, overscrollBehavior: 'contain' as const, WebkitOverflowScrolling: 'touch' as any, paddingBottom: '3rem', background: 'transparent' }
                ),
            }}>
                <div className="container" style={{ paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    <button onClick={() => {
                        navigate(-1)
                    }} className="back-btn">
                        <ArrowLeft size={12} /> GO BACK
                    </button>
                    <FilmDetails film={film} onPlayVideo={handlePlayVideo} />

                    <SectionErrorBoundary label="VIDEO REVIEWS">
                        <CriticsBooth filmId={film.id} />
                    </SectionErrorBoundary>

                    <SectionErrorBoundary label="SIMILAR FILMS">
                    {Array.isArray(similar) && similar.length > 0 && (
                        <section>
                            <div style={{ marginTop: '2rem' }}>
                                <SectionHeader label="SIMILAR FILMS" title="You May Also Like" />
                                <div style={IS_TOUCH ? { display: 'flex', gap: '1rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '1rem', marginLeft: '-1.25rem', paddingLeft: '1.25rem' } : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                                    {similar.slice(0, IS_TOUCH ? 10 : 6).map((f: any) => (
                                        <Link key={f.id} to={`/film/${f.id}`} style={IS_TOUCH ? { flexShrink: 0, width: 120, display: 'block', textDecoration: 'none' } : { textDecoration: 'none' }}>
                                            <FilmCard film={f} />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}
                    </SectionErrorBoundary>
                </div>
            </main>
            </div>
        </div>
    )
}
