import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Star, Globe, Bookmark, Plus, ArrowLeft, X, Film, Play, Tv, Camera } from 'lucide-react'
import { tmdb, obscurityScore, formatRuntime, getYear } from '../tmdb'
import { ReelRating, ObscurityBadge, GenreTags, FilmCard, LoadingReel, SectionHeader } from '../components/UI'
import { useSEOSync } from '../components/useSEOSync'
import { useUIStore, useFilmStore } from '../store'
import { supabase } from '../supabaseClient'
import toast from 'react-hot-toast'

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '3fd2be6f0c70a2a598f084ddfb75487c'
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

// ── COMMUNITY REVIEWS (Dynamic from Supabase) ──
function CommunityReviews({ filmId }) {
    const { logs } = useFilmStore()
    const { data: dbReviews } = useQuery({
        queryKey: ['film-reviews', filmId],
        queryFn: async () => {
            const { data } = await supabase
                .from('logs')
                .select('user_id, review, rating, created_at, profiles(username, role)')
                .eq('film_id', filmId)
                .not('review', 'is', null)
                .neq('review', '')
                .order('created_at', { ascending: false })
                .limit(6)
            return data || []
        },
        staleTime: 1000 * 60 * 5,
    })

    // Local user's review for this film (immediate feedback)
    const localReview = logs.find(l => (l.filmId === filmId || String(l.filmId) === String(filmId)) && l.review)

    const reviews = []
    if (localReview) {
        reviews.push({
            author: 'you', persona: 'Your Review',
            rating: localReview.rating, text: localReview.review, isLocal: true,
        })
    }
    if (dbReviews) {
        dbReviews.forEach(r => {
            if (!localReview || r.user_id !== localReview.userId) {
                reviews.push({
                    author: r.profiles?.username || 'anonymous',
                    persona: r.profiles?.role === 'auteur' ? 'Auteur' : r.profiles?.role === 'archivist' ? 'Archivist' : 'Cinephile',
                    rating: r.rating, text: r.review,
                })
            }
        })
    }

    if (reviews.length === 0) {
        reviews.push({ author: 'the_society', persona: 'The ReelHouse Society', rating: 0, text: 'No reviews yet. Be the first to share your thoughts on this film.' })
    }

    return (
        <div>
            <SectionHeader label="FROM THE CRITICS" title="Community Reviews" />
            {reviews.map((r, i) => (
                <div key={r.author + i} className="review-manuscript" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div>
                            <Link to={r.isLocal ? '#' : `/user/${r.author}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>@{r.author}</Link>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.08em', color: 'var(--fog)', marginTop: '0.15rem' }}>{r.persona}</div>
                        </div>
                        {r.rating > 0 && <ReelRating value={r.rating} size="sm" />}
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--bone)', lineHeight: 1.7, position: 'relative', zIndex: 1 }}>{r.text}</p>
                </div>
            ))}
        </div>
    )
}

// ── VIRAL EXPORT MODAL ──
function DossierExportModal({ film, log, onClose }) {
    if (!log) return null;
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', inset: 0, background: 'var(--ink)', zIndex: 50000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={onClose}
            >
                <div style={{ position: 'absolute', top: '3vh', textAlign: 'center', zIndex: 10 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2rem', color: 'var(--blood-reel)', marginBottom: '0.5rem' }}>● REC</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)' }}>Take a Screenshot to Declassify</div>
                </div>

                {/* The 9:16 Instagram Story Canvas */}
                <div style={{ width: '100%', maxWidth: '45vh', height: '80vh', maxHeight: 'max-content', minHeight: '600px', background: 'var(--soot)', position: 'relative', overflow: 'hidden', border: '1px solid var(--ash)', boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(139,105,20,0.15)', borderRadius: '4px' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${tmdb.poster(film.poster_path, 'w780')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'sepia(0.6) brightness(0.2) contrast(1.3)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ink) 25%, transparent 80%)' }} />

                    <div style={{ position: 'absolute', bottom: '2rem', left: '1.5rem', right: '1.5rem', zIndex: 2 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem', borderBottom: '1px solid rgba(139,105,20,0.3)', paddingBottom: '0.3rem' }}>REELHOUSE · DECLASSIFIED</div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 5vw, 2.8rem)', color: 'var(--parchment)', lineHeight: 1, margin: '0 0 0.5rem 0' }}>{film.title}</h2>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', marginBottom: '1rem' }}>{film.release_date?.slice(0, 4)} · DIR. {film.credits?.crew?.find(c => c.job === 'Director')?.name?.toUpperCase()}</div>
                        {log.rating > 0 && <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1.1rem', color: 'var(--flicker)', marginBottom: '1rem' }}>{'★'.repeat(Math.round(log.rating))}{'☆'.repeat(5 - Math.round(log.rating))}</div>}
                        <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{log.review || "Classified Analysis"}"</p>
                    </div>
                </div>

                <div style={{ position: 'absolute', bottom: '4vh', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--ash)' }}>
                    TAP ANYWHERE TO CLOSE
                </div>
            </motion.div>
        </AnimatePresence>
    )
}

// ── TRAILER MODAL ──
function TrailerModal({ trailerKey, onClose }) {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 50000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            >
                <motion.div
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.92, opacity: 0 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', maxWidth: 960, position: 'relative' }}
                >
                    {/* Close */}
                    <button onClick={onClose} style={{ position: 'absolute', top: -44, right: 0, background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--parchment)', padding: '0.4rem 0.75rem', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em' }}>
                        <X size={12} /> CLOSE
                    </button>
                    {/* Cinematic frame */}
                    <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000', borderRadius: '2px', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(139,105,20,0.3), 0 40px 80px rgba(0,0,0,0.8)' }}>
                        <iframe
                            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&color=white`}
                            title="Trailer"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                            allowFullScreen
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                        />
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '0.75rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--fog)' }}>
                        OFFICIAL TRAILER
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

// ── DIRECTOR FILMOGRAPHY PANEL ──
function DirectorPanel({ director, onClose }) {
    const { logs } = useFilmStore()
    const { data: filmography, isLoading } = useQuery({
        queryKey: ['person-films', director.id],
        queryFn: async () => {
            const res = await fetch(`https://api.themoviedb.org/3/person/${director.id}/movie_credits?api_key=${TMDB_API_KEY}`)
            const data = await res.json()
            return (data.crew || []).filter(f => f.job === 'Director' && f.poster_path).sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
        },
        staleTime: 1000 * 60 * 30,
    })

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 20000 }} />
            <motion.div
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 20001, width: 'min(420px, 95vw)', background: 'var(--soot)', borderLeft: '1px solid var(--ash)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
            >
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--ash)', position: 'sticky', top: 0, background: 'var(--soot)', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, paddingRight: '1rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.3rem' }}>DIRECTOR DOSSIER</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', lineHeight: 1.2 }}>{director.name}</div>
                        {filmography && (() => {
                            const seenCount = logs.filter(l => filmography.some(f => f.id === l.filmId)).length
                            const pct = Math.round((seenCount / Math.max(filmography.length, 1)) * 100)
                            return (
                                <div style={{ marginTop: '0.75rem' }}>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span>THE AUTEUR HUNT</span><span>{seenCount} OF {filmography.length} SEEN</span>
                                    </div>
                                    <div style={{ height: 2, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--sepia)', transition: 'width 1s ease-out' }} />
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fog)', padding: '0.25rem', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 72, background: 'var(--ash)', borderRadius: 'var(--radius-card)', opacity: 1 - i * 0.12 }} />) :
                        filmography?.map((film) => (
                            <Link key={film.id} to={`/film/${film.id}`} onClick={onClose}
                                style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.6rem', textDecoration: 'none', borderRadius: 'var(--radius-card)', border: '1px solid transparent', transition: 'border-color 0.2s, background 0.2s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                            >
                                <img src={tmdb.poster(film.poster_path, 'w92')} alt={film.title} decoding="async" loading="lazy" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: '2px', filter: 'sepia(0.3)', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: logs.some(l => l.filmId === film.id) ? 'var(--parchment)' : 'var(--bone)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {film.title}{logs.some(l => l.filmId === film.id) && <span style={{ color: 'var(--sepia)', fontSize: '0.6rem' }}>✓</span>}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.15rem' }}>{film.release_date?.slice(0, 4) || '—'}</div>
                                </div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--sepia)', flexShrink: 0 }}>{film.vote_average > 0 ? film.vote_average.toFixed(1) + ' ★' : ''}</div>
                            </Link>
                        ))
                    }
                </div>
            </motion.div>
        </AnimatePresence>
    )
}

// ── STREAMING PROVIDERS SECTION ──
function WatchProviders({ providers }) {
    const countryData = providers ? (providers['US'] || providers[Object.keys(providers)[0]]) : null

    const flatrate = countryData?.flatrate || []
    const rent = countryData?.rent || []
    const buy = countryData?.buy || []
    const hasAny = flatrate.length > 0 || rent.length > 0 || buy.length > 0
    const link = countryData?.link

    const ProviderLogo = ({ p, link }) => (
        <a href={link} target="_blank" rel="noopener noreferrer" title={`Watch on ${p.provider_name}`} style={{ flexShrink: 0, textDecoration: 'none', transition: 'transform 0.2s', display: 'block', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
            {p.logo_path ? (
                <img
                    src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                    alt={p.provider_name}
                    style={{ width: 38, height: 38, borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(139,105,20,0.3)', display: 'block', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}
                />
            ) : (
                <div style={{ width: 38, height: 38, borderRadius: '8px', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.45rem', color: 'var(--fog)', textAlign: 'center', padding: '2px', border: '1px solid rgba(139,105,20,0.3)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                    {p.provider_name}
                </div>
            )}
        </a>
    )

    return (
        <div className="card glass-panel">
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tv size={12} /> WHERE TO WATCH
            </div>

            {!hasAny ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', borderRadius: 'var(--radius-card)', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.05)' }}>
                    <Tv size={24} color="var(--fog)" style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', marginBottom: '0.4rem' }}>
                        Not Currently Streaming
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', lineHeight: 1.4, maxWidth: 300, margin: '0 auto' }}>
                        This film isn't available on any streaming platform right now. It may be in theaters, on physical media, or waiting to resurface.
                    </div>
                </div>
            ) : (
                <>
                    {flatrate.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--fog)', marginBottom: '0.6rem' }}>STREAM FREE</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                {flatrate.slice(0, 6).map(p => <ProviderLogo key={p.provider_id} p={p} link={link} />)}
                            </div>
                        </div>
                    )}

                    {rent.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--fog)', marginBottom: '0.6rem' }}>RENT</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                {rent.slice(0, 6).map(p => <ProviderLogo key={p.provider_id} p={p} link={link} />)}
                            </div>
                        </div>
                    )}

                    {buy.length > 0 && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--fog)', marginBottom: '0.6rem' }}>BUY</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                {buy.slice(0, 4).map(p => <ProviderLogo key={p.provider_id} p={p} link={link} />)}
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>DATA BY JUSTWATCH</span>
                        {link && (
                            <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sepia)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--sepia)'}>
                                VIEW ALL OPTIONS →
                            </a>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

// ── COUNTRY RELEASES ──
function CountryReleases({ releaseDates }) {
    const [expanded, setExpanded] = useState(false)
    if (!releaseDates?.results?.length) return null

    const releases = releaseDates.results
        .filter(r => r.release_dates?.some(d => d.type <= 3))
        .sort((a, b) => {
            // US first, then alphabetical
            if (a.iso_3166_1 === 'US') return -1
            if (b.iso_3166_1 === 'US') return 1
            return a.iso_3166_1.localeCompare(b.iso_3166_1)
        })

    const visible = expanded ? releases : releases.slice(0, 6)

    const types = { 1: 'PREMIERE', 2: 'LIMITED', 3: 'THEATRICAL', 4: 'DIGITAL', 5: 'PHYSICAL', 6: 'TV' }

    return (
        <div className="card">
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Globe size={12} /> INTERNATIONAL RELEASES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {visible.map(({ iso_3166_1, release_dates }) => {
                    const mainRelease = release_dates.find(d => d.type === 3) || release_dates[0]
                    if (!mainRelease?.release_date) return null
                    const date = new Date(mainRelease.release_date)
                    const cert = mainRelease.certification
                    return (
                        <div key={iso_3166_1} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', minWidth: 28, fontWeight: 'bold' }}>{iso_3166_1}</span>
                                {cert && (
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.08em', color: 'var(--ink)', background: 'var(--fog)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>{cert}</span>
                                )}
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.06em', color: 'var(--ash)' }}>{types[mainRelease.type] || ''}</span>
                            </div>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--bone)' }}>
                                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                    )
                })}
            </div>
            {releases.length > 6 && (
                <button onClick={() => setExpanded(!expanded)} style={{ marginTop: '0.75rem', width: '100%', background: 'transparent', border: '1px dashed var(--ash)', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', padding: '0.5rem', borderRadius: '2px', cursor: 'pointer' }}>
                    {expanded ? `↑ SHOW LESS` : `↓ ${releases.length - 6} MORE COUNTRIES`}
                </button>
            )}
        </div>
    )
}

// ── FILM HERO ──
function FilmHero({ film, onPlayTrailer }) {
    const { openLogModal } = useUIStore()
    const { watchlist, addToWatchlist, removeFromWatchlist, logs } = useFilmStore()
    const [showExport, setShowExport] = useState(false)
    const isWatchlisted = watchlist.some(f => f.id === film.id)
    const score = obscurityScore(film)
    const director = film.credits?.crew?.find(c => c.job === 'Director')
    const trailer = film.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')
        || film.videos?.results?.find(v => v.site === 'YouTube')
    const existingLog = logs.find(l => l.filmId === film.id || String(l.filmId) === String(film.id))
    const statusLabel = { watched: '✓ WATCHED', rewatched: '↩ REWATCHED', abandoned: '✕ ABANDONED' }

    const toggleWatchlist = () => {
        if (isWatchlisted) { removeFromWatchlist(film.id); toast(`Removed from watchlist`) }
        else { addToWatchlist(film); toast.success(`Added to watchlist!`) }
    }

    return (
        <div style={{ position: 'relative', minHeight: IS_TOUCH ? '60vh' : '70vh', display: 'flex', alignItems: 'flex-end', paddingBottom: IS_TOUCH ? '2rem' : '3rem' }}>
            {/* Backdrop */}
            {film.backdrop_path && (
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${tmdb.backdrop(film.backdrop_path)})`, backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'sepia(0.5) brightness(0.25) contrast(1.15)', zIndex: 0 }} />
            )}
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ink) 30%, rgba(10,7,3,0.5) 70%, transparent)', zIndex: 1 }} />

            {/* Trailer play button overlay on backdrop */}
            {trailer && !IS_TOUCH && (
                <button onClick={() => onPlayTrailer(trailer.key)}
                    style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2, background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(139,105,20,0.6)', borderRadius: '50%', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s', backdropFilter: 'blur(4px)' }}
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
                                <img src={tmdb.poster(film.poster_path, 'w342')} alt={film.title} fetchPriority="high" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.2) contrast(1.1)' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: 'var(--soot)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)' }}>NO POSTER</span>
                                </div>
                            )}
                        </div>
                        {existingLog && (
                            <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: 'linear-gradient(135deg, rgba(139,105,20,0.12), rgba(10,7,3,0.8))', border: '1px solid rgba(139,105,20,0.3)', borderRadius: 'var(--radius-card)', borderLeft: '2px solid var(--sepia)' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.3rem' }}>{statusLabel[existingLog.status] || '✓ LOGGED'}</div>
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
                        {film.production_companies?.some(c => ['a24', 'neon', 'mubi', 'criterion'].some(l => c.name.toLowerCase().includes(l))) && (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--ink)', background: 'var(--sepia)', padding: '0.1rem 0.4rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem', boxShadow: '0 0 10px rgba(139,105,20,0.5)' }}>
                                <Film size={8} /> PRESTIGE LABEL
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <ReelRating value={Math.round((film.vote_average || 0) / 2)} size="lg" />
                        <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--bone)' }}>{film.vote_average?.toFixed(1)} · {film.vote_count?.toLocaleString()} votes</span>
                    </div>

                    <ObscurityBadge score={score} />

                    {director && (
                        <Link to={`/person/${director.id}`} style={{ textDecoration: 'none', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--bone)', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'none' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--flicker)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--bone)'}
                        >
                            <span style={{ color: 'var(--fog)' }}>DIR.</span>
                            <span style={{ textDecoration: 'underline', textDecorationColor: 'var(--ash)' }}>{director.name}</span>
                            <span style={{ color: 'var(--fog)', fontSize: '0.5rem' }}>↗</span>
                        </Link>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
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

// ── FILM DETAILS ──
function FilmDetails({ film }) {
    const director = film.credits?.crew?.find(c => c.job === 'Director')
    const cast = film.credits?.cast?.slice(0, 8) || []

    // Grab all trailers + teasers for a richer video section
    const allVideos = film.videos?.results?.filter(v => v.site === 'YouTube') || []
    const trailer = allVideos.find(v => v.type === 'Trailer') || allVideos[0]
    const [activeVideo, setActiveVideo] = useState(null)

    // Watch providers (already in detail via append_to_response)
    const providers = film['watch/providers']?.results || null

    // Studios
    const studios = film.production_companies || []

    return (
        <div className="layout-sidebar reversed">
            <div className="teletype-container" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.75rem' }}>
                            {cast.map(member => (
                                <Link key={member.id} to={`/person/${member.id}`} style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit', display: 'block', cursor: 'none' }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', overflow: 'hidden', background: 'var(--ash)', marginBottom: '0.4rem', border: '1px solid var(--ash)', transition: 'transform 0.2s' }}>
                                        {member.profile_path ? (
                                            <img src={tmdb.profile(member.profile_path)} alt={member.name} decoding="async" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.4)' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)' }}>
                                                <Film size={24} opacity={0.3} />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.7rem', color: 'var(--parchment)', lineHeight: 1.2 }}>{member.name}</div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.05em', color: 'var(--fog)', marginTop: '0.1rem' }}>{member.character}</div>
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
                            {allVideos.slice(0, 6).map(v => (
                                <button key={v.id} onClick={() => setActiveVideo(v.key)}
                                    style={{ flexShrink: 0, width: 200, background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '2px', cursor: 'pointer', overflow: 'hidden', textAlign: 'left', padding: 0, position: 'relative' }}
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
                        {activeVideo && <TrailerModal trailerKey={activeVideo} onClose={() => setActiveVideo(null)} />}
                    </div>
                )}

                {/* Reviews — Dynamic from Supabase, fallback to curated */}
                <CommunityReviews filmId={film.id} />
            </div>

            {/* Sidebar */}
            <div className="teletype-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Trailer — desktop inline card */}
                {trailer && !IS_TOUCH && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setActiveVideo(trailer.key)}
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
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>OFFICIAL TRAILER</div>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.2 }}>{trailer.name}</div>
                        </div>
                    </div>
                )}

                {/* Director */}
                {director && (
                    <Link to={`/person/${director.id}`} className="card" style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>DIRECTED BY</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)' }}>{director.name}</div>
                    </Link>
                )}

                {/* Streaming Providers */}
                <WatchProviders providers={providers} />

                {/* Film Dossier */}
                <div className="card glass-panel">
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '1rem' }}>FILM DOSSIER</div>
                    {[
                        { label: 'GENRES', value: film.genres?.map(g => g.name).join(', ') },
                        { label: 'RELEASE', value: film.release_date },
                        { label: 'RUNTIME', value: formatRuntime(film.runtime) },
                        { label: 'STATUS', value: film.status },
                        { label: 'LANGUAGE', value: film.original_language?.toUpperCase() },
                        { label: 'BUDGET', value: film.budget > 0 ? `$${(film.budget / 1e6).toFixed(1)}M` : 'Unknown' },
                        { label: 'REVENUE', value: film.revenue > 0 ? `$${(film.revenue / 1e6).toFixed(1)}M` : 'Unknown' },
                    ].map(({ label, value }) => (
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
                            {studios.slice(0, 5).map(studio => (
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
    const [trailerKey, setTrailerKey] = useState(null)

    const { data: film, isLoading, error } = useQuery({
        queryKey: ['film', id],
        queryFn: () => tmdb.detail(id),
        enabled: !!id,
        staleTime: 1000 * 60 * 10,
    })

    const { data: similar } = useQuery({
        queryKey: ['film-similar', id],
        queryFn: () => tmdb.similar(id),
        enabled: !!id,
        staleTime: 1000 * 60 * 10,
    })

    // Dynamically inject SEO & Social tags once loaded
    useSEOSync(
        film ? `${film.title} (${film.release_date?.slice(0, 4) || 'Unknown'})` : null,
        film?.overview?.substring(0, 160),
        film?.poster_path ? tmdb.poster(film.poster_path, 'w500') : null
    )

    if (isLoading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
            <LoadingReel />
        </div>
    )
    if (error || !film) return (
        <div style={{ paddingTop: 80, textAlign: 'center', padding: '4rem' }}>
            <p style={{ fontFamily: 'var(--font-sub)', color: 'var(--fog)' }}>Film not found in the archive.</p>
        </div>
    )

    return (
        <div className="page-top">
            <FilmHero film={film} onPlayTrailer={setTrailerKey} />
            {trailerKey && <TrailerModal trailerKey={trailerKey} onClose={() => setTrailerKey(null)} />}
            <main style={{ background: 'var(--ink)', paddingBottom: '5rem' }}>
                <div className="container" style={{ paddingTop: '3rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    <button onClick={() => {
                        navigate(-1)
                    }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', marginLeft: '-0.5rem', alignSelf: 'flex-start', transition: 'color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>
                        <ArrowLeft size={12} /> GO BACK
                    </button>
                    <FilmDetails film={film} />

                    {Array.isArray(similar) && similar.length > 0 && (
                        <section>
                            <div className="divider">✦ YOU MAY ALSO LIKE ✦</div>
                            <div style={{ marginTop: '2rem' }}>
                                <SectionHeader label="SIMILAR FILMS" title="You May Also Like" />
                                <div style={IS_TOUCH ? { display: 'flex', gap: '1rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '1rem', marginLeft: '-1.25rem', paddingLeft: '1.25rem' } : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                                    {similar.slice(0, IS_TOUCH ? 10 : 6).map(f => (
                                        <Link key={f.id} to={`/film/${f.id}`} style={IS_TOUCH ? { flexShrink: 0, width: 120, display: 'block', textDecoration: 'none' } : { textDecoration: 'none' }}>
                                            <FilmCard film={f} />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </div>
    )
}
