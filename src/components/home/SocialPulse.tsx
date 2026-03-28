import { RotateCcw } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { tmdb } from '../../tmdb'
import { useFilmStore, useAuthStore } from '../../store'
import { SectionHeader, ReelRating } from '../UI'
import Buster from '../Buster'

import { useViewport } from '../../hooks/useViewport'

const SocialPulse = memo(function SocialPulse() {
    const { isTouch: IS_TOUCH } = useViewport()
    const { logs } = useFilmStore()
    const { user } = useAuthStore()

    const publicLogs = logs.filter((l: any) => l.rating > 0 || (l.review && l.review.trim() !== ''))

    if (publicLogs.length === 0) {
        return (
            <section style={{ position: 'relative', margin: '4rem 0 2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ width: '3px', height: '1.8rem', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))', borderRadius: '2px', boxShadow: '0 0 10px rgba(139,105,20,0.4)' }} />
                    <SectionHeader label="LIVE FROM THE FOYER" title="The Pulse" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
                </div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', paddingLeft: '1.5rem', opacity: 0.75, maxWidth: '600px', marginBottom: '2.5rem', textShadow: '0 1px 2px var(--ink)' }}>
                    Witness the latest logs, lists, and critiques from the devotees.
                </p>
                {/* Cinematic empty-state — three ghost activity cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {[
                        { label: 'SIGNAL QUIET', title: 'The Lobby is quiet.', sub: 'Be the first to log a film and claim this space.' },
                        { label: 'AWAITING DISPATCH', title: 'No critiques yet.', sub: 'File a review and let the projection box light up.' },
                        { label: 'DOORS OPEN', title: 'The house awaits.', sub: 'Every great society needs its first member to speak.' },
                    ].map((card, i) => (
                        <div key={i} style={{
                            padding: '1.75rem 1.5rem',
                            background: 'rgba(18,14,9,0.6)',
                            borderLeft: '2px solid rgba(139,105,20,0.25)',
                            borderTop: '1px solid rgba(139,105,20,0.08)',
                            borderBottom: '1px solid rgba(139,105,20,0.04)',
                            borderRight: '1px solid rgba(139,105,20,0.04)',
                            borderRadius: '0 8px 8px 0',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)' }} />
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.3em', color: 'var(--sepia)', opacity: 0.5, marginBottom: '0.75rem' }}>{card.label}</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--parchment)', opacity: 0.45, marginBottom: '0.5rem' }}>{card.title}</div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', opacity: 0.3, lineHeight: 1.5, fontStyle: 'italic' }}>{card.sub}</div>
                        </div>
                    ))}
                </div>
            </section>
        )
    }

    const activities: any[] = publicLogs.slice(0, 5).map((log: any, i: number) => ({
        id: log.id || i,
        type: 'log',
        user: user?.username || 'cinephile',
        film: { id: log.filmId, title: log.title, poster_path: log.poster },
        rating: log.rating,
        text: log.review,
        status: log.status,
        watchedWith: log.watchedWith,
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
                    const cardStyle: React.CSSProperties = {
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

                    const cardContent = (
                        <>
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
                                        <div className="cine-card" style={{ width: 56, height: 84, flexShrink: 0, borderRadius: '3px', overflow: 'hidden' }}>
                                            <img src={tmdb.poster(act.film.poster_path, 'w92')} loading="lazy" alt={act.film.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.2) contrast(1.1)' }} />
                                        </div>
                                    )}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <Link to={`/film/${act.film?.id}`} style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.2, textDecoration: 'none', marginBottom: '0.3rem' }}>{act.film?.title}</Link>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            {act.rating && <ReelRating value={act.rating} size="sm" />}
                                            {act.status === 'rewatched' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>{<RotateCcw size={10} style={{ display: "inline-block", verticalAlign: "middle" }} />} REWATCHED</span>}
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
                                    <div className="cine-card" style={{ display: 'flex', gap: 4, height: 60, overflow: 'hidden', borderRadius: '3px' }}>
                                        {act.films.map((f: any, fi: number) => (
                                            <img key={fi} src={tmdb.poster(f.poster_path, 'w92')} loading="lazy" alt={f.title} style={{ flex: 1, objectFit: 'cover', filter: 'sepia(0.3) brightness(0.8)', borderRight: fi < act.films.length - 1 ? '1px solid rgba(0,0,0,0.5)' : 'none' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.75rem', textAlign: 'right' }}>
                                        {act.count} TITLES
                                    </div>
                                </div>
                            )}
                        </>
                    )

                    // Mobile: plain div — no framer observers, no layout animations
                    if (IS_TOUCH) {
                        return <div key={act.id} style={cardStyle}>{cardContent}</div>
                    }

                    // Desktop: full framer-motion animations
                    return (
                        <motion.div
                            key={act.id}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "50px" }}
                            transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
                            style={cardStyle}
                        >
                            {cardContent}
                        </motion.div>
                    )
                })}
            </div>
        </section>
    )
})

export default SocialPulse
