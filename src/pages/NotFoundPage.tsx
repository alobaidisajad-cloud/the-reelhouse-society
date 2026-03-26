import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import Buster from '../components/Buster'
import PageSEO from '../components/PageSEO'

export default function NotFoundPage() {
    return (
        <div style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '2rem',
            paddingTop: 80,
        }}>
            {/* Film strip decoration */}
            <div style={{
                display: 'flex',
                gap: 4,
                marginBottom: '3rem',
                opacity: 0.2,
            }}>
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} style={{
                        width: 32, height: 24,
                        border: '1px solid var(--sepia)',
                        borderRadius: 2,
                        position: 'relative',
                        background: i === 5 || i === 6 ? 'rgba(92,26,11,0.3)' : 'transparent',
                    }}>
                        {(i === 5 || i === 6) && (
                            <div style={{
                                position: 'absolute', inset: 2,
                                background: 'rgba(92,26,11,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <span style={{ fontSize: '0.4rem', color: 'var(--parchment)' }}>✕</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
            >
                <Buster size={160} mood="crying" />
            </motion.div>

            <div style={{ marginTop: '2rem', maxWidth: 500 }}>
                <div style={{
                    fontFamily: 'var(--font-display-alt)',
                    fontSize: 'clamp(3rem, 10vw, 7rem)',
                    color: 'var(--ash)',
                    lineHeight: 1,
                    textShadow: '0 0 40px rgba(92,26,11,0.3)',
                    letterSpacing: '0.05em',
                }}>
                    404
                </div>

                <h1 style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(1.2rem, 3vw, 2rem)',
                    color: 'var(--parchment)',
                    marginTop: '0.5rem',
                    marginBottom: '1rem',
                }}>
                    The Lost Reel
                </h1>

                <p style={{
                    fontFamily: 'var(--font-sub)',
                    fontSize: '1rem',
                    color: 'var(--bone)',
                    lineHeight: 1.7,
                    maxWidth: 400,
                    margin: '0 auto 0.75rem',
                }}>
                    This reel has been lost to time.
                </p>
                <p style={{
                    fontFamily: 'var(--font-body)',
                    fontStyle: 'italic',
                    fontSize: '0.9rem',
                    color: 'var(--fog)',
                    lineHeight: 1.7,
                    margin: '0 auto 2rem',
                }}>
                    Perhaps it was never meant to be found.
                </p>

                {/* Torn film strip visual */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginBottom: '2rem', opacity: 0.4 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} style={{
                            width: 24,
                            height: 36,
                            border: '1px solid var(--sepia)',
                            borderRadius: 1,
                            transform: i === 2 ? 'rotate(-8deg) translateY(4px)' : i === 3 ? 'rotate(5deg) translateY(6px)' : `rotate(${(i - 2.5) * -1.5}deg)`,
                        }} />
                    ))}
                </div>

                <Link to="/" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.7em 1.8em' }}>
                    ← Return to The Lobby
                </Link>
            </div>
        </div>
    )
}
