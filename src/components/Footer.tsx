import { NavLink } from 'react-router-dom'
import { useViewport } from '../hooks/useViewport'

/**
 * Site footer — Cinematic Closing Credits.
 * Feels like the theater after the last frame fades.
 */
export default function Footer() {
    const { isTouch: IS_TOUCH } = useViewport()

    return (
        <footer style={{
            background: 'var(--soot)',
            padding: IS_TOUCH ? '2.5rem 1.5rem 2rem' : '3.5rem 2rem 2rem',
            marginTop: 'auto',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Cinematic top rule — sepia gradient */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 5%, rgba(139,105,20,0.4) 30%, rgba(139,105,20,0.5) 50%, rgba(139,105,20,0.4) 70%, transparent 95%)' }} />

            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                display: 'grid',
                gridTemplateColumns: IS_TOUCH ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: IS_TOUCH ? '1.5rem' : '2rem',
            }}>
                {/* Brand */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <img src="/reelhouse-logo.svg" alt="ReelHouse" style={{ height: '40px', width: 'auto', opacity: 0.9 }} />
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                            ReelHouse
                        </span>
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', lineHeight: 1.6, maxWidth: '220px' }}>
                        A society for those who live and breathe cinema.
                    </p>
                </div>

                {/* Navigate */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                        NAVIGATE
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        {[
                            { to: '/', label: 'The Lobby', end: true },
                            { to: '/discover', label: 'The Darkroom' },
                            { to: '/feed', label: 'The Reel' },
                            { to: '/stacks', label: 'The Stacks' },
                            { to: '/cinemas', label: 'The Cinemas' },
                            { to: '/society', label: 'The Society' },
                        ].map(({ to, label, end }) => (
                            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
                                display: 'inline-block',
                                fontFamily: 'var(--font-sub)',
                                fontSize: '0.75rem',
                                color: isActive ? 'var(--sepia)' : 'var(--bone)',
                                fontWeight: isActive ? '600' : 'normal',
                                textDecoration: 'none',
                                padding: '0.2rem 0',
                                transition: 'color 0.2s, text-shadow 0.3s',
                                cursor: 'pointer',
                            })}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--parchment)'; e.currentTarget.style.textShadow = '0 0 10px rgba(139,105,20,0.3)' }}
                                onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.textShadow = 'none' }}
                            >
                                {label}
                            </NavLink>
                        ))}
                    </div>
                </div>

                {/* Society */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                        THE SOCIETY
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        {[
                            { to: '/dispatch', label: 'The Dispatch' },
                            { to: '/patronage', label: 'Membership' },
                        ].map(({ to, label }) => (
                            <NavLink key={to} to={to} style={({ isActive }) => ({
                                display: 'inline-block',
                                fontFamily: 'var(--font-sub)',
                                fontSize: '0.75rem',
                                color: isActive ? 'var(--sepia)' : 'var(--bone)',
                                fontWeight: isActive ? '600' : 'normal',
                                textDecoration: 'none',
                                padding: '0.2rem 0',
                                transition: 'color 0.2s, text-shadow 0.3s',
                                cursor: 'pointer',
                            })}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--parchment)'; e.currentTarget.style.textShadow = '0 0 10px rgba(139,105,20,0.3)' }}
                                onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.textShadow = 'none' }}
                            >
                                {label}
                            </NavLink>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Film strip sprocket detail ── */}
            <div style={{
                maxWidth: '1200px', margin: '2rem auto 0',
                display: 'flex', justifyContent: 'center', gap: '8px',
                opacity: 0.12, paddingBottom: '1.5rem',
            }}>
                {Array.from({ length: IS_TOUCH ? 8 : 16 }).map((_, i) => (
                    <div key={i} style={{
                        width: 14, height: 9,
                        border: '1px solid var(--sepia)',
                        borderRadius: '1px',
                        flexShrink: 0,
                    }} />
                ))}
            </div>

            {/* ── Closing tagline ── */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div
                    className="text-flicker-anim"
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: IS_TOUCH ? '0.9rem' : '1.1rem',
                        letterSpacing: '0.25em',
                        color: 'var(--sepia)',
                        opacity: 0.7,
                        textShadow: '0 0 20px rgba(139,105,20,0.2)',
                    }}
                >
                    THE HOUSE NEVER CLOSES
                </div>
                <div style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.45rem',
                    letterSpacing: '0.5em',
                    color: 'var(--fog)',
                    marginTop: '0.5rem',
                    opacity: 0.5,
                }}>
                    ✦ EST. 1924 ✦
                </div>
            </div>

            {/* ── Bottom bar ── */}
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                paddingTop: '1rem',
                borderTop: '1px solid rgba(139,105,20,0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
            }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.6 }}>
                    © {new Date().getFullYear()} THE REELHOUSE SOCIETY
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', opacity: 0.4 }}>
                    FILM DATA BY TMDB
                </span>
            </div>
        </footer>
    )
}
