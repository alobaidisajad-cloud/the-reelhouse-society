import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { tmdb } from '../tmdb'
import { useUIStore, useAuthStore } from '../store'
import { FilmCard, SectionHeader, Ticker, FilmStripSkeleton } from '../components/UI'
import Buster from '../components/Buster'

// ── Extracted Components (were inline, now modular) ──
import MarqueeBoard from '../components/home/MarqueeBoard'
import FeaturedReview from '../components/home/FeaturedReview'
import FilmStripRow from '../components/home/FilmStripRow'
import VenueSpotlight from '../components/home/VenueSpotlight'
import SocialPulse from '../components/home/SocialPulse'
import SectionErrorBoundary from '../components/SectionErrorBoundary'
import PageSEO from '../components/PageSEO'

import { useViewport } from '../hooks/useViewport'
import { useScrollRevealAll } from '../hooks/useScrollReveal'
import { useRef } from 'react'

// ── Rotating cinematic taglines for the mobile lobby ──
const LOBBY_TAGLINES = [
    'Every frame tells a story.',
    'Log. Critique. Discover.',
    'Cinema never sleeps.',
    'Your screening room awaits.',
    'The reel begins here.',
]

// MobileLobbyTagline removed — replaced by direct film content below

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
        staleTime: 1000 * 60 * 10, // Cache for 10 mins
    })

    const { data: topRated, isLoading: loadingTop } = useQuery({
        queryKey: ['top-rated'],
        queryFn: () => tmdb.topRated(),
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
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

            {/* Ticker strip */}
            <div className="page-top">
                <Ticker items={tickerItems} />
            </div>

            {/* Hero section — mobile: compact, no minHeight, no heavy backdrop */}
            <section style={{
                padding: IS_TOUCH ? '2rem 0 1.5rem' : '6rem 0 4rem',
                minHeight: IS_TOUCH ? 'unset' : '80vh',
                display: 'flex',
                alignItems: 'center',
                position: 'relative'
            }}>
                {heroFilm?.backdrop_path && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${tmdb.backdrop(heroFilm.backdrop_path, IS_TOUCH ? 'w780' : 'w1280')})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center 15%',
                        backgroundAttachment: IS_TOUCH ? 'scroll' : 'fixed',
                        opacity: IS_TOUCH ? 0.55 : 0.65,
                        filter: 'sepia(0.2) brightness(0.60)',
                        maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                        zIndex: 0,
                        pointerEvents: 'none',
                    }} />
                )}
                {/* Spotlight ambient glow */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at center, transparent 0%, var(--ink) 90%)',
                    zIndex: 0,
                    pointerEvents: 'none',
                }} />
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
                        {!IS_TOUCH && <Buster size={48} mood="neutral" />}
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

                    <motion.div variants={heroChild}>
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

                    {/* CTA row — hidden on mobile since BottomNav has LOG + DARKROOM */}
                    {!IS_TOUCH && (
                        <motion.div variants={heroChild} className="hero-cta-row" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {isAuthenticated ? (
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
                            ) : (
                                <>
                                    <button
                                        className="btn btn-primary"
                                        style={{
                                            fontSize: '1rem',
                                            padding: '1em 2.8em',
                                            boxShadow: '0 6px 28px rgba(139,105,20,0.45), 0 0 0 1px rgba(242,232,160,0.15)',
                                            letterSpacing: '0.18em',
                                        }}
                                        onClick={() => openSignupModal('cinephile')}
                                    >
                                        ✦ JOIN THE SOCIETY
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        style={{ fontSize: '0.85rem', padding: '0.9em 2em', borderColor: 'rgba(139,105,20,0.4)', background: 'rgba(10,7,3,0.7)', letterSpacing: '0.12em' }}
                                        onClick={() => openSignupModal('venue_owner')}
                                    >
                                        I MANAGE A VENUE
                                    </button>
                                </>
                            )}
                            <button
                                className="btn btn-ghost"
                                style={{ fontSize: '0.85rem', padding: '0.9em 2em', background: 'rgba(10,7,3,0.7)', letterSpacing: '0.12em' }}
                                onClick={() => navigate('/discover')}
                            >
                                BROWSE ARCHIVES
                            </button>
                        </motion.div>
                    )}


                </motion.div>
            </section>

            {/* Main content */}
            <main ref={mainRef} style={{ background: 'var(--ink)', position: 'relative', zIndex: 1, paddingBottom: IS_TOUCH ? '6rem' : '5rem' }}>
                <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '2rem' : '3rem' }}>

                    {/* Trending */}
                    <div className="scroll-reveal">
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

                    {/* Social Pulse */}
                    <div className="scroll-reveal">
                    <SectionErrorBoundary label="THE PULSE">
                    <SocialPulse />
                    </SectionErrorBoundary>
                    </div>



                    {/* Featured review + film */}
                    <div className="scroll-reveal">
                    <SectionErrorBoundary label="FEATURED CRITIQUE">
                    {heroFilm && (
                        <section style={{ position: 'relative', margin: '2rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ width: '3px', height: '1.8rem', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))', borderRadius: '2px', boxShadow: '0 0 10px rgba(139,105,20,0.4)' }} />
                                <SectionHeader label="PICK OF THE WEEK" title="Featured Critique" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
                            </div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', paddingLeft: '1.5rem', opacity: 0.75, maxWidth: '600px', marginBottom: '3rem', textShadow: '0 1px 2px var(--ink)' }}>
                                One critique, filed for the archive.
                            </p>
                            <div className="layout-sidebar">
                                <div style={{ maxWidth: 260, margin: '0 auto' }}>
                                    <div style={{ position: 'relative', padding: '0.5rem', background: 'var(--soot)', borderRadius: '4px', border: '1px solid rgba(139,105,20,0.15)', boxShadow: '0 15px 35px rgba(0,0,0,0.6)' }}>
                                        <FilmCard film={heroFilm} onClick={() => navigate(`/film/${heroFilm.id}`)} />
                                    </div>
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <FeaturedReview film={heroFilm} />
                                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '2rem', paddingLeft: '0.5rem', alignItems: 'center' }}>
                                        <button
                                            className="btn btn-ghost"
                                            style={{
                                                fontSize: '0.75rem',
                                                padding: '0.5em 0',
                                                whiteSpace: 'nowrap',
                                                border: 'none',
                                                background: 'transparent',
                                                boxShadow: 'none',
                                                color: 'var(--parchment)',
                                                letterSpacing: '0.2em',
                                                display: 'flex',
                                                alignItems: 'center',
                                                textDecoration: 'none',
                                                transition: 'all 0.3s ease',
                                                borderBottom: '1px solid var(--sepia)'
                                            }}
                                            onMouseEnter={(e: any) => {
                                                e.currentTarget.style.color = 'var(--flicker)';
                                                e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)';
                                            }}
                                            onMouseLeave={(e: any) => {
                                                e.currentTarget.style.color = 'var(--parchment)';
                                                e.currentTarget.style.textShadow = 'none';
                                            }}
                                            onClick={() => navigate(`/film/${heroFilm.id}`)}
                                        >
                                            READ ALL CRITIQUES
                                        </button>
                                        <button
                                            className="btn btn-ghost"
                                            style={{
                                                fontSize: '0.75rem',
                                                padding: '0.5em 0',
                                                whiteSpace: 'nowrap',
                                                border: 'none',
                                                background: 'transparent',
                                                boxShadow: 'none',
                                                color: 'var(--fog)',
                                                letterSpacing: '0.2em',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                transition: 'all 0.3s ease'
                                            }}
                                            onMouseEnter={(e: any) => {
                                                e.currentTarget.style.color = 'var(--parchment)';
                                                e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)';
                                            }}
                                            onMouseLeave={(e: any) => {
                                                e.currentTarget.style.color = 'var(--fog)';
                                                e.currentTarget.style.textShadow = 'none';
                                            }}
                                            onClick={() => openLogModal(heroFilm)}
                                        >
                                            LOG THIS FILM <span style={{ color: 'var(--sepia)', fontSize: '1.2em', fontWeight: 'bold' }}>+</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                    </SectionErrorBoundary>
                    </div>

                    {/* Top rated */}
                    <div className="scroll-reveal">
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

                    {/* Venue spotlight */}
                    <div className="scroll-reveal">
                    <SectionErrorBoundary label="VENUE SPOTLIGHT">
                    <VenueSpotlight />
                    </SectionErrorBoundary>
                    </div>

                    {/* Buster CTA */}
                    {!isAuthenticated && (
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
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <div key={i} style={{ width: 14, height: 9, border: '1px solid var(--sepia)', borderRadius: '1px', flexShrink: 0 }} />
                                ))}
                            </div>
                            {/* Editorial label */}
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: IS_TOUCH ? '1.25rem' : '1.75rem', opacity: 0.6 }}>THE FINAL ACT</div>
                            <Buster size={IS_TOUCH ? 90 : 130} mood="peeking" />
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
                    )}
                </div>
            </main>
        </>
    )
}
