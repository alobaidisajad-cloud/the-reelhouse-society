import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { tmdb } from '../../tmdb'

export function WatchlistRoulette({ watchlist }) {
    const [picking, setPicking] = useState(false)
    const [result, setResult] = useState(null)
    const [reason, setReason] = useState('')

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
        const r = reasons[Math.floor(Math.random() * reasons.length)]

        setTimeout(() => {
            setResult(target)
            setReason(r)
            setPicking(false)
        }, 1500)
    }

    if (watchlist.length < 2) return null

    return (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: '0 auto 2rem', maxWidth: 600, borderTop: '2px solid var(--sepia)' }}>
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
                <div style={{ padding: '2rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, border: '2px solid var(--sepia)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginTop: '1.5rem', animation: 'pulse 1.5s infinite' }}>
                        SEARCHING THE STACKS...
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fade-in 0.5s ease-out' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE ORACLE HAS SPOKEN
                    </div>
                    <Link to={`/film/${result.id}`} style={{ textDecoration: 'none' }}>
                        <motion.div whileHover={{ scale: 1.05 }} style={{ display: 'inline-block' }}>
                            <img src={tmdb.poster(result.poster_path, 'w185')} alt={result.title} style={{ width: 140, borderRadius: 4, filter: 'sepia(0.3) contrast(1.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }} />
                        </motion.div>
                    </Link>
                    <Link to={`/film/${result.id}`} style={{ textDecoration: 'none' }}>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', marginTop: '1rem' }}>{result.title}</h3>
                    </Link>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                        "{reason}"
                    </p>
                    <button className="btn btn-ghost" style={{ marginTop: '1.5rem', fontSize: '0.65rem' }} onClick={spin}>
                        Spin Again
                    </button>
                </div>
            )}
        </div>
    )
}
