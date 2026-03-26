import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Poster from '../film/Poster'

export function WatchlistRoulette({ watchlist }: { watchlist: any[] }) {
    const [picking, setPicking] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [reason, setReason] = useState('')
    const [flickerTarget, setFlickerTarget] = useState<any>(null)

    const spin = () => {
        if (watchlist.length < 2) return
        setPicking(true)
        setResult(null)

        const target = watchlist[Math.floor(Math.random() * watchlist.length)]
        const reasons = [
            "The Oracle demands this.",
            "It's time to face the unknown.",
            "A cinematic blind spot repaired.",
            "Destined for tonight's atmosphere.",
            "Because you've waited long enough.",
            "The archive has chosen."
        ]

        let ticks = 0
        const interval = setInterval(() => {
            ticks++
            setFlickerTarget(watchlist[Math.floor(Math.random() * watchlist.length)])
            
            // Analog projector click
            if (navigator.vibrate && ticks % 2 === 0) navigator.vibrate(10)

            if (ticks > 30) {
                clearInterval(interval)
                setResult(target)
                setReason(reasons[Math.floor(Math.random() * reasons.length)])
                setPicking(false)
                // Heavy analog clunk on lock-in
                if (navigator.vibrate) navigator.vibrate([40, 30, 40])
            }
        }, 50) // 20fps projector simulation
    }

    if (watchlist.length < 2) return null

    return (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: '0 auto 2rem', maxWidth: 600, borderTop: '2px solid var(--sepia)', overflow: 'hidden', position: 'relative' }}>
            {picking && (
                <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 3px)', zIndex: 0, pointerEvents: 'none' }} />
            )}
            
            <div style={{ position: 'relative', zIndex: 1 }}>
                {!picking && !result ? (
                <>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                        The Oracle's Choice
                    </h3>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--fog)', fontStyle: 'italic', marginBottom: '1.5rem' }}>
                        Can't decide? Let the Archive choose your next obsession.
                    </p>
                    <button className="btn btn-primary" onClick={spin} style={{ padding: '0.8rem 2rem' }}>
                        ✦ Consult the Oracle
                    </button>
                </>
            ) : picking ? (
                <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.5rem', opacity: 0.5 }}>
                        SCANNING THE ARCHIVES...
                    </div>
                    {flickerTarget && (
                        <div style={{ width: 140, overflow: 'hidden', borderRadius: 4, filter: 'blur(2px) sepia(0.8) contrast(1.5)', opacity: 0.6, transform: `translateY(${Math.random() * 10 - 5}px)` }}>
                            <Poster path={flickerTarget.poster_path} title={flickerTarget.title} sizeHint="md" />
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fade-in 0.5s ease-out' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE ORACLE HAS SPOKEN
                    </div>
                    <Link to={`/film/${result.id}`} style={{ textDecoration: 'none' }}>
                        <motion.div whileHover={{ scale: 1.05 }} style={{ display: 'inline-block' }}>
                            <div style={{ width: 140, overflow: 'hidden', borderRadius: 4, filter: 'sepia(0.3) contrast(1.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}>
                                <Poster path={result.poster_path} title={result.title} sizeHint="md" />
                            </div>
                        </motion.div>
                    </Link>
                    <Link to={`/film/${result.id}`} style={{ textDecoration: 'none' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', marginTop: '1rem' }}>{result.title}</h3>
                    </Link>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                        "{reason}"
                    </p>
                    <button className="btn btn-ghost" style={{ marginTop: '1.5rem', fontSize: '0.65rem' }} onClick={spin}>
                        <span style={{ fontSize: '0.8rem', marginRight: '0.4rem' }}>↻</span> RE-ROLL INCANTATION
                    </button>
                </div>
            )}
            </div>
        </div>
    )
}
