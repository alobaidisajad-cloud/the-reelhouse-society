import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Star, Globe, Bookmark, Plus, ArrowLeft, X, Film, Play, Tv, Camera, ArrowUpRight, Check, RotateCcw, Eye, EyeOff, MessageCircle } from 'lucide-react'
import { tmdb, obscurityScore, formatRuntime, getYear } from '../tmdb'
import { ReelRating, ObscurityBadge, GenreTags, FilmCard, LoadingReel, SectionHeader, PersonPlaceholder } from '../components/UI'
import { useSEOSync } from '../components/useSEOSync'
import { useUIStore, useFilmStore, useAuthStore } from '../store'
import { supabase } from '../supabaseClient'
import reelToast from '../utils/reelToast'
import SectionErrorBoundary from '../components/SectionErrorBoundary'

import { useViewport } from '../hooks/useViewport'

import CommunityReviews from '../components/film/CommunityReviews'
import PageSEO from '../components/PageSEO'
import DossierExportModal from '../components/film/DossierExportModal'
import TrailerModal from '../components/film/TrailerModal'
import DirectorPanel from '../components/film/DirectorPanel'
import WatchProviders from '../components/film/WatchProviders'
import CountryReleases from '../components/film/CountryReleases'
import Poster from '../components/film/Poster'
import ViewingChronicle from '../components/film/ViewingChronicle'

import ShareToLoungeModal from '../components/ShareToLoungeModal'
import type { SharePayload } from '../components/ShareToLoungeModal'



import { FilmHero } from '../features/film/components/FilmHero'
import { FilmDetailsSection, ViewingChronicleSection } from '../features/film/components/FilmDetailsSection'

// ── Main Page Export ──
export default function FilmDetailPage() {
    const { isTouch: IS_TOUCH } = useViewport()
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

    // Dynamically inject SEO & Social tags + JSON-LD Movie schema
    const director = film?.credits?.crew?.find((c: any) => c.job === 'Director')
    useSEOSync(
        film ? `${film.title} (${film.release_date?.slice(0, 4) || 'Unknown'})` : undefined,
        film?.overview?.substring(0, 160) || undefined,
        film?.poster_path ? (tmdb.poster(film.poster_path, 'w500') ?? undefined) : undefined,
        film ? {
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'Movie',
                name: film.title,
                url: `https://thereelhousesociety.com/film/${film.id}`,
                image: film.poster_path ? tmdb.poster(film.poster_path, 'w500') : undefined,
                description: film.overview?.substring(0, 300),
                datePublished: film.release_date,
                duration: film.runtime ? `PT${film.runtime}M` : undefined,
                genre: film.genres?.map((g: any) => g.name),
                director: director ? { '@type': 'Person', name: director.name } : undefined,
                aggregateRating: film.vote_count > 0 ? {
                    '@type': 'AggregateRating',
                    ratingValue: (film.vote_average / 2).toFixed(1),
                    bestRating: '5',
                    ratingCount: film.vote_count,
                } : undefined,
            }
        } : undefined
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
            minHeight: '100dvh', position: 'relative', background: 'var(--ink)',
        }}>
            {/* ── THE AMBIENT ZERO-JS COLOR GLOW — desktop only (too expensive on mobile) ── */}
            {!IS_TOUCH && film?.poster_path && (
                <div style={{
                    position: 'absolute', inset: '-20%', zIndex: 0, pointerEvents: 'none',
                    backgroundImage: `url(${tmdb.poster(film.poster_path, 'w500')})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    filter: 'blur(100px) saturate(1.8) brightness(0.7) opacity(0.35)',
                    maskImage: 'radial-gradient(circle at 50% 10%, black 0%, transparent 60%)',
                    WebkitMaskImage: 'radial-gradient(circle at 50% 10%, black 0%, transparent 60%)'
                }} />
            )}
            
            <div style={{ position: 'relative', zIndex: 1 }}>
                <FilmHero film={film} onPlayTrailer={handlePlayVideo} />
                {/* Single TrailerModal rendered at root — above all stacking contexts */}
                {activeVideo && <TrailerModal trailerKey={activeVideo} onClose={() => setActiveVideo(null)} />}
            <main id="film-details-scroller" style={{
                paddingBottom: IS_TOUCH ? 'calc(4rem + env(safe-area-inset-bottom))' : '3rem',
                background: 'transparent',
            }}>
                <div className="container" style={{ paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    <button onClick={() => {
                        navigate(-1)
                    }} className="back-btn">
                        <ArrowLeft size={12} /> GO BACK
                    </button>
                    <FilmDetailsSection film={film} onPlayVideo={handlePlayVideo} />

                    {/* Viewing Chronicle — shows all rewatches for this film */}
                    {film?.id && <ViewingChronicleSection filmId={film.id} />}

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
