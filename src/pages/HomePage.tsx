import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, lazy, Suspense, useRef } from 'react'
import { tmdb } from '../tmdb'
import { useUIStore, useAuthStore } from '../store'
import { FilmCard, SectionHeader, Ticker, FilmStripSkeleton } from '../components/UI'

// ── Above-fold: eagerly loaded (critical for LCP) ──
import MarqueeBoard from '../components/home/MarqueeBoard'
import FilmStripRow from '../components/home/FilmStripRow'
import SectionErrorBoundary from '../components/SectionErrorBoundary'
import PageSEO from '../components/PageSEO'

// ── Below-fold: lazy loaded (saves ~30KB from initial bundle) ──
const Buster = lazy(() => import('../components/Buster'))
const FeaturedReview = lazy(() => import('../components/home/FeaturedReview'))

const SocialPulse = lazy(() => import('../components/home/SocialPulse'))

import { useViewport } from '../hooks/useViewport'
import { useScrollRevealAll } from '../hooks/useScrollReveal'

// ── Scroll Progress Film Strip ──
function ScrollProgress() {
    const [progress, setProgress] = useState(0)
    useEffect(() => {
        const onScroll = () => {
            const scrollTop = window.scrollY
            const docHeight = document.documentElement.scrollHeight - window.innerHeight
            setProgress(docHeight > 0 ? scrollTop / docHeight : 0)
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])
    if (progress <= 0.01) return null
    return (
        <div className="scroll-progress-rail" aria-hidden="true">
            <div
                className="scroll-progress-bar"
                style={{ transform: `scaleX(${progress})` }}
            />
        </div>
    )
}

// ── Lobby Section Divider ──
function LobbyDivider({ label }: { label?: string }) {
    return (
        <div style={{ padding: '0.5rem 0 1.5rem', position: 'relative' }} aria-hidden="true">
            <div className="lobby-section-divider" style={label ? { '--divider-label': `"${label}"` } as any : {}} />
        </div>
    )
}

// ── MAIN HOME PAGE ──
export default function HomePage() {
    const navigate = useNavigate()
    const { isTouch: IS_TOUCH } = useViewport()
    const mainRef = useRef<HTMLDivElement>(null)
    useScrollRevealAll(mainRef)

    // Enterprise Fix: Granular Selectors
    const openSignupModal = useUIStore(state => state.openSignupModal)
    const openLogModal = useUIStore(state => state.openLogModal)
    const isAuthenticated = useAuthStore(state => state.isAuthenticated)

    const { data: trending, isLoading: loadingTrend } = useQuery({
        queryKey: ['trending'],
        queryFn: () => tmdb.trending('week'),
        staleTime: 1000 * 60 * 10,
    })

    const { data: topRated, isLoading: loadingTop } = useQuery({
        queryKey: ['top-rated'],
        queryFn: () => tmdb.topRated(),
        staleTime: 1000 * 60 * 60,
    })

    const { data: nowPlaying } = useQuery({
        queryKey: ['now-playing'],
        queryFn: () => tmdb.nowPlaying(),
        staleTime: 1000 * 60 * 10,
    })

    const heroFilm = trending?.results?.[0]
    const films = trending?.results || []
    const topFilms = topRated?.results || []

    const tickerItems = films.slice(0, 10).map((f: any) => f.title).filter(Boolean)

    // ── Hero entrance animation variants ──
    const heroContainer = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.15, delayChildren: 0.1 }
        }
    }
    const heroChild = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 20, stiffness: 100 } }
    }

    return (
        <>
            <PageSEO
                title="The ReelHouse Society — The Lobby"
                description="Log every film you watch. Discover cinema you've never heard of. Join the society."
            />

            {/* Film strip scroll progress indicator */}
            <ScrollProgress />

            {/* Ticker strip */}
            <div className="page-top curtain-rise curtain-rise-delay-1">
                <Ticker items={tickerItems} />
            </div>

            {/* ── HERO SECTION ── */}
            <section
                className="curtain-rise"
                style={{
                    padding: IS_TOUCH ? '3rem 0 2rem' : '6rem 0 4rem',
                    minHeight: IS_TOUCH ? '50vh' : '80vh',
                    display: 'flex',
                    alignItems: 'center',
                    position: 'relative',
                }}
            >
                {heroFilm?.backdrop_path && (
                    <img
                        src={tmdb.backdrop(heroFilm.backdrop_path, IS_TOUCH ? 'w780' : 'w1280')!}
                        alt=""
                        fetchPriority="high"
                        decoding="async"
                        width={IS_TOUCH ? 780 : 1280}
                        height={IS_TOUCH ? 439 : 720}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center 15%',
                            opacity: IS_TOUCH ? 0.60 : 0.65,
                            filter: 'sepia(0.2) brightness(0.60)',
                            maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                            zIndex: 0,
                            pointerEvents: 'none',
                        }}
                    />
                )}

                {/* Spotlight ambient glow */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at center, transparent 0%, var(--ink) 90%)',
                    zIndex: 0,
                    pointerEvents: 'none',
                }} />

                {/* Warm projector beam — desktop only */}
                {!IS_TOUCH && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '60%',
                        height: '40%',
                        background: 'radial-gradient(ellipse at top, rgba(196,150,26,0.07) 0%, transparent 70%)',
                        pointerEvents: 'none',
                        zIndex: 0,
                    }} />
                )}

                {/* One-shot hero glow pulse */}
                {!IS_TOUCH && <div className="hero-glow-pulse" />}

                <motion.div
                    variants={heroContainer}
                    initial="hidden"
                    animate="show"
                    className="container"
                    style={{ width: '100%', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' }}
                >
                    <motion.div variants={heroChild} style={{ marginBottom: IS_TOUCH ? '1rem' : '2rem', textAlign: 'center' }}>
                        <Buster size={IS_TOUCH ? 28 : 48} mood="neutral" />
                        <h2 style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: IS_TOUCH ? '0.6rem' : '0.72rem',
                            letterSpacing: '0.6em',
                            color: 'var(--sepia)',
                            opacity: 0.65,
                            marginTop: IS_TOUCH ? '0' : '1rem',
                            fontWeight: 400,
                            textTransform: 'uppercase',
                        }}>
                            Welcome to the Lobby
                        </h2>
                    </motion.div>

                    {/* MarqueeBoard with ambient breathing glow */}
                    <motion.div
                        variants={heroChild}
                        className={!IS_TOUCH ? 'ambient-breathe' : ''}
                        style={{ width: '100%', borderRadius: 'var(--radius-card)' }}
                    >
                        <MarqueeBoard film={heroFilm} />
                    </motion.div>

                    {!isAuthenticated && (
                        <motion.div variants={heroChild} style={{
                            textAlign: 'center',
                            margin: IS_TOUCH ? '1.5rem auto 0' : '2.5rem auto 0',
                            maxWidth: '680px',
                        }}>
                            {/* Three-line manifesto */}
                            <div style={{
                                fontFamily: 'var(--font-sub)',
                                fontSize: IS_TOUCH ? '1.05rem' : '1.35rem',
                                color: 'var(--parchment)',
                                lineHeight: 1.75,
                                letterSpacing: '0.01em',
                                textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                            }}>
                                <span style={{ display: 'block' }}>Track every film you watch.</span>
                                <span style={{ display: 'block', color: 'var(--bone)', opacity: 0.85 }}>Discover cinema you've never heard of.</span>
                            </div>
                            {/* Divider before climax line */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: IS_TOUCH ? '1rem auto 0' : '1.25rem auto 0', width: '60%', maxWidth: 220 }}>
                                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(196,150,26,0.5))' }} />
                                <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--sepia)' }} />
                                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(196,150,26,0.5))' }} />
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: IS_TOUCH ? '1.6rem' : '2rem',
                                color: 'var(--sepia)',
                                letterSpacing: '0.04em',
                                marginTop: IS_TOUCH ? '0.75rem' : '1rem',
                                textShadow: '0 0 30px rgba(196,150,26,0.35), 0 2px 8px rgba(0,0,0,0.9)',
                            }}>
                                Join the Society.
                            </div>
                            {/* Decorative rule */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: IS_TOUCH ? '1.25rem 0' : '1.75rem 0', opacity: 0.4 }}>
                                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, var(--sepia))' }} />
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)' }}>✦ THE SOCIETY ✦</span>
                                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, var(--sepia))' }} />
                            </div>
                        </motion.div>
                    )}

                    {/* CTA row */}
                    {!isAuthenticated ? (
                        <motion.div variants={heroChild} className="hero-cta-row" style={{ display: 'flex', justifyContent: 'center', gap: IS_TOUCH ? '0.6rem' : '1rem', marginTop: IS_TOUCH ? '1.5rem' : '2.5rem', flexWrap: 'wrap', alignItems: 'center', flexDirection: IS_TOUCH ? 'column' : 'row', width: IS_TOUCH ? '100%' : 'auto', padding: IS_TOUCH ? '0 1rem' : 0 }}>
                            <button
                                className="btn btn-primary"
                                style={{
                                    fontSize: IS_TOUCH ? '0.8rem' : '1rem',
                                    padding: IS_TOUCH ? '0.8em 2em' : '1em 2.8em',
                                    boxShadow: '0 6px 28px rgba(139,105,20,0.45), 0 0 0 1px rgba(242,232,160,0.15)',
                                    letterSpacing: '0.18em',
                                    width: IS_TOUCH ? '100%' : 'auto',
                                }}
                                onClick={() => openSignupModal('cinephile')}
                            >
                                ✦ JOIN THE SOCIETY
                            </button>
                            <div style={{ display: 'flex', gap: IS_TOUCH ? '0.5rem' : '1rem', width: IS_TOUCH ? '100%' : 'auto' }}>
                                <button
                                    className="btn btn-ghost"
                                    style={{ fontSize: IS_TOUCH ? '0.7rem' : '0.85rem', padding: IS_TOUCH ? '0.7em 1em' : '0.9em 2em', background: 'rgba(10,7,3,0.7)', letterSpacing: '0.12em', flex: IS_TOUCH ? 1 : 'none' }}
                                    onClick={() => navigate('/discover')}
                                >
                                    BROWSE ARCHIVES
                                </button>
                            </div>
                        </motion.div>
                    ) : !IS_TOUCH ? (
                        <motion.div variants={heroChild} style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
                            <button
                                className="btn btn-primary"
                                style={{
                                    fontSize: '1rem',
                                    padding: '1em 2.8em',
                                    boxShadow: '0 6px 28px rgba(139,105,20,0.45), 0 0 0 1px rgba(242,232,160,0.15)',
                                    letterSpacing: '0.18em',
                                }}
                                onClick={() => openLogModal()}
                            >
                                + LOG A FILM
                            </button>
                        </motion.div>
                    ) : null}
                </motion.div>
            </section>

            {/* ── MAIN CONTENT ── */}
            <main
                ref={mainRef}
                id="main-content"
                style={{ background: 'var(--ink)', position: 'relative', zIndex: 1, paddingBottom: IS_TOUCH ? '6rem' : '5rem' }}
            >
                <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '0.5rem' : '0' }}>

                    {/* ── SECTION: NOW SHOWING ── */}
                    <div className="scroll-reveal">
                        <LobbyDivider />
                        {/* Section accent header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            padding: '0 1rem',
                            marginBottom: IS_TOUCH ? '0.5rem' : '0',
                        }}>
                            <div className="section-beacon" />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', opacity: 0.7 }}>
                                LIVE — UPDATED WEEKLY
                            </span>
                        </div>
                        <SectionErrorBoundary label="NOW SHOWING">
                            {loadingTrend ? <FilmStripSkeleton count={8} /> : (
                                <FilmStripRow
                                    films={films}
                                    title="On The Marquee"
                                    label="NOW SHOWING"
                                    description="The features drawing the largest crowds this week across the globe."
                                />
                            )}
                        </SectionErrorBoundary>
                    </div>

                    {/* ── SECTION: THE PULSE ── */}
                    <div className="scroll-reveal">
                        <LobbyDivider />
                        <SectionErrorBoundary label="THE PULSE">
                            <Suspense fallback={null}><SocialPulse /></Suspense>
                        </SectionErrorBoundary>
                    </div>

                    {/* ── SECTION: FEATURED CRITIQUE ── */}
                    <div className="scroll-reveal">
                        <LobbyDivider />
                        <SectionErrorBoundary label="FEATURED CRITIQUE">
                            {/* Enhanced header with film info sourced from critique itself */}
                            <section style={{ position: 'relative', margin: '2rem 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                    <div style={{ width: '3px', height: '1.8rem', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))', borderRadius: '2px', boxShadow: '0 0 10px rgba(139,105,20,0.4)' }} />
                                    <div>
                                        <SectionHeader label="PICK OF THE WEEK" title="Featured Critique" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
                                    </div>
                                </div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', paddingLeft: '1.5rem', opacity: 0.75, maxWidth: '600px', marginBottom: '3rem', textShadow: '0 1px 2px var(--ink)' }}>
                                    The hottest critique filed in the last 24 hours, surfaced from the archive.
                                </p>
                                <div className="layout-sidebar">
                                    {/* FeaturedReview component now fully self-contained with its own film data */}
                                    <Suspense fallback={null}><FeaturedReview /></Suspense>
                                </div>
                            </section>
                        </SectionErrorBoundary>
                    </div>

                    {/* ── SECTION: THE CANON ── */}
                    <div className="scroll-reveal">
                        <LobbyDivider />
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            padding: '0 1rem',
                            marginBottom: IS_TOUCH ? '0.5rem' : '0',
                        }}>
                            <div className="section-beacon" style={{ background: 'var(--fog)', boxShadow: 'none', animationDelay: '1.2s' }} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--fog)', opacity: 0.6 }}>
                                CERTIFIED MASTERWORKS
                            </span>
                        </div>
                        <SectionErrorBoundary label="ESSENTIAL VIEWING">
                            {loadingTop ? <FilmStripSkeleton count={8} /> : (
                                <FilmStripRow
                                    films={topFilms}
                                    title="The Canon"
                                    label="ESSENTIAL VIEWING"
                                    description="Timeless masterpieces that forever haunt the corridors of cinema."
                                />
                            )}
                        </SectionErrorBoundary>
                    </div>



                    {/* ── SECTION: BUSTER CTA (unauthenticated only) ── */}
                    {!isAuthenticated && (
                        <div className="scroll-reveal">
                            <LobbyDivider />
                            <section style={{
                                textAlign: 'center',
                                padding: IS_TOUCH ? '3rem 1.5rem 2.5rem' : '5rem 2rem 4rem',
                                background: 'linear-gradient(180deg, rgba(28,23,16,0.6) 0%, rgba(10,7,3,0.95) 100%)',
                                border: '1px solid rgba(139,105,20,0.2)',
                                borderRadius: '6px',
                                position: 'relative',
                                overflow: 'hidden',
                            }}>
                                {/* Top cinematic rule */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                {/* Film strip perforation border — top */}
                                <div style={{ position: 'absolute', top: '8px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '8px', opacity: 0.15 }}>
                                    {Array.from({ length: IS_TOUCH ? 6 : 12 }).map((_, i) => (
                                        <div key={i} style={{ width: 14, height: 9, border: '1px solid var(--sepia)', borderRadius: '1px', flexShrink: 0 }} />
                                    ))}
                                </div>
                                {/* Warm breathing glow behind Buster */}
                                <div style={{
                                    position: 'absolute',
                                    top: '50%', left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: IS_TOUCH ? '200px' : '300px',
                                    height: IS_TOUCH ? '200px' : '300px',
                                    background: 'radial-gradient(circle, rgba(139,105,20,0.07) 0%, transparent 70%)',
                                    borderRadius: '50%',
                                    pointerEvents: 'none',
                                }} />
                                {/* Editorial label */}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: IS_TOUCH ? '1.25rem' : '1.75rem', opacity: 0.6 }}>THE FINAL ACT</div>
                                <Suspense fallback={null}><Buster size={IS_TOUCH ? 90 : 130} mood="peeking" /></Suspense>
                                <div style={{ marginTop: IS_TOUCH ? '1.5rem' : '2.25rem' }}>
                                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.8rem' : '2.6rem', color: 'var(--parchment)', marginBottom: '0.75rem', lineHeight: 1.1 }}>
                                        The House is Waiting
                                    </h2>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: IS_TOUCH ? '0.9rem' : '1rem', color: 'var(--bone)', maxWidth: 480, margin: '0 auto 2rem', lineHeight: 1.7, opacity: 0.7 }}>
                                        Log every frame. Review with the fury of a true critic.
                                        Build enduring lists and trace the ghosts of your cinematic past.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        style={{
                                            fontSize: IS_TOUCH ? '0.8rem' : '1rem',
                                            padding: IS_TOUCH ? '1em 3em' : '0.95em 3.5em',
                                            letterSpacing: '0.25em',
                                            boxShadow: '0 8px 32px rgba(139,105,20,0.5), 0 0 0 1px rgba(242,232,160,0.15)',
                                            width: IS_TOUCH ? '100%' : 'auto',
                                            maxWidth: IS_TOUCH ? '320px' : 'none',
                                        }}
                                        onClick={() => openSignupModal()}
                                    >
                                        ADMIT ONE
                                    </button>
                                </div>
                                {/* Bottom cinematic rule */}
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                            </section>
                        </div>
                    )}
                </div>
            </main>
        </>
    )
}
