import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../store'
import { ReelRating, SectionHeader, RadarChart } from '../components/UI'
import { tmdb } from '../tmdb'
import { Heart, MessageSquare, Bookmark } from 'lucide-react'
import ReactionBar from '../components/ReactionBar'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

// ── ACTIVITY CARD ──
function ActivityCard({ log }) {
    const toggleEndorse = useFilmStore(state => state.toggleEndorse)
    const isEndorsed = useFilmStore(state => state.interactions.some(i => i.targetId === log.id && i.type === 'endorse'))
    // Fix 3: real endorsement count from DB, not Math.random()
    const [endorsementCount, setEndorsementCount] = useState(log.endorsementCount ?? 0)

    const handleEndorse = () => {
        toggleEndorse(log.id)
        setEndorsementCount(p => isEndorsed ? Math.max(0, p - 1) : p + 1)
    }
    const endorsed = isEndorsed

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

            {/* Poster */}
            <div style={{ width: 80, height: 120, flexShrink: 0, borderRadius: '2px', overflow: 'hidden', background: 'var(--ink)', border: '1px solid var(--ash)', position: 'relative' }}>
                {log.film?.poster ? (
                    <img
                        src={tmdb.poster(log.film.poster, 'w185')}
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
                        @{(log.user || 'anonymous').toUpperCase()}
                    </Link>
                    <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                        color: log.userRole === 'auteur' ? 'var(--sepia)' : 'var(--fog)'
                    }}>
                        — {(log.userRole || 'cinephile').toUpperCase()} {log.userRole === 'auteur' && '✦'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <Link
                        to={`/film/${log.film?.id}`}
                        style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', textDecoration: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                    >
                        {log.film?.title}
                    </Link>
                    {log.film?.year && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                            {log.film.year}
                        </span>
                    )}
                </div>

                {log.rating > 0 && <ReelRating value={log.rating} size="sm" />}

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
                            <span>{log.review.length > 300 ? log.review.slice(0, 300) + '…' : log.review}</span>
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
                        <MessageSquare size={12} /> ADD A NOTE
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
                    />
                </div>
            </div>
        </div>
    )
}

// ── FEED PAGE ──
export default function FeedPage() {
    const isAuthenticated = useAuthStore(state => state.isAuthenticated)
    const user = useAuthStore(state => state.user)
    const openSignupModal = useUIStore(state => state.openSignupModal)

    // Fix 1: Real community feed from Supabase — all users' logs
    const [communityFeed, setCommunityFeed] = useState([])
    const [feedLoading, setFeedLoading] = useState(true)

    // Fix 2: Real sidebar data from Supabase
    const [recentLists, setRecentLists] = useState([])
    const [activeAgents, setActiveAgents] = useState([])

    const fetchCommunityFeed = useCallback(async () => {
        if (!isSupabaseConfigured) { setFeedLoading(false); return }
        setFeedLoading(true)
        try {
            // Note: explicit FK hint solves PGRST201 ambiguous relationship error
            // 'profiles!logs_user_id_fkey' tells PostgREST which FK path to use
            const { data, error } = await supabase
                .from('logs')
                .select('*, profiles!logs_user_id_fkey(username, role)')
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error && data) {
                setCommunityFeed(data.map(l => ({
                    id: l.id,
                    user: l.profiles?.username || 'anonymous',
                    userRole: l.profiles?.role || 'cinephile',
                    film: {
                        id: l.film_id,
                        title: l.film_title,
                        year: l.year,
                        poster: l.poster_path,
                    },
                    rating: l.rating,
                    review: l.review,
                    pullQuote: l.pull_quote || '',
                    dropCap: l.drop_cap || false,
                    autopsy: l.autopsy,
                    isAutopsied: l.is_autopsied || false,
                    endorsementCount: 0, // Could join interactions count here later
                    timestamp: l.created_at
                        ? new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()
                        : 'RECENT'
                })))
            }
        } catch (e) {
            console.error('Feed fetch error:', e)
        }
        setFeedLoading(false)
    }, [])

    const fetchSidebarData = useCallback(async () => {
        if (!isSupabaseConfigured) return
        try {
            // Real recent public lists — explicit FK to avoid ambiguous relationship
            const { data: listsData } = await supabase
                .from('lists')
                .select('id, title, description, profiles!lists_user_id_fkey(username)')
                .order('created_at', { ascending: false })
                .limit(3)

            if (listsData) {
                setRecentLists(listsData.map(l => ({
                    id: l.id,
                    title: l.title,
                    curator: l.profiles?.username || 'anonymous'
                })))
            }

            // Real active agents: users with most recent log activity — explicit FK
            const { data: agentsData } = await supabase
                .from('logs')
                .select('profiles!logs_user_id_fkey(username)')
                .order('created_at', { ascending: false })
                .limit(20)

            if (agentsData) {
                const seen = new Set()
                const unique = []
                for (const row of agentsData) {
                    const name = row.profiles?.username
                    if (name && !seen.has(name) && name !== user?.username) {
                        seen.add(name)
                        unique.push(name)
                        if (unique.length >= 5) break
                    }
                }
                setActiveAgents(unique)
            }
        } catch (e) {
            console.error('Sidebar fetch error:', e)
        }
    }, [user?.username])

    useEffect(() => {
        fetchCommunityFeed()
        fetchSidebarData()
    }, [fetchCommunityFeed, fetchSidebarData])

    return (
        <div style={{ paddingTop: 70, minHeight: '100vh', background: 'var(--ink)' }}>
            {/* Header */}
            <div style={{
                background: 'var(--ink)',
                borderBottom: '1px solid var(--ash)',
                padding: '4rem 0 3rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div className="container" style={{ position: 'relative', zIndex: 1, maxWidth: 800, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE REEL
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: 'var(--parchment)', marginBottom: '1.5rem', lineHeight: 1, textShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                        Community Intelligence
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '1.1rem', color: 'var(--fog)', maxWidth: 600, margin: '0 auto' }}>
                        Reviews, logs, and dispatches from the society.
                    </p>
                </div>
            </div>

            <main className="page-top" style={{ paddingBottom: '7rem', paddingTop: '3rem' }}>
                <div className="container feed-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '3rem', alignItems: 'start' }}>

                    {/* Main Feed */}
                    <div className="feed-main">

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

                        {feedLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="skeleton" style={{ height: 160, borderRadius: '2px' }} />
                                ))}
                            </div>
                        ) : communityFeed.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Premium empty state */}
                                <div style={{
                                    border: '1px solid var(--ash)',
                                    padding: '3rem 2rem',
                                    textAlign: 'center',
                                    background: 'linear-gradient(180deg, rgba(28,23,16,0.6) 0%, transparent 100%)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                                        PROJECTION BOOTH — STANDING BY
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                                        The ink is fresh.
                                    </div>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)', opacity: 0.6, lineHeight: 1.7, maxWidth: 400, margin: '0 auto 2rem' }}>
                                        Be the first to transmit a cinematic dispatch and leave your mark in the Society's permanent record.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: '0.9rem 2.5rem', letterSpacing: '0.2em', fontSize: '0.7rem' }}
                                        onClick={() => openLogModal()}
                                    >
                                        LOG THE FIRST FILM
                                    </button>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, var(--sepia), transparent)' }} />
                                </div>

                                {/* Society Picks — hand-curated placeholder cards */}
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--ash)', textAlign: 'center', opacity: 0.5 }}>
                                    ✦ SOCIETY PICKS — TONIGHT'S RECOMMENDED VIEWING ✦
                                </div>
                                {[
                                    { title: 'Nosferatu', year: '1922', note: 'The shadow that never left.', poster: null },
                                    { title: 'In the Mood for Love', year: '2000', note: 'Wong Kar-wai at his most devastating.', poster: null },
                                    { title: 'Stalker', year: '1979', note: 'A film that watches back.', poster: null },
                                ].map((pick) => (
                                    <div key={pick.title} style={{
                                        background: 'var(--soot)', border: '1px solid var(--ash)',
                                        borderLeft: '3px solid var(--ash)', borderRadius: '2px',
                                        padding: '1.25rem', display: 'flex', gap: '1.25rem',
                                        opacity: 0.45,
                                    }}>
                                        <div style={{ width: 56, height: 84, background: 'var(--ink)', border: '1px solid var(--ash)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px' }}>
                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--sepia)' }}>✦</span>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>SOCIETY PICK · {pick.year}</div>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>{pick.title}</div>
                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', fontStyle: 'italic', opacity: 0.7 }}>"{pick.note}"</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {communityFeed.map((log) => (
                                    <ActivityCard key={log.id} log={log} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="feed-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>


                        {/* Curated Lists — Real Supabase data */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem' }}>
                                CURATED LISTS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {recentLists.length === 0 ? (
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--fog)', opacity: 0.6 }}>
                                        No lists yet. Start curating.
                                    </div>
                                ) : recentLists.map((list) => (
                                    <Link key={list.id} to={`/lists`} style={{ textDecoration: 'none' }}>
                                        <div style={{ padding: '0.75rem', background: 'var(--ink)', border: '1px solid var(--ash)', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.35rem' }}>
                                                {list.title}
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                                BY @{list.curator.toUpperCase()}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            <Link to="/lists" style={{ display: 'inline-block', marginTop: '1.25rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', borderBottom: '1px dashed var(--sepia)' }}>
                                BROWSE ALL LISTS
                            </Link>
                        </div>

                        {/* Active Field Agents — Real Supabase data */}
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid var(--ash)', paddingBottom: '0.5rem' }}>
                                ACTIVE FIELD AGENTS
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {activeAgents.length === 0 ? (
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--fog)', opacity: 0.6 }}>
                                        No activity yet.
                                    </div>
                                ) : activeAgents.map((agent) => (
                                    <Link
                                        key={agent}
                                        to={`/user/${agent}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--soot)', border: '1px solid var(--ash)', textDecoration: 'none', borderRadius: '2px', transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(28,23,16,0.8)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--soot)'}
                                    >
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                                            👁️
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--bone)' }}>
                                            @{agent.toUpperCase()}
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
