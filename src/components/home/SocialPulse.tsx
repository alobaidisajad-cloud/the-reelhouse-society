import { RotateCcw } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../supabaseClient'
import { tmdb } from '../../tmdb'
import { SectionHeader, ReelRating } from '../UI'
import Buster from '../Buster'
import { useViewport } from '../../hooks/useViewport'

const SocialPulse = memo(function SocialPulse() {
    const { isTouch: IS_TOUCH } = useViewport()

    // ── Real community logs from Supabase — not local store ──
    const { data: communityLogs = [] } = useQuery({
        queryKey: ['community-pulse'],
        queryFn: async () => {
            const { data } = await supabase
                .from('logs')
                .select(`
                    id, film_id, film_title, poster_path, rating, review, status, watched_with, created_at, user_id,
                    profiles!logs_user_id_fkey ( username )
                `)
                .or('rating.gt.0,review.neq.')
                .order('created_at', { ascending: false })
                .limit(6)
            return (data || []).map((log: any) => ({
                id: log.id,
                type: 'log',
                user: log.profiles?.username || 'cinephile',
                film: { id: log.film_id, title: log.film_title, poster_path: log.poster_path },
                rating: log.rating,
                text: log.review,
                status: log.status,
                watchedWith: log.watched_with,
                time: new Date(log.created_at || Date.now()).toLocaleDateString(),
            }))
        },
        staleTime: 1000 * 60 * 2, // Cache 2 minutes
    })

    const activities = communityLogs

    return (
        <section style={{ position: 'relative', margin: '4rem 0 2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ width: '3px', height: '1.8rem', background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))', borderRadius: '2px', boxShadow: '0 0 10px rgba(139,105,20,0.4)' }} />
                <SectionHeader label="LIVE FROM THE FOYER" title="The Pulse" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
            </div>

            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', paddingLeft: '1.5rem', opacity: 0.75, maxWidth: '600px', marginBottom: '2.5rem', textShadow: '0 1px 2px var(--ink)' }}>
                The latest dispatches from the society.
            </p>

            {activities.length === 0 ? (
                /* ── Dark Screening Room — single atmospheric empty state ── */
                <div style={{
                    padding: IS_TOUCH ? '2.5rem 1.5rem' : '3.5rem 2.5rem',
                    background: 'linear-gradient(180deg, rgba(139,105,20,0.04) 0%, transparent 30%), rgba(18,14,9,0.7)',
                    borderLeft: '2px solid rgba(139,105,20,0.2)',
                    borderTop: '1px solid rgba(139,105,20,0.08)',
                    borderBottom: '1px solid rgba(139,105,20,0.04)',
                    borderRight: '1px solid rgba(139,105,20,0.04)',
                    borderRadius: '0 8px 8px 0',
                    textAlign: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)' }} />
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.3em', color: 'var(--sepia)', opacity: 0.6, marginBottom: '1rem' }}>SIGNAL QUIET</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '1.3rem' : '1.5rem', color: 'var(--parchment)', opacity: 0.70, marginBottom: '0.75rem' }}>The screening room is dark.</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', opacity: 0.50, lineHeight: 1.6, fontStyle: 'italic', maxWidth: 400, margin: '0 auto' }}>When a member logs their first film, it will appear here.</div>
                    <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(139,105,20,0.15), transparent)', margin: '1.5rem auto 0', maxWidth: 200 }} />
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: IS_TOUCH ? '1rem' : '2rem' }}>
                    {activities.map((act: any, i: number) => {
                        const cardStyle: React.CSSProperties = {
                            position: 'relative',
                            padding: IS_TOUCH ? '1rem' : '1.5rem',
                            /* ── Warm depth: light from above ── */
                            background: 'linear-gradient(180deg, rgba(139,105,20,0.04) 0%, transparent 30%), rgba(18,14,9,0.95)',
                            borderLeft: '2px solid var(--sepia)',
                            borderTop: '1px solid rgba(139,105,20,0.1)',
                            borderBottom: '1px solid rgba(139,105,20,0.05)',
                            borderRight: '1px solid rgba(139,105,20,0.05)',
                            borderRadius: '0 8px 8px 0',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'border-color 0.3s ease',
                            overflow: 'hidden',
                        }

                        const cardContent = (
                            <>
                                {/* Top-edge warm highlight line */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)' }} />
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
                                <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                                    {act.film?.poster_path && (
                                        <Link to={`/film/${act.film?.id}`} className="cine-card" style={{ width: 56, height: 84, flexShrink: 0, borderRadius: '3px', overflow: 'hidden', display: 'block' }}>
                                            <img src={tmdb.poster(act.film.poster_path, 'w92')} loading="lazy" alt={act.film.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.2) contrast(1.1)' }} />
                                        </Link>
                                    )}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <Link to={`/film/${act.film?.id}`} style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.2, textDecoration: 'none', marginBottom: '0.3rem' }}>{act.film?.title}</Link>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            {act.rating && <ReelRating value={act.rating} size="sm" />}
                                            {act.status === 'rewatched' && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>{<RotateCcw size={10} style={{ display: "inline-block", verticalAlign: "middle" }} />} REWATCHED</span>}
                                        </div>
                                        {act.text && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--bone)', fontStyle: 'italic', lineHeight: 1.5, opacity: 0.9, marginTop: '0.2rem' }}>"{act.text.length > 150 ? act.text.slice(0, 150) + '…' : act.text}"</p>}
                                        {act.watchedWith && (
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: 'auto', paddingTop: '0.75rem' }}>
                                                ♡ WITH <span style={{ color: 'var(--bone)' }}>{act.watchedWith.toUpperCase()}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )

                        if (IS_TOUCH) {
                            return <Link key={act.id} to={`/log/${act.id}`} style={{ ...cardStyle, textDecoration: 'none', color: 'inherit' }}>{cardContent}</Link>
                        }

                        return (
                            <motion.div
                                key={act.id}
                                initial={{ opacity: 0, y: 15 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "50px" }}
                                transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
                                style={cardStyle}
                                onMouseEnter={(e: any) => { e.currentTarget.style.borderLeftColor = 'var(--flicker)' }}
                                onMouseLeave={(e: any) => { e.currentTarget.style.borderLeftColor = 'var(--sepia)' }}
                            >
                                <Link to={`/log/${act.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
                                    {cardContent}
                                </Link>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </section>
    )
})

export default SocialPulse
