import { useEffect, useRef, useState, memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { tmdb, obscurityScore } from '../tmdb'
import { useUIStore, useAuthStore, useFilmStore, useVenueStore } from '../store'
import { FilmCard, SectionHeader, ReelRating, LoadingReel, Ticker, FilmStripSkeleton } from '../components/UI'
import Buster from '../components/Buster'
import { Plus, Maximize, Play, PlayCircle, Star, Quote } from 'lucide-react'
import TicketStubGallery from '../components/TicketStubGallery'

// Detect touch/mobile once at module level — never re-evaluated
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

// Static — defined outside component so it's never re-created on re-render
const MARQUEE_BULBS = Array.from({ length: IS_TOUCH ? 8 : 14 }) // fewer bulb animations on mobile

// ── MARQUEE BOARD COMPONENT ──
function MarqueeBoard({ film }) {
    if (!film) return null;
    return (
        <div style={{
            position: 'relative',
            padding: IS_TOUCH ? '0 0 1rem' : '0 0 2rem',
            maxWidth: '800px',
            margin: '0 auto',
            width: '100%',
            boxSizing: 'border-box',
        }}>
            {/* Bulb row top — hidden on mobile for performance */}
            {!IS_TOUCH && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', padding: '0 10px' }}>
                    {MARQUEE_BULBS.map((_, i) => (
                        <div
                            key={i}
                            className="marquee-bulb"
                            style={{ animationDelay: `${i * 0.18}s` }}
                        />
                    ))}
                </div>
            )}

            <div className="marquee-board" style={{
                background: 'linear-gradient(180deg, rgba(28,23,16,0.95) 0%, rgba(10,7,3,0.98) 100%)',
                border: '2px solid var(--sepia)',
                borderRadius: 'var(--radius-card)',
                padding: IS_TOUCH ? '1.25rem 1rem' : '3rem 2rem',
                boxShadow: IS_TOUCH
                    ? '0 8px 20px rgba(0,0,0,0.8)'
                    : '0 20px 50px rgba(0,0,0,0.9), inset 0 0 40px rgba(139,105,20,0.15), 0 0 0 1px rgba(242,232,160,0.1)',
                position: 'relative'
            }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.6rem' : '0.75rem', letterSpacing: '0.3em', color: 'var(--flicker)', textAlign: 'center', marginBottom: IS_TOUCH ? '0.75rem' : '1.5rem', textShadow: '0 0 10px rgba(242,232,160,0.3)' }}>
                    ★ MAIN FEATURE ★
                </div>
                <div style={{ textAlign: 'center' }}>
                    <h1
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: IS_TOUCH ? 'clamp(1.5rem, 7vw, 2.5rem)' : 'clamp(2.5rem, 8vw, 5.5rem)',
                            color: 'var(--parchment)',
                            letterSpacing: '0.02em',
                            textShadow: '3px 3px 0px rgba(139,105,20,0.4), 0 0 40px rgba(242,232,160,0.15)',
                            lineHeight: 1.1,
                            margin: '0.25rem 0',
                            textTransform: 'uppercase',
                            wordBreak: 'break-word',
                        }}
                    >
                        {film.title || 'REELHOUSE'}
                    </h1>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: IS_TOUCH ? '0.75rem' : '1.5rem', marginTop: IS_TOUCH ? '1rem' : '2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-sub)', fontSize: IS_TOUCH ? '0.8rem' : '0.95rem', color: 'var(--bone)', background: 'rgba(58,50,40,0.5)', padding: '0.2em 0.8em', borderRadius: '4px', border: '1px solid rgba(139,105,20,0.3)' }}>
                            {film.release_date?.slice(0, 4)}
                        </span>
                        <ReelRating value={Math.round((film.vote_average || 0) / 2)} size="md" />
                        {!IS_TOUCH && (
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: 'var(--sepia)', letterSpacing: '0.15em', borderBottom: '1px dotted var(--sepia)', paddingBottom: '0.2em' }}>
                                {Math.round(film.vote_count / 100) * 100}+ REVIEWS
                            </span>
                        )}
                    </div>
                </div>
                {/* Film strip decoration — desktop only */}
                {!IS_TOUCH && (
                    <div style={{
                        display: 'flex',
                        gap: 4,
                        marginTop: '2.5rem',
                        overflow: 'hidden',
                        opacity: 0.15,
                        justifyContent: 'center'
                    }}>
                        {Array.from({ length: 14 }).map((_, i) => (
                            <div key={i} style={{ width: 32, height: 24, flexShrink: 0, border: '2px solid var(--parchment)', borderRadius: 2 }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Bulb row bottom — desktop only */}
            {!IS_TOUCH && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0 10px' }}>
                    {MARQUEE_BULBS.map((_, i) => (
                        <div
                            key={i}
                            className="marquee-bulb"
                            style={{ animationDelay: `${(i + 7) * 0.18}s` }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ── FEATURED REVIEW (Dynamic from community logs) ──
function FeaturedReview({ film }) {
    const logs = useFilmStore(state => state.logs)

    // Find the most recent log with a written review
    const featuredLog = logs.find(l => l.review && l.review.trim().length > 30)

    if (!featuredLog && !film) return null

    // Use real community data, or show a thematic placeholder if no reviews yet
    const displayReview = featuredLog
        ? { text: featuredLog.review, author: featuredLog.username || 'anonymous', rating: featuredLog.rating || 0 }
        : { text: "The projector hums. The house lights dim. Be the first to file your critique and claim this space.", author: 'THE SOCIETY', rating: 0 }

    return (
        <div style={{
            position: 'relative',
            padding: '2rem 2.5rem',
            background: 'rgba(18,14,9,0.95)',
            borderLeft: '2px solid var(--sepia)',
            borderTop: '1px solid rgba(139,105,20,0.1)',
            borderBottom: '1px solid rgba(139,105,20,0.05)',
            borderRight: '1px solid rgba(139,105,20,0.05)',
            borderRadius: '0 8px 8px 0',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.05)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{ position: 'absolute', top: '1.5rem', left: '-1.5rem', color: 'var(--sepia)', fontSize: '3.5rem', lineHeight: 0, opacity: 0.25, fontFamily: 'var(--font-display)' }}>"</div>
            <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1.15rem',
                fontStyle: 'italic',
                color: 'var(--parchment)',
                lineHeight: 1.8,
                position: 'relative',
                zIndex: 1,
                textShadow: '0 1px 2px var(--ink)',
                marginBottom: '1.5rem'
            }}>
                {displayReview.text.length > 280 ? displayReview.text.slice(0, 280) + '…' : displayReview.text}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px dashed rgba(139,105,20,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ash)', border: '1px solid var(--sepia)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        <Buster size={16} mood="smiling" />
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--bone)' }}>
                        {displayReview.author.toUpperCase()}
                    </div>
                </div>
                {displayReview.rating > 0 && <ReelRating value={displayReview.rating} size="sm" />}
            </div>
        </div>
    )
}

// ── FILM STRIP ROW ──
const FilmStripRow = memo(function FilmStripRow({ films = [], title, label, description }) {
    const navigate = useNavigate()
    return (
        <section style={{ position: 'relative', margin: '3rem 0 1rem' }}>
            {/* Editorial Header Layout */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                padding: '0 1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Sleek vertical editorial indicator rather than a horizontal divider */}
                    <div style={{
                        width: '3px',
                        height: '1.8rem',
                        background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))',
                        borderRadius: '2px',
                        boxShadow: '0 0 10px rgba(139,105,20,0.4)'
                    }} />
                    <SectionHeader label={label} title={title} style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
                </div>

                {/* Ultra-minimal un-boxed button */}
                <button
                    className="btn btn-ghost"
                    style={{
                        fontSize: '0.65rem',
                        padding: '0.5em 0',
                        whiteSpace: 'nowrap',
                        border: 'none',
                        background: 'transparent',
                        boxShadow: 'none',
                        color: 'var(--fog)',
                        letterSpacing: '0.25em',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--parchment)';
                        e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--fog)';
                        e.currentTarget.style.textShadow = 'none';
                    }}
                    onClick={() => navigate('/discover')}
                >
                    VIEW ALL <span style={{ fontSize: '1.2em', color: 'var(--sepia)', transition: 'transform 0.3s ease' }} className="arrow-icon">⟶</span>
                </button>
            </div>

            {/* Inset description for organic reading flow */}
            {description && (
                <div style={{ padding: '0 1rem 2rem 2.2rem' }}>
                    <p style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.95rem',
                        color: 'var(--bone)',
                        maxWidth: '700px',
                        lineHeight: 1.6,
                        opacity: 0.75,
                        margin: 0,
                        textShadow: '0 1px 2px var(--ink)'
                    }}>
                        {description}
                    </p>
                </div>
            )}

            <div style={{ position: 'relative' }}>
                {/* Soft gradient masks — creates a seamless bleed into the edges instead of harsh cuts */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to right, var(--ink) 0%, transparent 100%)', zIndex: 2, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to left, var(--ink) 0%, transparent 100%)', zIndex: 2, pointerEvents: 'none' }} />

                {/* Unbounded horizontal scroll */}
                <div className="film-strip-scroll" style={{
                    padding: '0.5rem 1.5rem 2rem',
                    display: 'flex',
                    gap: '1.5rem',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    scrollSnapType: 'x mandatory'
                }}>
                    {films.slice(0, 15).map((film, i) => (
                        IS_TOUCH ? (
                            // Mobile: plain div — no Framer Motion blur/filter that destroys GPU performance
                            <div
                                key={film.id}
                                className="scroll-item"
                                style={{
                                    scrollSnapAlign: 'start',
                                    flexShrink: 0,
                                    width: '130px',
                                }}
                            >
                                <FilmCard
                                    film={film}
                                    showRating
                                    onClick={() => navigate(`/film/${film.id}`)}
                                />
                            </div>
                        ) : (
                            // Desktop: cinematic reveal — opacity only (NO blur filter — it forces full GPU recomposition)
                            <motion.div
                                key={film.id}
                                className="scroll-item"
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true, margin: "100px" }}
                                transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.5, ease: "easeOut" }}
                                whileHover={{ y: -6, scale: 1.02, transition: { type: 'spring', damping: 20, mass: 0.8 } }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                    scrollSnapAlign: 'start',
                                    flexShrink: 0,
                                    width: '170px',
                                    transformOrigin: 'bottom center',
                                }}
                            >
                                <FilmCard
                                    film={film}
                                    showRating
                                    onClick={() => navigate(`/film/${film.id}`)}
                                />
                            </motion.div>
                        )
                    ))}
                </div>
            </div>
        </section>
    )
})

// ── VENUE SPOTLIGHT ──
const VenueSpotlight = memo(function VenueSpotlight() {
    const { venue, events } = useVenueStore()
    const activeVenues = venue ? [{
        id: venue.id || 1,
        name: venue.name || 'The Oracle Palace',
        location: venue.location || 'Brooklyn, NY',
        vibes: venue.vibes || ['Arthouse', 'Midnight Palace'],
        events: events?.length || 0
    }] : []

    return (
        <section>
            <SectionHeader label="FEATURED VENUES" title="The Palaces" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {activeVenues.map((v) => (
                    <Link key={v.id} to={`/venue/${v.id}`} style={{ textDecoration: 'none' }}>
                        <motion.div
                            className="card"
                            whileHover={{ y: -3, transition: { type: 'spring', damping: 15 } }}
                            style={{ borderTop: '2px solid var(--sepia)' }}
                        >
                            {/* Marquee-style header */}
                            <div style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: '1.1rem',
                                color: 'var(--parchment)',
                                marginBottom: '0.4rem',
                                lineHeight: 1.2,
                            }}>
                                {v.name}
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', marginBottom: '0.75rem' }}>
                                📍 {v.location}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.75rem' }}>
                                {v.vibes.map((vibe) => (
                                    <span key={vibe} className="tag tag-vibe" style={{ fontSize: '0.55rem' }}>⟡ {vibe}</span>
                                ))}
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>
                                {v.events} UPCOMING EVENTS
                            </div>
                        </motion.div>
                    </Link>
                ))}
            </div>
        </section>
    )
})

// ── THE SOCIAL PULSE (COMMUNITY FEED) ──
const SocialPulse = memo(function SocialPulse() {
    const { logs } = useFilmStore()
    const { user } = useAuthStore()

    if (!logs || logs.length === 0) {
        return (
            <section style={{ position: 'relative', margin: '4rem 0 2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ width: '3px', height: '1.8rem', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))', borderRadius: '2px', boxShadow: '0 0 10px rgba(139,105,20,0.4)' }} />
                    <SectionHeader label="LIVE FROM THE FOYER" title="The Pulse" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
                </div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', paddingLeft: '1.5rem', opacity: 0.75, maxWidth: '600px', marginBottom: '2.5rem', textShadow: '0 1px 2px var(--ink)' }}>
                    Witness the latest logs, lists, and critiques from the devotees.
                </p>
                <div style={{ padding: '2rem 1.5rem', border: '1px dashed var(--ash)', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.2em' }}>
                    THE LOBBY IS QUIET. LOG A FILM TO START THE PULSE.
                </div>
            </section>
        )
    }

    const activities = logs.slice(0, 5).map((log, i) => ({
        id: log.id || i,
        type: 'log',
        user: user?.username || 'cinephile',
        film: { id: log.filmId, title: log.title, poster_path: log.poster },
        rating: log.rating,
        text: log.review,
        time: new Date(log.createdAt || Date.now()).toLocaleDateString()
    }))

    return (
        <section style={{ position: 'relative', margin: '4rem 0 2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ width: '3px', height: '1.8rem', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))', borderRadius: '2px', boxShadow: '0 0 10px rgba(139,105,20,0.4)' }} />
                <SectionHeader label="LIVE FROM THE FOYER" title="The Pulse" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
            </div>

            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', paddingLeft: '1.5rem', opacity: 0.75, maxWidth: '600px', marginBottom: '2.5rem', textShadow: '0 1px 2px var(--ink)' }}>
                Witness the latest logs, lists, and critiques from the devotees.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: IS_TOUCH ? '1rem' : '2rem' }}>
                {activities.map((act, i) => {
                    const cardStyle = {
                        position: 'relative',
                        padding: IS_TOUCH ? '1rem' : '1.5rem',
                        background: 'rgba(18,14,9,0.95)',
                        borderLeft: '2px solid var(--sepia)',
                        borderTop: '1px solid rgba(139,105,20,0.1)',
                        borderBottom: '1px solid rgba(139,105,20,0.05)',
                        borderRight: '1px solid rgba(139,105,20,0.05)',
                        borderRadius: '0 8px 8px 0',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.05)',
                        display: 'flex',
                        flexDirection: 'column'
                    }

                    // Mobile: plain div — no framer observers, no layout animations
                    if (IS_TOUCH) {
                        return (
                            <div key={act.id} style={cardStyle}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.8rem', borderBottom: '1px dashed rgba(139,105,20,0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ash)', border: '1px solid var(--sepia)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                                            <Buster size={14} mood={act.rating >= 4 ? 'smiling' : 'neutral'} />
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--parchment)' }}>@{act.user}</span>
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{act.time}</span>
                                </div>

                                {/* Content */}
                                {act.type === 'review' || act.type === 'log' ? (
                                    <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                                        {act.film?.poster_path && (
                                            <div style={{ width: 56, height: 84, flexShrink: 0, borderRadius: '3px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <img src={tmdb.poster(act.film.poster_path, 'w92')} alt={act.film.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.2) contrast(1.1)' }} />
                                            </div>
                                        )}
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                            <Link to={`/film/${act.film?.id}`} style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.2, textDecoration: 'none', marginBottom: '0.3rem' }}>
                                                {act.film?.title}
                                            </Link>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                {act.rating && <ReelRating value={act.rating} size="sm" />}
                                                {act.status === 'rewatched' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>↩ REWATCHED</span>}
                                            </div>
                                            {act.text && (
                                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', fontStyle: 'italic', lineHeight: 1.5, opacity: 0.9, marginTop: '0.2rem' }}>
                                                    "{act.text}"
                                                </p>
                                            )}
                                            {act.watchedWith && (
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: 'auto', paddingTop: '0.75rem' }}>
                                                    ♡ WITH <span style={{ color: 'var(--bone)' }}>{act.watchedWith.toUpperCase()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                            <span style={{ color: 'var(--sepia)' }}>✦</span>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>CREATED A LIST</div>
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1.05rem', color: 'var(--parchment)', marginBottom: '1rem' }}>{act.title}</div>
                                        <div style={{ display: 'flex', gap: 4, height: 60, overflow: 'hidden', borderRadius: '3px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                                            {act.films.map((f, i) => (
                                                <img key={i} src={tmdb.poster(f.poster_path, 'w92')} style={{ flex: 1, objectFit: 'cover', filter: 'sepia(0.3) brightness(0.8)', borderRight: i < act.films.length - 1 ? '1px solid rgba(0,0,0,0.5)' : 'none' }} />
                                            ))}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.75rem', textAlign: 'right' }}>
                                            {act.count} TITLES
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    }

                    // Desktop: full framer-motion animations
                    return (
                        <motion.div
                            key={act.id}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "50px" }}
                            transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
                            whileHover={{ y: -4, transition: { type: 'spring', damping: 20 } }}
                            style={cardStyle}
                        >
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.8rem', borderBottom: '1px dashed rgba(139,105,20,0.2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ash)', border: '1px solid var(--sepia)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                                        <Buster size={14} mood={act.rating >= 4 ? 'smiling' : 'neutral'} />
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--parchment)' }}>@{act.user}</span>
                                </div>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>{act.time}</span>
                            </div>
                            {act.type === 'review' || act.type === 'log' ? (
                                <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                                    {act.film?.poster_path && (
                                        <div style={{ width: 56, height: 84, flexShrink: 0, borderRadius: '3px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.6)' }}>
                                            <img src={tmdb.poster(act.film.poster_path, 'w92')} alt={act.film.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.2) contrast(1.1)' }} />
                                        </div>
                                    )}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <Link to={`/film/${act.film?.id}`} style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.2, textDecoration: 'none', marginBottom: '0.3rem' }}>{act.film?.title}</Link>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            {act.rating && <ReelRating value={act.rating} size="sm" />}
                                            {act.status === 'rewatched' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>↩ REWATCHED</span>}
                                        </div>
                                        {act.text && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', fontStyle: 'italic', lineHeight: 1.5, opacity: 0.9, marginTop: '0.2rem' }}>"{act.text}"</p>}
                                        {act.watchedWith && (
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: 'auto', paddingTop: '0.75rem' }}>
                                                ♡ WITH <span style={{ color: 'var(--bone)' }}>{act.watchedWith.toUpperCase()}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                        <span style={{ color: 'var(--sepia)' }}>✦</span>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>CREATED A LIST</div>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1.05rem', color: 'var(--parchment)', marginBottom: '1rem' }}>{act.title}</div>
                                    <div style={{ display: 'flex', gap: 4, height: 60, overflow: 'hidden', borderRadius: '3px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                                        {act.films.map((f, fi) => (
                                            <img key={fi} src={tmdb.poster(f.poster_path, 'w92')} style={{ flex: 1, objectFit: 'cover', filter: 'sepia(0.3) brightness(0.8)', borderRight: fi < act.films.length - 1 ? '1px solid rgba(0,0,0,0.5)' : 'none' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.75rem', textAlign: 'right' }}>
                                        {act.count} TITLES
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )
                })}
            </div>
        </section>
    )
})

// ── MAIN HOME PAGE ──
export default function HomePage() {
    const navigate = useNavigate()

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

    const tickerItems = films.slice(0, 10).map((f) => f.title).filter(Boolean)

    return (
        <>


            {/* Ticker strip */}
            <div className="page-top">
                <Ticker items={tickerItems} />
            </div>

            {/* Hero section — mobile: compact, no minHeight, no heavy backdrop */}
            <section style={{
                padding: IS_TOUCH ? '1.5rem 0 1rem' : '6rem 0 4rem',
                minHeight: IS_TOUCH ? 'unset' : '80vh',
                display: 'flex',
                alignItems: 'center',
                position: 'relative'
            }}>
                {heroFilm?.backdrop_path && !IS_TOUCH && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${tmdb.backdrop(heroFilm.backdrop_path, 'w1280')})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center 15%',
                        opacity: 0.25,
                        maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
                        zIndex: -1,
                        pointerEvents: 'none',
                        mixBlendMode: 'luminosity'
                    }} />
                )}
                {/* Spotlight ambient glow — desktop only */}
                {!IS_TOUCH && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(circle at center, transparent 0%, var(--ink) 90%)',
                        zIndex: -1,
                        pointerEvents: 'none',
                    }} />
                )}

                <div className="container" style={{ width: '100%', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' }}>

                    <div style={{ marginBottom: IS_TOUCH ? '1rem' : '2rem', textAlign: 'center' }}>
                        {!IS_TOUCH && <Buster size={48} mood="neutral" />}
                        <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.7rem' : '1rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginTop: IS_TOUCH ? '0' : '1rem' }}>
                            WELCOME TO THE LOBBY
                        </h2>
                    </div>

                    <MarqueeBoard film={heroFilm} />

                    {!isAuthenticated && (
                        <div style={{
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
                                <span style={{ display: 'block', color: 'var(--sepia)' }}>Join the society.</span>
                            </div>
                            {/* Decorative rule */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: IS_TOUCH ? '1.25rem 0' : '1.75rem 0', opacity: 0.4 }}>
                                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, var(--sepia))' }} />
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)' }}>✦ THE SOCIETY ✦</span>
                                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, var(--sepia))' }} />
                            </div>
                        </div>
                    )}

                    {/* CTA row */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: IS_TOUCH ? '1.5rem' : '2.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {isAuthenticated ? (
                            <button
                                className="btn btn-primary"
                                style={{
                                    fontSize: IS_TOUCH ? '0.85rem' : '1rem',
                                    padding: IS_TOUCH ? '0.9em 2em' : '1em 2.8em',
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
                                        fontSize: IS_TOUCH ? '0.85rem' : '1rem',
                                        padding: IS_TOUCH ? '0.9em 2em' : '1em 2.8em',
                                        boxShadow: '0 6px 28px rgba(139,105,20,0.45), 0 0 0 1px rgba(242,232,160,0.15)',
                                        letterSpacing: '0.18em',
                                    }}
                                    onClick={() => openSignupModal('cinephile')}
                                >
                                    ✦ PURCHASE TICKET
                                </button>
                                <button
                                    className="btn btn-ghost"
                                    style={{ fontSize: IS_TOUCH ? '0.75rem' : '0.85rem', padding: IS_TOUCH ? '0.75em 1.5em' : '0.9em 2em', borderColor: 'rgba(139,105,20,0.4)', background: 'rgba(10,7,3,0.7)', letterSpacing: '0.12em' }}
                                    onClick={() => openSignupModal('venue_owner')}
                                >
                                    I MANAGE A VENUE
                                </button>
                            </>
                        )}
                        <button
                            className="btn btn-ghost"
                            style={{ fontSize: IS_TOUCH ? '0.75rem' : '0.85rem', padding: IS_TOUCH ? '0.75em 1.5em' : '0.9em 2em', background: 'rgba(10,7,3,0.7)', letterSpacing: '0.12em' }}
                            onClick={() => navigate('/discover')}
                        >
                            BROWSE ARCHIVES
                        </button>
                    </div>
                </div>
            </section>

            {/* Main content */}
            <main style={{ background: 'var(--ink)', position: 'relative', zIndex: 1, paddingBottom: IS_TOUCH ? '6rem' : '5rem' }}>
                <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: IS_TOUCH ? '2.5rem' : '5rem' }}>

                    {/* Trending */}
                    {loadingTrend ? <FilmStripSkeleton count={8} /> : (
                        <FilmStripRow
                            films={films}
                            title="On The Marquee"
                            label="NOW SHOWING"
                            description="The features drawing the largest crowds this week across the globe."
                        />
                    )}

                    {/* Social Pulse */}
                    <div className="divider">✦ THE FOYER ✦</div>
                    <SocialPulse />

                    {/* Divider */}
                    <div className="divider">✦ TONIGHT'S PROGRAMME ✦</div>

                    {/* Featured review + film */}
                    {heroFilm && (
                        <section style={{ position: 'relative', margin: '2rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ width: '3px', height: '1.8rem', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))', borderRadius: '2px', boxShadow: '0 0 10px rgba(139,105,20,0.4)' }} />
                                <SectionHeader label="PICK OF THE WEEK" title="Featured Critique" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
                            </div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', paddingLeft: '1.5rem', opacity: 0.75, maxWidth: '600px', marginBottom: '3rem', textShadow: '0 1px 2px var(--ink)' }}>
                                A profound reflection from our community's most esteemed auteur.
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
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.color = 'var(--flicker)';
                                                e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)';
                                            }}
                                            onMouseLeave={(e) => {
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
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.color = 'var(--parchment)';
                                                e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)';
                                            }}
                                            onMouseLeave={(e) => {
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

                    {/* Top rated */}
                    <div className="divider">✦ THE ARCHIVES ✦</div>
                    {loadingTop ? <FilmStripSkeleton count={8} /> : (
                        <FilmStripRow
                            films={topFilms}
                            title="The Canon"
                            label="ESSENTIAL VIEWING"
                            description="Timeless masterpieces that forever haunt the corridors of cinema."
                        />
                    )}

                    {/* Venue spotlight */}
                    <div className="divider">✦ THE PALACES ✦</div>
                    <VenueSpotlight />

                    {/* Buster CTA */}
                    {!isAuthenticated && (
                        <section style={{
                            textAlign: 'center',
                            padding: '4rem 2rem',
                            background: 'linear-gradient(to bottom, transparent, rgba(139,105,20,0.05))',
                            border: '1px solid rgba(139,105,20,0.2)',
                            borderRadius: '8px',
                            marginTop: '2rem'
                        }}>
                            <Buster size={120} mood="peeking" />
                            <div style={{ marginTop: '2rem' }}>
                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: 'var(--parchment)', marginBottom: '1rem', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                                    The House is Waiting
                                </h2>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', color: 'var(--bone)', maxWidth: 540, margin: '0 auto 2rem', lineHeight: 1.6 }}>
                                    Log every frame you've witnessed. Review with the fury of a true critic.
                                    Build enduring lists and track the ghosts of your cinematic past.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{ fontSize: '1.1rem', padding: '1em 3em', boxShadow: '0 4px 20px rgba(139,105,20,0.4)' }}
                                    onClick={() => openSignupModal()}
                                >
                                    Admit One
                                </button>
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </>
    )
}
