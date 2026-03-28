import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../supabaseClient'
import { ReelRating } from '../UI'

import { useViewport } from '../../hooks/useViewport'

// Static — defined outside component so it's never re-created on re-render

const MarqueeBoard = memo(function MarqueeBoard({ film }: { film: any }) {
    const { isTouch: IS_TOUCH, isMobile } = useViewport()
    const MARQUEE_BULBS = Array.from({ length: IS_TOUCH ? 8 : 14 }) // fewer bulb animations on mobile

    // Smart Fallback Review Count
    const { data: localCount = 0 } = useQuery({
        queryKey: ['local-reviews-marquee', film?.id],
        queryFn: async () => {
            if (!film?.id) return 0
            const { count } = await supabase.from('logs').select('*', { count: 'exact', head: true }).eq('film_id', film.id)
            return count || 0
        },
        enabled: !!film?.id
    })

    const reviewText = localCount > 0 
        ? `${localCount} SOCIETY REVIEW${localCount === 1 ? '' : 'S'}`
        : `${Math.round((film?.vote_count || 0) / 100) * 100}+ GLOBAL RATINGS`

    if (!film) return (
        <div style={{
            position: 'relative',
            padding: IS_TOUCH ? '0 0 1rem' : '0 0 2rem',
            maxWidth: '800px',
            margin: '0 auto',
            width: '100%',
            boxSizing: 'border-box',
        }}>
            {!IS_TOUCH && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', padding: '0 10px' }}>
                    {MARQUEE_BULBS.map((_, i) => (
                        <div key={i} className="marquee-bulb" style={{ animationDelay: `${i * 0.18}s` }} />
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
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: IS_TOUCH ? '0.6rem' : '1rem',
                minHeight: IS_TOUCH ? 80 : 160,
                justifyContent: 'center',
            }}>
                {/* Shimmer skeleton — previews the marquee layout */}
                <div className="shimmer" style={{ width: '40%', height: IS_TOUCH ? 8 : 12, borderRadius: 2, background: 'rgba(139,105,20,0.12)' }} />
                <div className="shimmer" style={{ width: '70%', height: IS_TOUCH ? 22 : 36, borderRadius: 2, background: 'rgba(139,105,20,0.08)', animationDelay: '0.1s' }} />
                <div className="shimmer" style={{ width: '55%', height: IS_TOUCH ? 10 : 14, borderRadius: 2, background: 'rgba(139,105,20,0.06)', animationDelay: '0.2s' }} />
                <div style={{ display: 'flex', gap: IS_TOUCH ? 4 : 6, marginTop: IS_TOUCH ? '0.3rem' : '0.5rem' }}>
                    {Array.from({ length: IS_TOUCH ? 3 : 5 }).map((_, i) => (
                        <div key={i} className="shimmer" style={{ width: IS_TOUCH ? 40 : 60, height: IS_TOUCH ? 56 : 84, borderRadius: 2, background: 'rgba(139,105,20,0.06)', animationDelay: `${0.3 + i * 0.08}s` }} />
                    ))}
                </div>
            </div>
        </div>
    );

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
            {!(IS_TOUCH || isMobile) && (
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
                border: '2px solid var(--sepia)',
                borderRadius: 'var(--radius-card)',
                padding: IS_TOUCH ? '1.75rem 1.25rem 1.5rem' : '3rem 2rem',
                boxShadow: IS_TOUCH
                    ? '0 8px 24px rgba(0,0,0,0.85), inset 0 0 30px rgba(139,105,20,0.08), 0 0 0 1px rgba(242,232,160,0.06)'
                    : '0 20px 50px rgba(0,0,0,0.9), inset 0 0 40px rgba(139,105,20,0.15), 0 0 0 1px rgba(242,232,160,0.1)',
                position: 'relative',
                overflow: 'hidden',
                background: 'rgba(10,7,3,0.70)',
            }}>
                {/* Mobile: poster as blurred cinematic background */}
                {(IS_TOUCH || isMobile) && film.poster_path && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(https://image.tmdb.org/t/p/w780${film.poster_path})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center 20%',
                        filter: 'blur(18px) sepia(0.4) brightness(0.28) contrast(1.1)',
                        transform: 'scale(1.08)',
                        zIndex: 0,
                    }} />
                )}
                {/* Vignette — keeps text readable */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(10,7,3,0.30) 0%, rgba(10,7,3,0.55) 60%, rgba(10,7,3,0.80) 100%)',
                    zIndex: 0,
                    pointerEvents: 'none',
                }} />
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.55rem' : '0.75rem', letterSpacing: '0.3em', color: 'var(--flicker)', textAlign: 'center', marginBottom: IS_TOUCH ? '1rem' : '1.5rem', textShadow: '0 0 10px rgba(242,232,160,0.3)', position: 'relative', zIndex: 1 }}>
                    ✦ MAIN FEATURE ✦
                </div>
                <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                    <h1
                        className="glow-text"
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
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: IS_TOUCH ? '0.75rem' : '1.5rem', marginTop: IS_TOUCH ? '1.25rem' : '2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-sub)', fontSize: IS_TOUCH ? '0.8rem' : '0.95rem', color: 'var(--bone)', background: 'rgba(58,50,40,0.5)', padding: '0.2em 0.8em', borderRadius: '4px', border: '1px solid rgba(139,105,20,0.3)' }}>
                            {film.release_date?.slice(0, 4)}
                        </span>
                        <ReelRating value={Math.round((film.vote_average || 0) / 2)} size="md" />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: IS_TOUCH ? '0.55rem' : '0.75rem', color: 'var(--sepia)', letterSpacing: '0.15em', borderBottom: '1px dotted var(--sepia)', paddingBottom: '0.2em', opacity: IS_TOUCH ? 0.7 : 1 }}>
                            {reviewText}
                        </span>
                    </div>
                </div>
                {/* Film strip decoration — desktop only */}
                {!(IS_TOUCH || isMobile) && (
                    <div style={{
                        display: 'flex',
                        gap: 4,
                        marginTop: '2.5rem',
                        overflow: 'hidden',
                        opacity: 0.28,
                        justifyContent: 'center',
                        position: 'relative',
                        zIndex: 1
                    }}>
                        {Array.from({ length: 14 }).map((_, i) => (
                            <div key={i} style={{ width: 32, height: 24, flexShrink: 0, border: '2px solid var(--sepia)', borderRadius: 2 }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Bulb row bottom — desktop only */}
            {!(IS_TOUCH || isMobile) && (
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
)

export default MarqueeBoard
