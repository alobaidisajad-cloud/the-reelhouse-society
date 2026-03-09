import { Link } from 'react-router-dom'
import { Film } from 'lucide-react'

/**
 * Site footer — Nitrate Noir aesthetic.
 * Minimal, premium, always at the bottom.
 */
export default function Footer() {
    return (
        <footer style={{
            background: 'var(--soot)',
            borderTop: '1px solid var(--ash)',
            padding: '3rem 2rem 2rem',
            marginTop: 'auto',
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '2rem',
            }}>
                {/* Brand */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <Film size={14} color="var(--sepia)" />
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                            ReelHouse
                        </span>
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', lineHeight: 1.6, maxWidth: '220px' }}>
                        Where cinema lives between life and death. A society for the devoted.
                    </p>
                </div>

                {/* Navigate */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                        NAVIGATE
                    </div>
                    {[
                        { to: '/', label: 'The Lobby' },
                        { to: '/discover', label: 'Dark Room' },
                        { to: '/feed', label: 'The Reel' },
                        { to: '/lists', label: 'The Stacks' },
                        { to: '/patronage', label: 'The Society' },
                    ].map(({ to, label }) => (
                        <Link key={to} to={to} style={{
                            display: 'block',
                            fontFamily: 'var(--font-sub)',
                            fontSize: '0.75rem',
                            color: 'var(--bone)',
                            textDecoration: 'none',
                            padding: '0.2rem 0',
                            transition: 'color 0.2s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--bone)'}
                        >
                            {label}
                        </Link>
                    ))}
                </div>

                {/* Society */}
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                        THE SOCIETY
                    </div>
                    {[
                        { to: '/dispatch', label: 'The Dispatch' },
                        { to: '/patronage', label: 'Membership' },
                    ].map(({ to, label }) => (
                        <Link key={to} to={to} style={{
                            display: 'block',
                            fontFamily: 'var(--font-sub)',
                            fontSize: '0.75rem',
                            color: 'var(--bone)',
                            textDecoration: 'none',
                            padding: '0.2rem 0',
                            transition: 'color 0.2s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--bone)'}
                        >
                            {label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* Bottom bar */}
            <div style={{
                maxWidth: '1200px',
                margin: '2rem auto 0',
                paddingTop: '1.5rem',
                borderTop: '1px solid var(--ash)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
            }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                    © {new Date().getFullYear()} THE REELHOUSE SOCIETY · ALL RIGHTS RESERVED
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--ash)' }}>
                    FILM DATA BY TMDB
                </span>
            </div>
        </footer>
    )
}
