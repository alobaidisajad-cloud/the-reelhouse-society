import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore, useVenueStore } from '../store'
import { ReelRating, SectionHeader, RadarChart, PersonPlaceholder } from '../components/UI'
import { tmdb } from '../tmdb'
import { Heart, MessageSquare, Bookmark } from 'lucide-react'
import ReactionBar from '../components/ReactionBar'

// Community logs and venue events are now powered dynamically by Zustand stores.

function ActivityCard({ log }) {
    const toggleEndorse = useFilmStore(state => state.toggleEndorse)
    const isEndorsed = useFilmStore(state => state.interactions.some(i => i.targetId === log.id && i.type === 'endorse'))
    const [endorsementCount, setEndorsementCount] = useState(Math.floor(Math.random() * 40) + (isEndorsed ? 3 : 2))
    const [reactions, setReactions] = useState({})

    const handleEndorse = () => {
        toggleEndorse(log.id)
        if (isEndorsed) {
            setEndorsementCount(p => p - 1);
        } else {
            setEndorsementCount(p => p + 1);
        }
    }
    const endorsed = isEndorsed;

    return (
        <div
            className="fade-in-up"
            style={{
                background: 'var(--soot)',
                border: '1px solid var(--ash)',
                borderRadius: '2px',
                padding: '1.25rem',
                position: 'relative',
                display: 'flex',
                gap: '1.25rem',
                borderLeft: '3px solid var(--sepia)'
            }}
        >
            {/* Timestamp */}
            <div style={{ position: 'absolute', top: '1rem', right: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                {log.timestamp || 'RECENT'}
            </div>

            {/* Poster Dossier Style */}
            <div style={{ width: 80, height: 120, flexShrink: 0, borderRadius: '2px', overflow: 'hidden', background: 'var(--ink)', border: '1px solid var(--ash)', position: 'relative' }}>
                {log.altPoster || log.film.poster ? (
                    <img
                        src={tmdb.poster(log.altPoster || log.film.poster, 'w185')}
                        alt={log.film.title}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9, mixBlendMode: 'luminosity' }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)', fontSize: '1.2rem', background: 'var(--ink)' }}>🎬</div>
                )}
                <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(139,105,20,0.1)', pointerEvents: 'none' }} />
            </div>

            {/* Content Body */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <Link to={`/user/${log.user}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none' }}>
                        @{log.user.toUpperCase()}
                    </Link>
                    <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                        color: log.userRole === 'auteur' ? 'var(--sepia)' : 'var(--fog)'
                    }}>
                        — {log.userRole?.toUpperCase() || log.persona.toUpperCase()} {log.userRole === 'auteur' && '✦'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <Link
                        to={`/film/${log.film.id}`}
                        style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', textDecoration: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                    >
                        {log.film.title}
                    </Link>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                        {log.film.year}
                    </span>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <ReelRating value={log.rating} size="md" />
                </div>

                {/* Editorial Header */}
                {log.editorialHeader && (
                    <div style={{ marginTop: '0.75rem', width: '100%', height: 120, borderRadius: '4px', overflow: 'hidden' }}>
                        <img
                            src={tmdb.backdrop(log.editorialHeader, 'w780')}
                            alt="Scene from film"
                            loading="lazy"
                            decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3) contrast(1.1)' }}
                        />
                    </div>
                )}

                {/* Pull Quote */}
                {log.pullQuote && (
                    <div style={{
                        marginTop: '1rem', marginBottom: '1rem', paddingLeft: '1rem', borderLeft: '4px solid var(--sepia)',
                        fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--sepia)', fontStyle: 'italic',
                        lineHeight: 1.2
                    }}>
                        "{log.pullQuote}"
                    </div>
                )}

                {/* Review text */}
                {log.review && (
                    <div style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                        color: 'var(--bone)', marginTop: '0.75rem', lineHeight: 1.6,
                    }}>
                        {log.dropCap ? (
                            <>
                                <span style={{
                                    float: 'left', fontSize: '3rem', lineHeight: '2.5rem',
                                    padding: '0.2rem 0.5rem 0 0', fontFamily: 'var(--font-display)',
                                    color: 'var(--sepia)'
                                }}>
                                    {log.review.charAt(0)}
                                </span>
                                {log.review.slice(1)}
                            </>
                        ) : (
                            <span>{log.review}</span>
                        )}
                    </div>
                )}

                {log.isAutopsied && log.autopsy && (
                    <RadarChart autopsy={log.autopsy} size={140} />
                )}

                {/* Social Interaction Bar */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(139,105,20,0.2)' }}>
                    <button onClick={handleEndorse} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: endorsed ? 'var(--parchment)' : 'var(--fog)', cursor: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'} onMouseLeave={e => e.currentTarget.style.color = endorsed ? 'var(--parchment)' : 'var(--fog)'}>
                        <Heart size={12} fill={endorsed ? 'var(--sepia)' : 'none'} color={endorsed ? 'var(--sepia)' : 'currentColor'} />
                        {endorsed ? 'ENDORSED' : 'ENDORSE'} ({endorsementCount})
                    </button>
                    <button style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', cursor: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>
                        <MessageSquare size={12} /> ADD DOSSIER NOTE
                    </button>
                    <button style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', cursor: 'none', transition: 'color 0.2s', marginLeft: 'auto' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>
                        <Bookmark size={12} /> RE-TRANSMIT
                    </button>
                </div>

                {/* Emoji Reactions */}
                <div style={{ marginTop: '0.75rem' }}>
                    <ReactionBar
                        logId={log.id}
                        logAuthor={log.user}
                        filmTitle={log.film?.title}
                        reactions={reactions}
                        onReact={(id, newReactions) => setReactions(newReactions)}
                    />
                </div>
            </div>
        </div>
    )
}


export default function FeedPage() {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const user = useAuthStore(state => state.user)
    const openSignupModal = useUIStore(state => state.openSignupModal)
    const logs = useFilmStore(state => state.logs)
    const events = useVenueStore(state => state.events)
    const venue = useVenueStore(state => state.venue)

    const allActivity = logs.map((l, i) => ({
        id: `my-${l.id}`, user: user?.username || 'cinephile', persona: 'Cinephile',
        film: { id: l.filmId, title: l.title, year: '2026', poster: l.poster },
        rating: l.rating, review: l.review,
        autopsy: l.autopsy, altPoster: l.altPoster, isAutopsied: l.isAutopsied,
        editorialHeader: l.editorialHeader, dropCap: l.dropCap, pullQuote: l.pullQuote,
        timestamp: l.createdAt ? new Date(l.createdAt).toLocaleDateString() : 'RECENT'
    }))

    return (
        <div style={{ paddingTop: 70, minHeight: '100vh', background: 'var(--ink)' }}>
            {/* Massive Centered Header Area */}
            <div style={{
                background: 'var(--ink)',
                borderBottom: '1px solid var(--ash)',
                padding: '4rem 0 3rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Vintage darkroom glow / halation */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE REEL
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: 'var(--parchment)', marginBottom: '1.5rem', lineHeight: 1, textShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                        Community Intelligence
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '1.1rem', color: 'var(--fog)', maxWidth: 600, margin: '0 auto' }}>
                        Transmissions, reviews, and archival logs from the house.
                    </p>
                </div>
            </div>

            <main className="page-top" style={{ paddingBottom: '7rem', paddingTop: '3rem' }}>
                <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '3rem', alignItems: 'start' }}>
                    {/* Feed */}
                    <div className="main-content">
                        <SectionHeader label="LATEST ACTIVITY" title="The Log" />

                        {!isAuthenticated && (
                            <div style={{
                                background: 'transparent', border: '1px dashed var(--ash)',
                                padding: '2rem', textAlign: 'center',
                                marginBottom: '2.5rem', borderRadius: '2px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
                            }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--sepia)' }}>
                                    The Archives Are Closed
                                </div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', maxWidth: 400, lineHeight: 1.5 }}>
                                    Ascend to The Society to trace the footsteps of the finest critics and transmit your own cinematic intelligence.
                                </div>
                                <button className="btn btn-primary" style={{ padding: '1rem 3rem', letterSpacing: '0.2em' }} onClick={() => openSignupModal()}>
                                    CLAIM YOUR SEAT
                                </button>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {allActivity.map((log) => (
                                <ActivityCard key={log.id} log={log} />
                            ))}
                        </div>
                    </div>

                    {/* Sidebar - Control Panel Aesthetic */}
                    <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {/* Venue Events Archive Block */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem' }}>
                                UPCOMING TRANSMISSIONS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {events.slice(0, 3).map((e, i) => (
                                    <div key={e.id || i}>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--flicker)', marginBottom: '0.3rem' }}>
                                            {e.date} · {venue?.name?.toUpperCase() || 'THE ORACLE PALACE'}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)', lineHeight: 1.4 }}>
                                            {e.title}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Link to="/venue/1" style={{ display: 'inline-block', marginTop: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', borderBottom: '1px dashed var(--sepia)' }}>
                                ACCESS ALL VENUES
                            </Link>
                        </div>

                        {/* Classified Dossiers (Lists) Block */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem', marginTop: '1.5rem' }}>
                                CLASSIFIED DOSSIERS (COMMUNITY LISTS)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {[
                                    { title: "KOREAN NEW WAVE: BLOOD & RAIN", films: 42, cur: "midnight_devotee" },
                                    { title: "FILMS THAT FEEL LIKE A FEVER DREAM", films: 18, cur: "weeper_in_the_dark" },
                                    { title: "THE 70S PARANOIA TRILOGY + EXTRAS", films: 35, cur: "the_archivist_84" }
                                ].map((list, i) => (
                                    <div key={i} style={{ padding: '0.75rem', background: 'var(--ink)', border: '1px solid var(--ash)', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.35rem' }}>
                                            {list.title}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                            <span>{list.films} TRANSMISSIONS</span>
                                            <span>BY @{list.cur.toUpperCase()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Link to="/" style={{ display: 'inline-block', marginTop: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', borderBottom: '1px dashed var(--sepia)' }}>
                                ACCESS ALL DOSSIERS
                            </Link>
                        </div>

                        {/* Active members Block */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem', marginTop: '1rem' }}>
                                ACTIVE FIELD AGENTS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {['midnight_devotee', 'the_archivist_84', 'weeper_in_the_dark', 'contrarian_rex', 'completionist_jane'].map((user) => (
                                    <Link
                                        key={user}
                                        to={`/user/${user}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--soot)', border: '1px solid var(--ash)', textDecoration: 'none', borderRadius: '2px', transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(28,23,16,0.8)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--soot)'}
                                    >
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                                            👁️
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--bone)' }}>
                                            @{user.toUpperCase()}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
