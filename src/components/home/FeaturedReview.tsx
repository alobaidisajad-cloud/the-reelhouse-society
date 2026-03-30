import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../supabaseClient'
import { tmdb } from '../../tmdb'
import { ReelRating } from '../UI'
import Buster from '../Buster'
import { useViewport } from '../../hooks/useViewport'
import { useUIStore } from '../../store'

/**
 * FeaturedReview — surfaces the hottest critique from the last 24 hours.
 * Fully self-contained: owns its own film poster (sourced from the critique),
 * "READ ALL CRITIQUES" and "LOG THIS FILM +" actions.
 * Falls back to the most recent reviewed log if nothing qualifies in 24h.
 */
const FeaturedReview = memo(function FeaturedReview() {
    const navigate = useNavigate()
    const { isTouch: IS_TOUCH } = useViewport()
    const openLogModal = useUIStore(state => state.openLogModal)

    const { data: featuredCritique } = useQuery({
        queryKey: ['featured-critique-24h'],
        queryFn: async () => {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

            // Strategy 1: Find the log with most engagement in the last 24h
            const { data: hotLogs } = await supabase
                .from('logs')
                .select(`
                    id, film_id, film_title, poster_path, rating, review, created_at, user_id,
                    profiles!logs_user_id_fkey ( username )
                `)
                .not('review', 'is', null)
                .neq('review', '')
                .gt('rating', 0)
                .gte('created_at', twentyFourHoursAgo)
                .order('created_at', { ascending: false })
                .limit(20)

            if (hotLogs && hotLogs.length > 0) {
                const logIds = hotLogs.map((l: any) => l.id)
                const [endorseResult, commentResult] = await Promise.all([
                    supabase
                        .from('interactions')
                        .select('target_log_id')
                        .eq('type', 'endorse_log')
                        .in('target_log_id', logIds),
                    supabase
                        .from('log_comments')
                        .select('log_id')
                        .in('log_id', logIds),
                ])

                const engagement: Record<string, number> = {}
                ;(endorseResult.data || []).forEach((e: any) => {
                    engagement[e.target_log_id] = (engagement[e.target_log_id] || 0) + 1
                })
                ;(commentResult.data || []).forEach((c: any) => {
                    engagement[c.log_id] = (engagement[c.log_id] || 0) + 1
                })

                const sorted = [...hotLogs].sort((a: any, b: any) => {
                    const engA = engagement[a.id] || 0
                    const engB = engagement[b.id] || 0
                    if (engB !== engA) return engB - engA
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                })

                const winner = sorted[0]
                return {
                    logId: winner.id,
                    text: winner.review,
                    author: ((winner as any).profiles?.username || 'ANONYMOUS').toUpperCase(),
                    rating: winner.rating || 0,
                    film: { id: winner.film_id, title: winner.film_title, poster_path: winner.poster_path },
                    endorsements: engagement[winner.id] || 0,
                }
            }

            // Fallback: most recent reviewed log of all time
            const { data: fallback } = await supabase
                .from('logs')
                .select(`
                    id, film_id, film_title, poster_path, rating, review, created_at, user_id,
                    profiles!logs_user_id_fkey ( username )
                `)
                .not('review', 'is', null)
                .neq('review', '')
                .gt('rating', 0)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (!fallback) return null

            return {
                logId: fallback.id,
                text: fallback.review,
                author: ((fallback as any).profiles?.username || 'ANONYMOUS').toUpperCase(),
                rating: fallback.rating || 0,
                film: { id: fallback.film_id, title: fallback.film_title, poster_path: fallback.poster_path },
                endorsements: 0,
            }
        },
        staleTime: 1000 * 60 * 5,
    })

    const displayReview = featuredCritique
        ? { logId: featuredCritique.logId, text: featuredCritique.text, author: featuredCritique.author, rating: featuredCritique.rating, film: featuredCritique.film }
        : { logId: null as string | null, text: 'The projection box awaits. Be the first to file a dispatch on any title and claim this space in the archive.', author: 'THE SOCIETY', rating: 0, film: null }

    const film = displayReview.film

    return (
        <div className="layout-sidebar" style={{ alignItems: 'flex-start' }}>
            {/* ── Poster column — display case lighting ── */}
            {!IS_TOUCH && (
                <div style={{ maxWidth: 220, margin: '0 auto', flexShrink: 0 }}>
                    <div
                        className="poster-display-case"
                        style={{
                            position: 'relative',
                            padding: '0.5rem',
                            background: 'var(--soot)',
                            borderRadius: '4px',
                            border: '1px solid rgba(139,105,20,0.15)',
                            boxShadow: '0 15px 35px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,105,20,0.08)',
                            cursor: film ? 'pointer' : 'default',
                        }}
                        onClick={() => film && navigate(`/film/${film.id}`)}
                    >
                        {film?.poster_path ? (
                            <img
                                src={tmdb.poster(film.poster_path, 'w342')}
                                alt={film.title}
                                loading="lazy"
                                style={{
                                    width: '100%',
                                    aspectRatio: '2/3',
                                    objectFit: 'cover',
                                    borderRadius: '2px',
                                    filter: 'sepia(0.12) contrast(1.05)',
                                    display: 'block',
                                }}
                            />
                        ) : (
                            <div style={{
                                width: '100%',
                                aspectRatio: '2/3',
                                background: 'linear-gradient(160deg, rgba(35,28,20,1) 0%, rgba(10,7,3,1) 100%)',
                                borderRadius: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', opacity: 0.4 }}>
                                    UNRELEASED
                                </span>
                            </div>
                        )}
                        {/* Projector light from above the poster */}
                        <div style={{
                            position: 'absolute',
                            top: '-16px', left: '10%', right: '10%',
                            height: '16px',
                            background: 'radial-gradient(ellipse at center bottom, rgba(196,150,26,0.3) 0%, transparent 80%)',
                            pointerEvents: 'none',
                        }} />
                    </div>
                    {film && (
                        <div style={{
                            marginTop: '0.75rem',
                            textAlign: 'center',
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.5rem',
                            letterSpacing: '0.15em',
                            color: 'var(--sepia)',
                            opacity: 0.7,
                        }}>
                            {film.title?.toUpperCase()}
                        </div>
                    )}
                </div>
            )}

            {/* ── Critique column ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                    position: 'relative',
                    padding: IS_TOUCH ? '1.5rem 1.25rem' : '2rem 2.5rem',
                    background: 'linear-gradient(180deg, rgba(139,105,20,0.04) 0%, transparent 30%), rgba(18,14,9,0.95)',
                    borderLeft: '2px solid var(--sepia)',
                    borderTop: '1px solid rgba(139,105,20,0.1)',
                    borderBottom: '1px solid rgba(139,105,20,0.05)',
                    borderRight: '1px solid rgba(139,105,20,0.05)',
                    borderRadius: '0 8px 8px 0',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    {/* Top-edge warm highlight line */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)' }} />
                    {/* Spotlight quotation mark */}
                    <div style={{
                        position: 'absolute', top: '1.5rem', left: IS_TOUCH ? '-0.75rem' : '-1.5rem',
                        color: 'var(--sepia)', fontSize: IS_TOUCH ? '2.5rem' : '3.5rem', lineHeight: 0, opacity: 0.30,
                        fontFamily: 'var(--font-display)',
                        textShadow: '0 0 15px rgba(139,105,20,0.3)',
                    }}>"</div>

                    {/* Mobile: show film title above review */}
                    {IS_TOUCH && film && (
                        <div style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.5rem',
                            letterSpacing: '0.2em',
                            color: 'var(--sepia)',
                            opacity: 0.75,
                            marginBottom: '0.75rem',
                        }}>
                            {film.title?.toUpperCase()}
                        </div>
                    )}

                    <p
                        onClick={() => displayReview.logId && navigate(`/log/${displayReview.logId}`)}
                        style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: IS_TOUCH ? '1rem' : '1.15rem',
                        fontStyle: 'italic',
                        color: 'var(--parchment)',
                        lineHeight: 1.8,
                        position: 'relative',
                        zIndex: 1,
                        textShadow: '0 1px 2px var(--ink)',
                        marginBottom: '1.5rem',
                        cursor: displayReview.logId ? 'pointer' : 'default',
                        transition: 'color 0.2s',
                    }}>
                        {displayReview.text.length > 280 ? displayReview.text.slice(0, 280) + '…' : displayReview.text}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px dashed rgba(139,105,20,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ash)', border: '1px solid var(--sepia)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                                <Buster size={16} mood="smiling" />
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--bone)' }}>
                                {displayReview.author.toUpperCase()}
                            </div>
                        </div>
                        {displayReview.rating > 0 && <ReelRating value={displayReview.rating} size="sm" />}
                    </div>
                </div>

                {/* Action buttons */}
                {film && (
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '2rem', paddingLeft: IS_TOUCH ? '0' : '0.5rem', alignItems: 'center' }}>
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
                                e.currentTarget.style.color = 'var(--flicker)'
                                e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)'
                            }}
                            onMouseLeave={(e: any) => {
                                e.currentTarget.style.color = 'var(--parchment)'
                                e.currentTarget.style.textShadow = 'none'
                            }}
                            onClick={() => navigate(`/film/${film.id}`)}
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
                                e.currentTarget.style.color = 'var(--parchment)'
                                e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)'
                            }}
                            onMouseLeave={(e: any) => {
                                e.currentTarget.style.color = 'var(--fog)'
                                e.currentTarget.style.textShadow = 'none'
                            }}
                            onClick={() => openLogModal(film)}
                        >
                            LOG THIS FILM <span style={{ color: 'var(--sepia)', fontSize: '1.2em', fontWeight: 'bold' }}>+</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
})

export default FeaturedReview
