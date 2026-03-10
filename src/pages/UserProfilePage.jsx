import { useState, useRef, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Film, BookOpen, Star, Lock, Edit2, Camera, User, Settings, Globe } from 'lucide-react'
import { useAuthStore, useFilmStore, useUIStore, useProgrammeStore } from '../store'
import { ReelRating, SectionHeader, StatCard, PersonaStamp, FilmCard, RadarChart } from '../components/UI'
import Buster from '../components/Buster'
import { tmdb } from '../tmdb'
import toast from 'react-hot-toast'

// ── PROFILE BACKDROP — mosaic of logged posters ──
function ProfileBackdrop({ logs }) {
    const posters = logs
        .filter(l => l.poster)
        .slice(0, 12)
        .map(l => tmdb.poster(l.poster, 'w185'))

    if (posters.length < 4) return null

    return (
        <div style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            zIndex: 0, pointerEvents: 'none',
        }}>
            {/* Poster strip */}
            <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', gap: 2, overflow: 'hidden',
            }}>
                {posters.map((src, i) => (
                    <img
                        key={i}
                        src={src}
                        alt=""
                        decoding="async"
                        loading="lazy"
                        style={{
                            flex: '1 0 auto',
                            height: '100%',
                            objectFit: 'cover',
                            filter: 'sepia(0.8) brightness(0.15) contrast(1.2)',
                            transform: `rotate(${(i % 3 - 1) * 0.5}deg) scale(1.04)`,
                        }}
                    />
                ))}
            </div>
            {/* Gradient overlay so text is always readable */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, rgba(10,7,3,0.5) 0%, rgba(10,7,3,0.85) 60%, var(--ink) 100%)',
            }} />
        </div>
    )
}
function LazyLogRow({ log, onShare }) {
    const ref = useRef(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
            { rootMargin: '200px' }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    return (
        <div ref={ref} style={{ minHeight: visible ? 'auto' : 88 }}>
            {visible && <FilmLogRow log={log} onShare={onShare} />}
        </div>
    )
}

// ── INSTAGRAM SHARE CARD OVERLAY ──
function ShareCardOverlay({ log, onClose, user }) {
    if (!log) return null
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100005, background: 'rgba(10, 7, 3, 0.95)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '2rem'
        }}>
            <button
                onClick={onClose}
                className="btn btn-ghost"
                style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 100006 }}
            >
                ✕ CLOSE
            </button>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '1.5rem', textAlign: 'center' }}>
                SCREENSHOT TO SHARE TO INSTAGRAM STORY
            </div>

            {/* 16:9 Aspect Ratio Card */}
            <div id="share-card" style={{
                width: '100%', maxWidth: '360px', aspectRatio: '9/16',
                background: 'var(--ink)',
                position: 'relative', overflow: 'hidden',
                border: '1px solid var(--sepia)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Blurred backdrop */}
                {(log.altPoster || log.poster) && (
                    <div style={{
                        position: 'absolute', inset: -40,
                        backgroundImage: `url(${tmdb.poster(log.altPoster || log.poster, 'w342')})`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        filter: 'blur(30px) sepia(0.6) brightness(0.25)',
                        zIndex: 0
                    }} />
                )}

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 1, padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: 'auto' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--sepia)' }}>
                            <Buster size={24} mood="smiling" />
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--parchment)' }}>
                            @{user.username}
                        </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                        {(log.altPoster || log.poster) && (
                            <img
                                src={tmdb.poster(log.altPoster || log.poster, 'w342')}
                                alt={log.title}
                                style={{ width: '70%', aspectRatio: '2/3', objectFit: 'cover', borderRadius: '4px', filter: 'sepia(0.2) contrast(1.1)', marginBottom: '2rem', border: '1px solid var(--ash)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}
                            />
                        )}
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.75rem', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                            {log.title}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <ReelRating value={log.rating} size="md" />
                            {log.watchedWith && (
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)', borderLeft: '1px solid var(--ash)', paddingLeft: '0.75rem' }}>
                                    ♡ W/ {log.watchedWith.toUpperCase()}
                                </span>
                            )}
                        </div>
                        {log.review && (
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', fontStyle: 'italic', lineHeight: 1.6, paddingBottom: '1rem', margin: 0 }}>
                                "{log.review}"
                            </p>
                        )}
                        {log.isAutopsied && log.autopsy && (
                            <div style={{ transform: 'scale(0.8)', margin: '-1rem 0' }}>
                                <RadarChart autopsy={log.autopsy} size={150} />
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--ash)', paddingTop: '1.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--sepia)', opacity: 0.9 }}>
                            REELHOUSE
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── WATCHLIST ROULETTE ──
function WatchlistRoulette({ watchlist }) {
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


// ── TASTE DNA POSTER ──
function TasteDNA({ logs }) {
    if (logs.length === 0) {
        return (
            <div className="taste-dna-poster">
                <h3>TASTE DNA</h3>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)', textAlign: 'center', marginBottom: '1rem' }}>
                    CINEMATIC FINGERPRINT ANALYSIS
                </div>
                <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    Log 5 films to unlock your cinematic identity
                </div>
                <div style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
                <div style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
                <div style={{ position: 'absolute', bottom: 8, left: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
                <div style={{ position: 'absolute', bottom: 8, right: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
            </div>
        )
    }

    // Compute decade breakdown
    const decades = {}
    logs.forEach((log) => {
        const year = parseInt(log.year || '2000')
        const decade = `${Math.floor(year / 10) * 10}s`
        decades[decade] = (decades[decade] || 0) + 1
    })
    const topDecade = Object.entries(decades).sort((a, b) => b[1] - a[1])[0]?.[0] || '2000s'

    // Compute average rating (obscurity proxy)
    const rated = logs.filter(l => l.rating > 0)
    const avgRating = rated.length ? rated.reduce((s, l) => s + l.rating, 0) / rated.length : 0
    const obscurityScore = Math.round(40 + (5 - avgRating) * 12 + Math.min(logs.length, 30))

    // Archetype based on watch patterns
    const archetypes = [
        { min: 0, label: 'Initiate' },
        { min: 5, label: 'Devotee' },
        { min: 15, label: 'Archivist' },
        { min: 30, label: 'Cinephile' },
        { min: 60, label: 'Obsessive' },
        { min: 100, label: 'The Oracle' },
    ]
    const archetype = archetypes.filter(a => logs.length >= a.min).pop()?.label || 'Initiate'

    // Tone based on avg rating
    const tones = avgRating >= 4 ? 'Romanticism' : avgRating >= 3 ? 'Realism' : avgRating >= 2 ? 'Dark Romanticism' : 'Nihilism'

    // Top decades for bar chart
    const topDecades = Object.entries(decades).sort((a, b) => b[1] - a[1]).slice(0, 4)

    // Compute average autopsy for Radar Chart
    const autopsies = logs.filter(l => l.isAutopsied && l.autopsy).map(l => l.autopsy)
    let avgAutopsy = null
    if (autopsies.length > 0) {
        avgAutopsy = {
            story: Math.round(autopsies.reduce((s, a) => s + (a.story || a.screenplay || a.script || 0), 0) / autopsies.length),
            cinematography: Math.round(autopsies.reduce((s, a) => s + (a.cinematography || a.visuals || a.acting || 0), 0) / autopsies.length),
            sound: Math.round(autopsies.reduce((s, a) => s + (a.sound || a.score || a.editing || 0), 0) / autopsies.length),
        }
    }

    return (
        <div className="taste-dna-poster">
            <h3>TASTE DNA</h3>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--fog)', textAlign: 'center', marginBottom: '1rem' }}>
                CINEMATIC FINGERPRINT ANALYSIS
            </div>

            {/* Identity sentence */}
            <div style={{
                fontFamily: 'var(--font-sub)',
                fontSize: '0.75rem',
                color: 'var(--parchment)',
                textAlign: 'center',
                lineHeight: 1.5,
                padding: '0.75rem',
                background: 'rgba(139,105,20,0.08)',
                borderRadius: 'var(--radius-card)',
                border: '1px solid var(--ash)',
                marginBottom: '1rem',
            }}>
                {archetype} of {topDecade} {tones}
            </div>

            {/* Matrix Radar Chart */}
            {avgAutopsy && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', marginTop: '0.5rem', filter: 'drop-shadow(0 0 10px rgba(139,105,20,0.2))' }}>
                    <RadarChart autopsy={avgAutopsy} size={150} />
                </div>
            )}

            {/* Obscurity score */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>OBSCURITY INDEX</span>
                <span style={{ fontFamily: 'var(--font-display-alt)', fontSize: '1rem', color: 'var(--sepia)' }}>{obscurityScore}</span>
            </div>

            {/* Decade bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {topDecades.map(([decade, count]) => {
                    const pct = Math.round((count / logs.length) * 100)
                    return (
                        <div key={decade}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                                <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.7rem', color: 'var(--bone)' }}>{decade}</span>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>{pct}%</span>
                            </div>
                            <div style={{ height: 3, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.8, delay: 0.2 }}
                                    style={{ height: '100%', background: 'linear-gradient(90deg, var(--sepia), var(--flicker))' }}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Corner decorations */}
            <div style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
            <div style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
            <div style={{ position: 'absolute', bottom: 8, left: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
            <div style={{ position: 'absolute', bottom: 8, right: 8, fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--ash)' }}>✦</div>
        </div>
    )
}

// ── FILM LOG ROW ──
function FilmLogRow({ log, onShare, onEdit }) {
    const isAbandoned = log.status === 'abandoned'

    return (
        <div className={`card ${isAbandoned ? 'log-abandoned' : ''}`} style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            {/* Mini poster */}
            <div style={{ width: 44, height: 66, flexShrink: 0, borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--ash)' }}>
                {(log.altPoster || log.poster) ? (
                    <img
                        src={tmdb.poster(log.altPoster || log.poster, 'w92')}
                        alt={log.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3)' }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)' }}>
                        <Film size={16} />
                    </div>
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                        <Link to={`/film/${log.filmId}`} style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)', textDecoration: 'none' }}>
                            {log.title}
                        </Link>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.15rem' }}>
                            {log.year} · {new Date(log.watchedDate || log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                        <ReelRating value={log.rating} size="sm" />
                    </div>
                </div>

                {/* Status badge & Share/Edit */}
                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`tag ${log.status === 'rewatched' ? 'tag-vibe' : ''}`} style={{ fontSize: '0.5rem' }}>
                            {log.status === 'watched' ? '✓ WATCHED' : log.status === 'rewatched' ? '↩ REWATCHED' : `✕ ABANDONED${log.abandonedReason ? ` — ${log.abandonedReason}` : ''}`}
                        </span>
                        {log.watchedWith && (
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>
                                ♡ with {log.watchedWith}
                            </span>
                        )}
                        {log.physicalMedia && (
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', background: 'rgba(139,105,20,0.1)', padding: '0.1rem 0.3rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <BookOpen size={8} /> {log.physicalMedia}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {onEdit && (
                            <button
                                onClick={() => onEdit(log)}
                                className="btn btn-ghost"
                                style={{ fontSize: '0.5rem', padding: '0.1rem 0.4rem' }}
                                title="Edit this log"
                            >
                                <Lock size={8} style={{ display: 'inline', marginRight: '0.15rem' }} /> SPLICER
                            </button>
                        )}
                        {onShare && (
                            <button
                                onClick={() => onShare(log)}
                                className="btn btn-ghost"
                                style={{ fontSize: '0.5rem', padding: '0.1rem 0.4rem' }}
                                title="Share as Instagram Story"
                            >
                                SHARE
                            </button>
                        )}
                    </div>
                </div>

                {/* Editorial Header */}
                {log.editorialHeader && (
                    <div style={{ marginTop: '0.75rem', width: '100%', height: 90, borderRadius: '4px', overflow: 'hidden' }}>
                        <img
                            src={tmdb.backdrop(log.editorialHeader, 'w780')}
                            alt="Scene from film"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3) contrast(1.1)' }}
                        />
                    </div>
                )}

                {/* Pull Quote */}
                {log.pullQuote && (
                    <div style={{
                        marginTop: '0.75rem', marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: '3px solid var(--sepia)',
                        fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--sepia)', fontStyle: 'italic',
                        lineHeight: 1.2
                    }}>
                        "{log.pullQuote}"
                    </div>
                )}

                {/* Review preview */}
                {log.review && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.4rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {log.isSpoiler ? <span className="spoiler" onClick={(e) => e.currentTarget.classList.toggle('revealed')}>{log.review}</span> : (
                            log.dropCap ? (
                                <>
                                    <span style={{
                                        float: 'left', fontSize: '2.4rem', lineHeight: '2rem',
                                        padding: '0.2rem 0.4rem 0 0', fontFamily: 'var(--font-display)',
                                        color: 'var(--sepia)'
                                    }}>
                                        {log.review.charAt(0)}
                                    </span>
                                    {log.review.slice(1)}
                                </>
                            ) : log.review
                        )}
                    </p>
                )}

                {/* Autopsy Map */}
                {log.isAutopsied && log.autopsy && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <RadarChart autopsy={log.autopsy} size={140} />
                    </div>
                )}

                {/* Private Notes (The Cutting Room Floor) */}
                {log.privateNotes && (
                    <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(212, 185, 117, 0.05)', borderRadius: '2px', borderLeft: '2px solid var(--sepia)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.2rem' }}>
                            <Lock size={10} />
                            THE CUTTING ROOM FLOOR (PRIVATE)
                        </div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', margin: 0, fontStyle: 'italic' }}>
                            {log.privateNotes}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── VAULT COMPONENT ──
function VaultSection({ vault, user, logs }) {
    const isPremium = user?.role === 'archivist' || user?.role === 'auteur'

    const handleExportCSV = () => {
        if (!isPremium) return

        const headers = ['Title', 'Year', 'Rating', 'Review', 'Watched Date', 'Status', 'Story', 'Script / Dialogue', 'Acting & Character', 'Cinematography', 'Editing & Pacing', 'Sound & Score', 'Private Notes']
        const csvContent = [
            headers.join(','),
            ...logs.map(l => [
                `"${(l.title || '').replace(/"/g, '""')}"`,
                l.year || '',
                l.rating || '',
                `"${(l.review || '').replace(/"/g, '""')}"`,
                l.watchedDate || '',
                l.status || '',
                l.autopsy?.story !== undefined ? l.autopsy.story : l.autopsy?.screenplay || '',
                l.autopsy?.script !== undefined ? l.autopsy.script : l.autopsy?.screenplay || '',
                l.autopsy?.acting || l.autopsy?.direction || '',
                l.autopsy?.cinematography || '',
                l.autopsy?.editing !== undefined ? l.autopsy.editing : l.autopsy?.pacing || '',
                l.autopsy?.sound || '',
                `"${(l.privateNotes || '').replace(/"/g, '""')}"`,
            ].join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `reelhouse_archive_${user.username}_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div className="vault-box" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', marginTop: '0.5rem' }}>
                    THE VAULT
                </div>
                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--fog)', marginTop: '0.25rem' }}>
                    {vault.length} TITLES WITHIN
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    Private. Mysterious. Yours alone.
                </div>
            </div>

            {isPremium && (
                <button
                    onClick={handleExportCSV}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.6rem', padding: '0.5rem', width: '100%', justifyContent: 'center', borderColor: 'var(--ash)', color: 'var(--fog)' }}
                >
                    <BookOpen size={10} style={{ marginRight: '0.4rem' }} />
                    ARCHIVAL EXPORT (.CSV)
                </button>
            )}
        </div>
    )
}

// ── LISTS SECTION ──
function ListsSection({ lists, user }) {
    const [posterMode, setPosterMode] = useState(null)
    const { isAuthenticated } = useAuthStore()

    if (!isAuthenticated) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--ash)', borderRadius: 'var(--radius-card)' }}>
                <p style={{ fontFamily: 'var(--font-sub)', color: 'var(--fog)', fontSize: '0.85rem' }}>
                    Sign in to create and manage your lists
                </p>
            </div>
        )
    }

    if (posterMode) {
        return (
            <div className="poster-export-view" style={{
                position: 'fixed', inset: 0, zIndex: 100005, background: 'var(--ink)',
                padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center',
                overflowY: 'auto'
            }}>
                <button
                    onClick={() => setPosterMode(null)}
                    className="btn btn-ghost"
                    style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 100006 }}
                >
                    ✕ CLOSE POSTER
                </button>

                <div className="card" style={{
                    width: '100%', maxWidth: '800px', padding: '4rem',
                    border: '4px double var(--sepia)', background: 'var(--soot)',
                    display: 'flex', flexDirection: 'column', gap: '3rem'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.5em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                            REELHOUSE ARCHIVE NO. {posterMode.id.toString().slice(0, 6)}
                        </div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', color: 'var(--parchment)', marginBottom: '1rem' }}>
                            {posterMode.title.toUpperCase()}
                        </h1>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>
                            CURATED BY @{user.username}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
                        {posterMode.films.map(film => (
                            <div key={film.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <img
                                    src={tmdb.poster(film.poster_path, 'w185')}
                                    style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', border: '1px solid var(--ash)' }}
                                />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {film.title.toUpperCase()}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--ash)', paddingTop: '2rem' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--sepia)', opacity: 0.5 }}>
                            REELHOUSE
                        </div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                            GENERATED {new Date().toLocaleDateString()}<br />
                            {posterMode.films.length} TITLES IN SEQUENCE
                        </div>
                    </div>
                </div>
            </div >
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {lists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                    No lists yet. The stacks are empty.
                </div>
            ) : (
                lists.map((list) => (
                    <motion.div
                        key={list.id}
                        className="card"
                        style={{ padding: 0, overflow: 'hidden' }}
                        whileHover={{ y: -2, transition: { type: 'spring', damping: 14 } }}
                    >
                        {/* Poster collage header */}
                        <div style={{ display: 'flex', gap: 2, height: 64, overflow: 'hidden' }}>
                            {list.films.length > 0 ? (
                                list.films.slice(0, 4).map((f, i) => (
                                    <div key={i} style={{ flex: 1, overflow: 'hidden' }}>
                                        {f.poster ? (
                                            <img
                                                src={tmdb.poster(f.poster, 'w92')}
                                                alt=""
                                                decoding="async"
                                                loading="lazy"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.4) brightness(0.7)' }}
                                            />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', background: 'var(--ash)' }} />
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div style={{ flex: 1, background: 'linear-gradient(135deg, var(--soot), var(--ash))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>EMPTY REEL</span>
                                </div>
                            )}
                        </div>

                        {/* Card body */}
                        <div style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{list.title}</div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.2rem' }}>
                                        {list.films.length} FILMS · {list.isPrivate ? '⊠ PRIVATE' : '◎ PUBLIC'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <button
                                        onClick={() => setPosterMode(list)}
                                        className="btn btn-ghost"
                                        style={{ fontSize: '0.5rem', padding: '0.3rem 0.6rem' }}
                                    >
                                        POSTER
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))
            )}
        </div>
    )
}

// ── PROJECTOR ROOM (STATS) ──
function ProjectorRoom({ stats, user }) {
    const isMaster = stats.count > 50
    const { logs } = useFilmStore()
    const isPremium = user?.role === 'archivist' || user?.role === 'auteur'

    const downloadCsv = () => {
        if (!isPremium) {
            useUIStore.getState().openSignupModal('archivist')
            return toast("CSV Export is restricted to Archivists.", { icon: '🔒', style: { background: 'var(--soot)', color: 'var(--sepia)', border: '1px solid var(--sepia)' } })
        }
        if (logs.length === 0) return toast('No logs to export.')

        const headers = ['Title', 'Year', 'Rating', 'Status', 'Watched Date', 'Review', 'Private Notes', 'Watched With']
        const csvRows = [headers.join(',')]

        for (const log of logs) {
            const values = [
                `"${log.title || ''}"`,
                log.year || '',
                log.rating || '',
                log.status || '',
                log.watchedDate || '',
                `"${(log.review || '').replace(/"/g, '""')}"`,
                `"${(log.privateNotes || '').replace(/"/g, '""')}"`,
                `"${log.watchedWith || ''}"`
            ]
            csvRows.push(values.join(','))
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.setAttribute('href', url)
        a.setAttribute('download', `reelhouse-archive-${new Date().toISOString().split('T')[0]}.csv`)
        a.click()
        window.URL.revokeObjectURL(url)
    }

    // ── Generate Heatmap Data (Last 365 Days) ──
    const generateHeatmap = () => {
        const days = []
        let today = new Date()
        const oneYearAgo = new Date(today)
        oneYearAgo.setDate(today.getDate() - 364) // Include today + 364 past days = 365

        // Create a lookup dictionary of dates format: "YYYY-MM-DD"
        const logDates = logs.reduce((acc, log) => {
            if (log.watchedDate) {
                acc[log.watchedDate] = (acc[log.watchedDate] || 0) + 1
            } else if (log.createdAt) {
                const dateOnly = log.createdAt.split('T')[0]
                acc[dateOnly] = (acc[dateOnly] || 0) + 1
            }
            return acc
        }, {})

        for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0]
            days.push({
                date: dateStr,
                count: logDates[dateStr] || 0
            })
        }
        return days
    }

    const heatmapDays = generateHeatmap()

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* The Projectionist's Calendar (Heatmap) */}
            <div className="card" style={{ padding: '2rem', overflowX: 'auto', position: 'relative' }}>
                {!isPremium && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 20, backdropFilter: 'blur(8px)', background: 'rgba(10,7,3,0.7)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-card)', border: '1px solid var(--ash)'
                    }}>
                        <Lock size={32} color="var(--sepia)" style={{ marginBottom: '1rem' }} />
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--sepia)', marginBottom: '0.5rem' }}>RESTRICTED ACCESS</div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', textAlign: 'center', maxWidth: 300, marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            The Projectionist's Calendar requires Archivist or Auteur clearance.
                        </p>
                        <button className="btn btn-primary" onClick={() => useUIStore.getState().openSignupModal('archivist')} style={{ padding: '0.6rem 1.5rem', fontSize: '0.65rem' }}>
                            ASCEND TO ARCHIVIST
                        </button>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', opacity: isPremium ? 1 : 0.3 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                        THE PROJECTIONIST'S CALENDAR
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                        LAST 365 DAYS
                    </div>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(53, 1fr)',
                    gridTemplateRows: 'repeat(7, 1fr)',
                    gap: '4px',
                    width: 'min-content'
                }}>
                    {/* We need to offset the first column so the day of the week matches up, 
                        but to keep it simple and beautiful, an unstructured flow of 365 days 
                        filling the grid down-then-right looks extremely purely "data-driven". */}
                    {heatmapDays.map((day, i) => {
                        let bg = 'rgba(255, 255, 255, 0.03)'
                        let border = '1px solid rgba(255,255,255,0.02)'
                        if (day.count === 1) {
                            bg = 'rgba(139, 105, 20, 0.3)'
                            border = '1px solid rgba(139, 105, 20, 0.5)'
                        } else if (day.count === 2) {
                            bg = 'rgba(139, 105, 20, 0.6)'
                            border = '1px solid rgba(139, 105, 20, 0.8)'
                        } else if (day.count >= 3) {
                            bg = 'var(--flicker)' // Intense amber for 3+ films
                            border = '1px solid var(--flicker)'
                        }

                        return (
                            <div
                                key={day.date}
                                title={`${day.count} film${day.count !== 1 ? 's' : ''} on ${day.date}`}
                                style={{
                                    width: 12,
                                    height: 12,
                                    background: bg,
                                    border: border,
                                    borderRadius: '2px',
                                    transition: 'all 0.2s ease',
                                    cursor: 'none'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.2)'
                                    e.currentTarget.style.zIndex = 10
                                    e.currentTarget.style.boxShadow = '0 0 10px var(--flicker)'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)'
                                    e.currentTarget.style.zIndex = 1
                                    e.currentTarget.style.boxShadow = 'none'
                                }}
                            />
                        )
                    })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '1rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                    <span>LESS</span>
                    <div style={{ width: 8, height: 8, background: 'rgba(255, 255, 255, 0.03)', borderRadius: 1 }} />
                    <div style={{ width: 8, height: 8, background: 'rgba(139, 105, 20, 0.3)', borderRadius: 1 }} />
                    <div style={{ width: 8, height: 8, background: 'rgba(139, 105, 20, 0.6)', borderRadius: 1 }} />
                    <div style={{ width: 8, height: 8, background: 'var(--flicker)', borderRadius: 1 }} />
                    <span>MORE</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2rem' }}>
                {/* Level Stat */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
                    <div className="projector-stat-dial">
                        <div className="dial-value">{stats.count}</div>
                        <div className="dial-label">LOGS</div>
                    </div>
                    <div style={{ marginTop: '1.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.25em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>
                            CURRENT STATUS
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: stats.color }}>
                            {stats.level}
                        </h2>
                    </div>
                    {/* Progress bar */}
                    <div style={{ width: '100%', marginTop: '1.25rem' }}>
                        <div style={{ height: 4, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.progress}%` }}
                                style={{ height: '100%', background: stats.color }}
                            />
                        </div>
                    </div>
                </div>

                {/* Additional thematic stats */}
                <div className="card" style={{ padding: '2rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        DOSSIER SUMMARY
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[
                            { label: 'TIME IN THE DARK', value: (stats.count * 122) + 'm' },
                            { label: 'HOURS IN DARK', value: Math.floor(stats.count * 1.8) + 'h' },
                            { label: 'SILENT ERA PRESERVATIONS', value: isMaster ? '🏆 MASTER' : '4' },
                            { label: 'THEATRICAL VISITS', value: stats.count },
                        ].map(s => (
                            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--ash)', paddingBottom: '0.4rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)' }}>{s.label}</span>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--parchment)' }}>{s.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Achievement Badge */}
            {stats.count > 0 && (
                <div className="card" style={{
                    padding: '3rem',
                    textAlign: 'center',
                    background: 'var(--soot)',
                    border: '1px double var(--sepia)',
                    position: 'relative'
                }}>
                    <div style={{
                        position: 'absolute', top: 10, left: 10, opacity: 0.2,
                        fontFamily: 'var(--font-display)', fontSize: '4rem'
                    }}>✦</div>
                    <div style={{
                        position: 'absolute', bottom: 10, right: 10, opacity: 0.2,
                        fontFamily: 'var(--font-display)', fontSize: '4rem'
                    }}>✦</div>

                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--sepia)', letterSpacing: '0.3em', marginBottom: '1rem' }}>
                        REELHOUSE PRESERVATION SOCIETY
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '1rem' }}>
                        Certificate of Obsession
                    </h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
                        This document certifies that the bearer has witnessed {stats.count} films and contributed to the archival history of The ReelHouse Society.
                    </p>
                    <div style={{
                        fontFamily: 'var(--font-sub)',
                        fontSize: '1.2rem',
                        color: stats.color,
                        padding: '0.5rem 2rem',
                        border: `1px solid ${stats.color}`,
                        display: 'inline-block',
                        transform: 'rotate(-5deg)'
                    }}>
                        {stats.level}
                    </div>
                </div>
            )}

            {/* The Archive Unspool */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
                <button
                    onClick={downloadCsv}
                    className="btn btn-ghost"
                    style={{
                        padding: '1rem 2rem',
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.65rem',
                        letterSpacing: '0.25em',
                        color: 'var(--fog)',
                        border: '1px solid var(--ash)',
                        background: 'rgba(10, 7, 3, 0.5)',
                        transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.color = 'var(--sepia)'
                        e.currentTarget.style.borderColor = 'var(--sepia)'
                        e.currentTarget.style.background = 'rgba(139, 105, 20, 0.05)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--fog)'
                        e.currentTarget.style.borderColor = 'var(--ash)'
                        e.currentTarget.style.background = 'rgba(10, 7, 3, 0.5)'
                    }}
                >
                    DOWNLOAD ARCHIVAL RECORD (.CSV)
                </button>
            </div>

            {!isPremium && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => useUIStore.getState().openSignupModal('archivist')}>
                        <Lock size={10} /> ARCHIVIST EXCLUSIVE
                    </div>
                </div>
            )}
        </div>
    )
}

// ── TICKET BOOTH (STUBS) ──
function TicketBooth({ stubs }) {
    if (stubs.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
                <Buster size={100} mood="crying" message="No stubs collected yet. Watch something in a Palace." />
            </div>
        )
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {stubs.map(stub => (
                <motion.div
                    key={stub.id}
                    className="admission-stub"
                    whileHover={{ scale: 1.02, transition: { type: 'spring', damping: 12 } }}
                >
                    <div className="stub-left">
                        <div className="stub-code">NO. {stub.id.split('-')[1].slice(-6)}</div>
                    </div>
                    <div className="stub-right">
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>
                            ADMISSION STUB
                        </div>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)', lineHeight: 1.2, marginBottom: '0.5rem' }}>
                            {stub.title.toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)' }}>DATE</div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--bone)' }}>{stub.date}</div>
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)' }}>SEAT</div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--bone)' }}>{stub.seat}</div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}

// ── NIGHTLY PROGRAMMES (DOUBLE FEATURES) ──
function ProgrammesSection({ programmes, user, isOwnProfile }) {
    const { logs, vault, watchlist } = useFilmStore()
    const { addProgramme, removeProgramme } = useProgrammeStore()
    const [isCreating, setIsCreating] = useState(false)
    const [title, setTitle] = useState('')
    const [playbill, setPlaybill] = useState('')
    const [film1Id, setFilm1Id] = useState('')
    const [film2Id, setFilm2Id] = useState('')

    // Unique films from user's history
    const allFilms = [...logs, ...vault, ...watchlist]
    const uniqueFilmsMap = new Map()
    allFilms.forEach(f => {
        const id = f.filmId || f.id
        if (!uniqueFilmsMap.has(id)) uniqueFilmsMap.set(id, f)
    })
    const uniqueFilms = Array.from(uniqueFilmsMap.values())

    const handleCreate = () => {
        if (!title || !playbill || !film1Id || !film2Id) return
        const f1 = uniqueFilms.find(f => (f.filmId || f.id)?.toString() === film1Id.toString())
        const f2 = uniqueFilms.find(f => (f.filmId || f.id)?.toString() === film2Id.toString())

        addProgramme({
            username: user.username,
            title,
            playbill,
            film1: { id: f1.filmId || f1.id, title: f1.title || f1.name, poster_path: f1.poster || f1.poster_path },
            film2: { id: f2.filmId || f2.id, title: f2.title || f2.name, poster_path: f2.poster || f2.poster_path },
        })
        setIsCreating(false)
        setTitle(''); setPlaybill(''); setFilm1Id(''); setFilm2Id('')
    }

    // Auteur Check
    const isAuteur = logs.length >= 20 || user?.role === 'auteur' || user?.role === 'archivist'

    return (
        <div>
            {isOwnProfile && isAuteur && !isCreating && (
                <button className="btn btn-ghost" onClick={() => setIsCreating(true)} style={{ marginBottom: '2rem', padding: '1.5rem', width: '100%', border: '1px dashed var(--sepia)', color: 'var(--sepia)' }}>
                    + CURATE NIGHTLY PROGRAMME (DOUBLE FEATURE)
                </button>
            )}

            {!isOwnProfile && programmes.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                    This Auteur has not curated any programmes yet.
                </div>
            )}

            {isOwnProfile && !isAuteur && programmes.length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--sepia)' }}>
                    <Lock size={32} style={{ color: 'var(--sepia)', marginBottom: '1rem', opacity: 0.5 }} />
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--sepia)', marginBottom: '0.5rem' }}>Auteur Status Required</h3>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto' }}>
                        The Nightly Programme curation is unlocked at 20 film logs or for Archivist tier members. Keep watching to unlock the power to publish double features.
                    </p>
                </div>
            )}

            {isCreating && (
                <div className="card" style={{ marginBottom: '2rem', background: 'var(--ink)', border: '1px solid var(--sepia)' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--sepia)', letterSpacing: '0.2em', marginBottom: '1.5rem', textAlign: 'center' }}>
                        NEW DOUBLE FEATURE
                    </div>
                    <input className="input" placeholder="Programme Name (e.g., 'Neon Blood & Rain')" value={title} onChange={e => setTitle(e.target.value)} style={{ marginBottom: '1rem', width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', color: 'var(--bone)' }} />
                    <textarea className="input" placeholder="The Playbill (Why these two films? What is the thematic tissue?)" value={playbill} onChange={e => setPlaybill(e.target.value)} style={{ minHeight: '120px', marginBottom: '1rem', width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', color: 'var(--bone)', resize: 'vertical' }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>FEATURE 1 (THE PRIMER)</div>
                            <select className="input" value={film1Id} onChange={e => setFilm1Id(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', color: 'var(--bone)' }}>
                                <option value="" disabled>Select from Archive...</option>
                                {uniqueFilms.map(f => (
                                    <option key={f.filmId || f.id} value={f.filmId || f.id}>{f.title || f.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>FEATURE 2 (THE DESCENT)</div>
                            <select className="input" value={film2Id} onChange={e => setFilm2Id(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', color: 'var(--bone)' }}>
                                <option value="" disabled>Select from Archive...</option>
                                {uniqueFilms.map(f => (
                                    <option key={f.filmId || f.id} value={f.filmId || f.id}>{f.title || f.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={() => setIsCreating(false)}>CANCEL</button>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={!title || !playbill || !film1Id || !film2Id}>PUBLISH PROGRAMME</button>
                    </div>
                </div>
            )}

            {programmes.length > 0 && !isCreating && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {programmes.map(prog => (
                        <div key={prog.id} className="card" style={{ display: 'flex', gap: '2.5rem', padding: '2.5rem', background: 'linear-gradient(135deg, var(--soot) 0%, var(--ink) 100%)', position: 'relative' }}>
                            {isOwnProfile && (
                                <button className="btn btn-ghost" onClick={() => removeProgramme(prog.id)} style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.3rem 0.6rem', fontSize: '0.5rem' }}>✕ REMOVE</button>
                            )}
                            <div style={{ display: 'flex', width: '220px', flexShrink: 0 }}>
                                <img src={tmdb.poster(prog.film1.poster_path, 'w342')} alt="" style={{ width: '120px', height: '180px', objectFit: 'cover', borderRadius: '4px', boxShadow: '0 8px 16px rgba(0,0,0,0.6)', zIndex: 2, border: '1px solid rgba(255,255,255,0.1)' }} />
                                <img src={tmdb.poster(prog.film2.poster_path, 'w342')} alt="" style={{ width: '120px', height: '180px', objectFit: 'cover', borderRadius: '4px', boxShadow: '0 8px 16px rgba(0,0,0,0.6)', marginLeft: '-20px', marginTop: '30px', zIndex: 1, filter: 'brightness(0.6)', border: '1px solid rgba(255,255,255,0.1)' }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>THE NIGHTLY PROGRAMME</div>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>{prog.title}</h3>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: 'var(--bone)' }}>{prog.film1.title}</span>
                                    <span>+</span>
                                    <span style={{ color: 'var(--bone)' }}>{prog.film2.title}</span>
                                </div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--fog)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {prog.playbill}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── MAIN PROFILE PAGE ──
export default function UserProfilePage() {
    const { username: routeUsername } = useParams()
    const { user: currentUser, isAuthenticated, updateUser, community, followUser, unfollowUser } = useAuthStore()
    const { logs: currentLogs, watchlist: currentWatchlist, lists: currentLists, stubs: currentStubs, getCinephileStats } = useFilmStore()
    const { programmes: currentProgrammes } = useProgrammeStore()
    const { openSignupModal, openLogModal } = useUIStore()

    // File input ref
    const fileRef = useRef(null)

    // Determine if this is the logged-in user's profile
    const isOwnProfile = !routeUsername || routeUsername === currentUser?.username || routeUsername === 'me'

    // Find profile data
    const profileUser = isOwnProfile ? currentUser : community.find(u => u.username === routeUsername)

    // Tab state
    const [activeTab, setActiveTab] = useState('diary')
    const [shareLog, setShareLog] = useState(null)
    const [sieve, setSieve] = useState('all')

    // Profile Edit State
    const [isEditing, setIsEditing] = useState(false)
    const [editBio, setEditBio] = useState(profileUser?.bio || '')
    const [editUsername, setEditUsername] = useState(profileUser?.username || '')
    const [editAvatar, setEditAvatar] = useState(profileUser?.avatar || 'smiling')
    const [editIsSocialPrivate, setEditIsSocialPrivate] = useState(profileUser?.isSocialPrivate || false)

    const [socialModal, setSocialModal] = useState(null) // { title: 'Followers', list: [] }

    useEffect(() => {
        if (profileUser) {
            setEditAvatar(profileUser.avatar || 'smiling')
            setEditIsSocialPrivate(profileUser.isSocialPrivate || false)
        }
    }, [profileUser])

    const handleSaveProfile = () => {
        updateUser({
            bio: editBio,
            username: editUsername,
            avatar: editAvatar,
            isSocialPrivate: editIsSocialPrivate
        })
        setIsEditing(false)
        toast.success("Identity updated.")
    }

    const handleFileChange = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        // Ensure it's an image
        if (!file.type.startsWith('image/')) {
            return toast.error("Only archival image formats supported.")
        }

        // Limit file size to 2MB
        if (file.size > 2 * 1024 * 1024) {
            return toast.error("Frame too large. Max 2MB.")
        }

        try {
            const userId = currentUser?.id
            if (!userId) return toast.error("Must be signed in.")

            const ext = file.name.split('.').pop()
            const filePath = `${userId}/avatar.${ext}`

            // Upload to Supabase Storage
            const { supabase } = await import('../supabaseClient')
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true })

            if (uploadError) {
                console.error('Avatar upload error:', uploadError)
                return toast.error("Upload failed. Try again.")
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath)

            setEditAvatar(publicUrl)
            toast.success("Frame captured.")
        } catch (err) {
            console.error('Avatar upload error:', err)
            toast.error("Upload failed.")
        }
    }

    const MOODS = ['smiling', 'neutral', 'dead', 'peeking', 'surprised', 'crying']

    const isFollowing = currentUser?.following?.includes(profileUser?.username)

    // Helper to render current avatar
    const renderAvatar = (avatarValue, size = 90) => {
        if (!avatarValue) return <Buster size={size} mood="smiling" />
        if (avatarValue.startsWith('data:image/') || avatarValue.startsWith('http')) {
            return <img src={avatarValue} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        }
        return <Buster size={size} mood={avatarValue} />
    }

    if (!profileUser) {
        return (
            <div style={{ paddingTop: 120, textAlign: 'center', padding: '6rem 1.5rem' }}>
                <Buster size={120} mood="crying" message="This profile doesn't exist yet, or it's been removed." />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginTop: '1.5rem' }}>Member Not Found</h2>
                <Link to="/" className="btn btn-ghost" style={{ marginTop: '2rem' }}>Return to Lobby</Link>
            </div>
        )
    }

    if (!isAuthenticated && isOwnProfile) {
        return (
            <div style={{ paddingTop: 120, textAlign: 'center', padding: '6rem 1.5rem' }}>
                <Buster size={120} mood="peeking" message="Who goes there? Sign in to see your profile." />
                <div style={{ marginTop: '2rem' }}>
                    <button className="btn btn-primary" onClick={() => openSignupModal()}>
                        Enter The House
                    </button>
                </div>
            </div>
        )
    }

    // Use current user stats or simulated community stats
    const stats = isOwnProfile ? getCinephileStats() : {
        count: 42,
        level: 'THE REGULAR',
        color: 'var(--flicker)',
        progress: 65
    }

    // Use current user logs or empty for community (can expand later)
    const profileLogs = isOwnProfile ? currentLogs : []
    const profileStubs = isOwnProfile ? currentStubs : []
    const profileLists = isOwnProfile ? currentLists : []
    const profileWatchlist = isOwnProfile ? currentWatchlist : []
    const profileProgrammes = currentProgrammes.filter(p => p.username === profileUser?.username)

    const filteredLogs = profileLogs.filter(log => {
        if (sieve === 'all') return true
        if (sieve === 'masterpieces') return log.rating === 5
        if (sieve === 'rewatched') return log.status === 'rewatched'
        if (sieve === 'abandoned') return log.status === 'abandoned'
        if (sieve === 'companion') return !!log.watchedWith
        return true
    })

    const TABS = [
        { id: 'diary', label: 'The Ledger', count: filteredLogs.length },
        { id: 'tickets', label: 'Ticket Booth', count: profileStubs.length },
        { id: 'programmes', label: 'Programmes', count: profileProgrammes.length },
        { id: 'projector', label: 'Projector Room', count: null },
        { id: 'lists', label: 'Lists', count: profileLists.length },
        { id: 'watchlist', label: 'Watchlist', count: profileWatchlist.length },
    ]

    return (
        <div className={`page-top ${stats.count > 50 ? 'level-obsessed' : stats.count > 10 ? 'level-degrade' : ''}`} style={{ minHeight: '100vh' }}>
            {/* Profile header */}
            <div style={{
                borderBottom: '1px solid var(--ash)',
                background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)',
                padding: '3rem 0 2rem',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Personalized poster backdrop - Poster Glow only for Auteurs */}
                {profileUser?.role === 'auteur' ? (
                    <ProfileBackdrop logs={profileLogs} />
                ) : (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, rgba(20,15,10,0.4) 0%, var(--ink) 100%)', pointerEvents: 'none' }} />
                )}

                <div className="container" style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', gap: '3rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        {/* Avatar & Persona */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{
                                width: 140, height: 140, borderRadius: '50%',
                                background: 'var(--ink)', border: `2px solid ${stats.color}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                position: 'relative',
                                boxShadow: `0 0 40px ${stats.color}20`,
                                overflow: 'hidden'
                            }}>
                                {renderAvatar(isEditing ? editAvatar : (profileUser?.avatar || 'smiling'), 90)}
                                {isEditing && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '0.5rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                                            {MOODS.map(m => (
                                                <div
                                                    key={m}
                                                    onClick={() => setEditAvatar(m)}
                                                    style={{
                                                        cursor: 'pointer', padding: '2px', border: `2px solid ${editAvatar === m ? 'var(--sepia)' : 'transparent'}`,
                                                        borderRadius: '50%', background: editAvatar === m ? 'rgba(139,105,20,0.2)' : 'none',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <Buster size={20} mood={m} />
                                                </div>
                                            ))}
                                        </div>

                                        <input
                                            type="file"
                                            ref={fileRef}
                                            onChange={handleFileChange}
                                            accept="image/*"
                                            capture="user"
                                            style={{ display: 'none' }}
                                        />

                                        <button
                                            className="btn btn-ghost"
                                            style={{ fontSize: '0.45rem', padding: '0.3rem 0.6rem', border: '1px solid var(--sepia)', width: 'auto' }}
                                            onClick={() => fileRef.current?.click()}
                                        >
                                            <Camera size={10} style={{ marginRight: '0.2rem' }} /> UPLOAD PHOTO
                                        </button>
                                        <span style={{ fontSize: '0.35rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', textAlign: 'center' }}>CHOOSE A PERSONA OR UPLOAD A NEW FRAME</span>
                                    </div>
                                )}
                            </div>
                            <div style={{
                                position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
                                background: 'var(--ink)', border: `1px solid ${stats.color}`, padding: '0.2rem 0.6rem',
                                borderRadius: '2px', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: stats.color,
                                whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 2
                            }}>
                                ✦ {stats.level}
                            </div>
                        </div>

                        {/* Identity Dossier */}
                        <div style={{ flex: 1, minWidth: 300 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                {isEditing ? (
                                    <input
                                        value={editUsername}
                                        onChange={(e) => setEditUsername(e.target.value)}
                                        style={{
                                            background: 'var(--ink)', border: '1px solid var(--sepia)',
                                            color: 'var(--parchment)', fontFamily: 'var(--font-display)',
                                            fontSize: '1.8rem', padding: '0.2rem 0.5rem', width: 'auto'
                                        }}
                                    />
                                ) : (
                                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--parchment)', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        @{profileUser.username.toUpperCase()}
                                        {profileUser?.role === 'auteur' && (
                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--ink)', background: 'var(--blood-reel)', padding: '0.2rem 0.5rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem', verticalAlign: 'middle', height: 'fit-content' }}>
                                                <Star size={10} fill="currentColor" /> AUTEUR
                                            </span>
                                        )}
                                    </h1>
                                )}

                                {isOwnProfile ? (
                                    <button
                                        onClick={() => isEditing ? handleSaveProfile() : setIsEditing(true)}
                                        className="btn btn-ghost"
                                        style={{ fontSize: '0.65rem', padding: '0.3rem 0.6rem', height: 'fit-content' }}
                                    >
                                        {isEditing ? 'SAVE DOSSIER' : 'EDIT PROFILE'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => isFollowing ? unfollowUser(profileUser.username) : followUser(profileUser.username)}
                                        className={`btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}`}
                                        style={{ fontSize: '0.65rem', padding: '0.3rem 1.2rem', height: 'fit-content' }}
                                    >
                                        {isFollowing ? 'UNFOLLOW' : 'FOLLOW'}
                                    </button>
                                )}
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                {isEditing ? (
                                    <textarea
                                        value={editBio}
                                        onChange={(e) => setEditBio(e.target.value)}
                                        placeholder="Add your cinematic manifesto..."
                                        style={{
                                            background: 'var(--ink)', border: '1px solid var(--ash)',
                                            color: 'var(--bone)', fontFamily: 'var(--font-body)',
                                            fontSize: '0.9rem', width: '100%', height: '80px',
                                            padding: '0.75rem', borderRadius: '4px', resize: 'none'
                                        }}
                                    />
                                ) : (
                                    <p style={{
                                        fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)',
                                        fontStyle: 'italic', maxWidth: 600, lineHeight: 1.5,
                                        opacity: profileUser.bio ? 1 : 0.5
                                    }}>
                                        {profileUser.bio || (isOwnProfile ? "No bio yet. Tell the society who you are." : "No bio on file.")}
                                    </p>
                                )}
                            </div>

                            {isEditing && (
                                <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-ui)',
                                        fontSize: '0.6rem',
                                        letterSpacing: '0.1em',
                                        color: editIsSocialPrivate ? 'var(--sepia)' : 'var(--fog)',
                                        padding: '0.4rem 0.8rem',
                                        border: `1px solid ${editIsSocialPrivate ? 'var(--sepia)' : 'var(--ash)'}`,
                                        borderRadius: '2px',
                                        transition: 'all 0.2s'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={editIsSocialPrivate}
                                            onChange={(e) => setEditIsSocialPrivate(e.target.checked)}
                                            style={{ accentColor: 'var(--sepia)' }}
                                        />
                                        {editIsSocialPrivate ? 'PRIVATE SOCIAL ARCHIVE' : 'PUBLIC SOCIAL ARCHIVE'}
                                        {editIsSocialPrivate ? <Lock size={10} /> : <Globe size={10} />}
                                    </label>
                                    <span style={{ fontSize: '0.5rem', color: 'var(--ash)', fontStyle: 'italic' }}>
                                        When private, only you can see your followers/following lists.
                                    </span>
                                </div>
                            )}

                            {/* Core Stats Bar */}
                            <div style={{ display: 'flex', gap: '2.5rem', borderTop: '1px solid rgba(139,105,20,0.1)', paddingTop: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--sepia)' }}>{isOwnProfile ? currentLogs.length : 42}</div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>ACTIVITY</div>
                                </div>
                                <div
                                    onClick={() => !isEditing && (isOwnProfile || !profileUser.isSocialPrivate) && setSocialModal({ title: 'Followers', list: profileUser.followers || [] })}
                                    style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: (isOwnProfile || !profileUser.isSocialPrivate) ? 'pointer' : 'default', opacity: (!isOwnProfile && profileUser.isSocialPrivate) ? 0.4 : 1 }}
                                >
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {profileUser.followers?.length || 0}
                                        {!isOwnProfile && profileUser.isSocialPrivate && <Lock size={12} />}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>FOLLOWERS</div>
                                </div>
                                <div
                                    onClick={() => !isEditing && (isOwnProfile || !profileUser.isSocialPrivate) && setSocialModal({ title: 'Following', list: profileUser.following || [] })}
                                    style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: (isOwnProfile || !profileUser.isSocialPrivate) ? 'pointer' : 'default', opacity: (!isOwnProfile && profileUser.isSocialPrivate) ? 0.4 : 1 }}
                                >
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {profileUser.following?.length || 0}
                                        {!isOwnProfile && profileUser.isSocialPrivate && <Lock size={12} />}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>FOLLOWING</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--sepia)' }}>{profileStubs.length}</div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>STUBS</div>
                                </div>
                            </div>

                            {/* ── Streak & Achievement Badges ── */}
                            {isOwnProfile && (
                                <div style={{ borderTop: '1px solid rgba(139,105,20,0.1)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                    {/* Streak */}
                                    {(() => {
                                        // Calculate streak from log dates
                                        const today = new Date()
                                        today.setHours(0, 0, 0, 0)
                                        const logDates = [...new Set(profileLogs.map(l => {
                                            const d = new Date(l.watchedDate || l.createdAt)
                                            d.setHours(0, 0, 0, 0)
                                            return d.getTime()
                                        }))].sort((a, b) => b - a)

                                        let streak = 0
                                        const DAY_MS = 86400000
                                        for (let i = 0; i < logDates.length; i++) {
                                            const expected = today.getTime() - (i * DAY_MS)
                                            // Allow today or yesterday as start
                                            if (i === 0 && (logDates[0] === expected || logDates[0] === expected - DAY_MS)) {
                                                streak = 1
                                            } else if (logDates[i] === today.getTime() - (streak * DAY_MS)) {
                                                streak++
                                            } else {
                                                break
                                            }
                                        }

                                        // Badges
                                        const badges = []
                                        if (profileLogs.length >= 1) badges.push({ emoji: '🎬', label: 'First Log', desc: 'Logged your first film' })
                                        if (profileLogs.length >= 10) badges.push({ emoji: '📽️', label: 'Cinephile', desc: '10 films logged' })
                                        if (profileLogs.length >= 50) badges.push({ emoji: '🏛️', label: 'Archivist', desc: '50 films logged' })
                                        if (profileLogs.length >= 100) badges.push({ emoji: '🎭', label: 'Centurion', desc: '100 films logged' })
                                        if (streak >= 3) badges.push({ emoji: '🔥', label: 'On Fire', desc: `${streak}-day streak` })
                                        if (streak >= 7) badges.push({ emoji: '⚡', label: 'Week Warrior', desc: '7-day streak' })
                                        if (streak >= 30) badges.push({ emoji: '💎', label: 'Diamond Reel', desc: '30-day streak' })
                                        if (profileLogs.filter(l => l.rating === 5).length >= 5) badges.push({ emoji: '⭐', label: 'Masterpiece Hunter', desc: '5 perfect ratings' })
                                        if (profileLogs.some(l => l.status === 'abandoned')) badges.push({ emoji: '🚪', label: 'Honest Critic', desc: 'Abandoned a film' })
                                        if (profileLogs.some(l => l.physicalMedia)) badges.push({ emoji: '📀', label: 'Collector', desc: 'Logged physical media' })

                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {/* Streak badge */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                        background: streak > 0 ? 'rgba(255,120,20,0.1)' : 'rgba(255,255,255,0.02)',
                                                        border: `1px solid ${streak > 0 ? 'rgba(255,120,20,0.3)' : 'var(--ash)'}`,
                                                        borderRadius: '100px',
                                                        padding: '0.3rem 0.8rem',
                                                    }}>
                                                        <span style={{ fontSize: '1rem' }}>{streak > 0 ? '🔥' : '💤'}</span>
                                                        <span style={{
                                                            fontFamily: 'var(--font-ui)', fontSize: '0.6rem',
                                                            letterSpacing: '0.1em',
                                                            color: streak > 0 ? '#ff8c20' : 'var(--fog)',
                                                        }}>
                                                            {streak > 0 ? `${streak}-DAY STREAK` : 'NO STREAK'}
                                                        </span>
                                                    </div>
                                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                                        {streak > 0 ? 'Keep the projector running!' : 'Log a film today to start a streak'}
                                                    </span>
                                                </div>

                                                {/* Badges */}
                                                {badges.length > 0 && (
                                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                        {badges.map((b, i) => (
                                                            <div
                                                                key={i}
                                                                title={`${b.label}: ${b.desc}`}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '0.3em',
                                                                    background: 'rgba(139,105,20,0.08)',
                                                                    border: '1px solid rgba(139,105,20,0.15)',
                                                                    borderRadius: '100px',
                                                                    padding: '0.2em 0.5em',
                                                                    fontSize: '0.7rem',
                                                                    cursor: 'default',
                                                                    transition: 'all 0.2s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.18)'; e.currentTarget.style.transform = 'scale(1.05)' }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.08)'; e.currentTarget.style.transform = 'scale(1)' }}
                                                            >
                                                                <span>{b.emoji}</span>
                                                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--flicker)' }}>{b.label.toUpperCase()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Archive Controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignSelf: 'center' }}>
                            <button
                                className="btn btn-primary"
                                style={{
                                    padding: '1rem 2rem', fontSize: '0.75rem',
                                    boxShadow: `0 0 20px ${stats.color}30`
                                }}
                                onClick={() => openLogModal()}
                            >
                                + RECORD NEW LOG
                            </button>
                            {isOwnProfile && (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="btn btn-ghost" style={{ flex: 1, padding: '0.6rem', fontSize: '0.6rem' }}>
                                        <Settings size={12} style={{ marginRight: '0.4rem' }} /> SETTINGS
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ borderBottom: '1px solid var(--ash)', background: 'var(--ink)', position: 'sticky', top: 64, zIndex: 100 }}>
                <div className="container">
                    <div style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em',
                                    textTransform: 'uppercase', padding: '0.9rem 1rem',
                                    background: 'none', border: 'none', whiteSpace: 'nowrap',
                                    color: activeTab === tab.id ? 'var(--flicker)' : 'var(--fog)',
                                    borderBottom: `2px solid ${activeTab === tab.id ? 'var(--sepia)' : 'transparent'}`,
                                    transition: 'color 0.2s',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                }}
                            >
                                {tab.label}
                                {tab.count !== null && (
                                    <span style={{
                                        background: activeTab === tab.id ? 'var(--sepia)' : 'var(--ash)',
                                        color: activeTab === tab.id ? 'var(--ink)' : 'var(--fog)',
                                        padding: '0.1em 0.4em', borderRadius: '2px', fontSize: '0.45rem',
                                    }}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tab content */}
            <main style={{ padding: '2.5rem 0 5rem' }}>
                <div className="container layout-sidebar reversed">
                    {/* Main */}
                    <div>
                        {activeTab === 'diary' && (
                            <div>
                                <SectionHeader label="CHRONOLOGICAL" title="The Ledger" />

                                {/* The Sieve (Filtering) */}
                                {profileLogs.length > 0 && (
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ash)' }}>
                                        {[
                                            { id: 'all', label: 'All Logs' },
                                            { id: 'masterpieces', label: '★★★★★ Masterpieces' },
                                            { id: 'rewatched', label: '↩ Rewatched' },
                                            { id: 'abandoned', label: '✕ Abandoned' },
                                            { id: 'companion', label: '♡ Companions' },
                                        ].map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => setSieve(s.id)}
                                                className={`btn ${sieve === s.id ? 'btn-primary' : 'btn-ghost'}`}
                                                style={{ fontSize: '0.65rem', padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {filteredLogs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)' }}>
                                        <Buster size={80} mood="peeking" />
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginTop: '1.5rem', marginBottom: '0.5rem' }}>The Archive is Empty</div>
                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto', lineHeight: 1.4 }}>
                                            {profileLogs.length === 0 ? (
                                                <span>{isOwnProfile ? "No films logged yet. Press Ctrl+K or tap + to log your first film and begin the descent." : "This member hasn't logged any films yet."}</span>
                                            ) : "No logs match this filter."}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                        gridAutoRows: 'minmax(210px, auto)',
                                        gap: '1rem'
                                    }}>
                                        {filteredLogs.map((log, index) => {
                                            // Create asymmetrical "marquee" layout for the first few items
                                            let gridColumnSpan = 'span 1'
                                            let gridRowSpan = 'span 1'

                                            if (sieve === 'all' && index === 0) {
                                                // The featured newest film
                                                gridColumnSpan = 'span 2'
                                                gridRowSpan = 'span 2'
                                            } else if (sieve === 'all' && (index === 1 || index === 2)) {
                                                // Secondary featured
                                                gridColumnSpan = 'span 2'
                                                gridRowSpan = 'span 1'
                                            }

                                            return (
                                                <div key={log.id} style={{
                                                    gridColumn: gridColumnSpan,
                                                    gridRow: gridRowSpan,
                                                    position: 'relative',
                                                    height: '100%'
                                                }}>
                                                    <FilmCard
                                                        film={{
                                                            id: log.filmId,
                                                            title: log.title,
                                                            poster_path: log.altPoster || log.poster,
                                                            release_date: log.year + '-01-01',
                                                            userRating: log.rating,
                                                            status: log.status,
                                                        }}
                                                        onClick={() => {
                                                            if (isOwnProfile) {
                                                                if (currentUser?.role === 'archivist' || currentUser?.role === 'auteur') {
                                                                    useUIStore.getState().setLogModalFilm({
                                                                        id: log.filmId,
                                                                        title: log.title,
                                                                        poster_path: log.poster,
                                                                        release_date: log.year + '-01-01'
                                                                    })
                                                                    useUIStore.getState().setLogModalEditLogId(log.id)
                                                                    useUIStore.getState().openLogModal()
                                                                } else {
                                                                    openSignupModal('archivist')
                                                                    toast("The Splicer requires Archivist clearance.", { icon: '🔒', style: { background: 'var(--soot)', color: 'var(--sepia)', border: '1px solid var(--sepia)' } })
                                                                }
                                                            }
                                                        }}
                                                        disableHover={false}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'tickets' && (
                            <div>
                                <SectionHeader label="ADMISSION HISTORY" title="Ticket Booth" />
                                <TicketBooth stubs={profileStubs} />
                            </div>
                        )}

                        {activeTab === 'programmes' && (
                            <div>
                                <SectionHeader label="CURATED DOUBLE FEATURES" title="Nightly Programmes" />
                                <ProgrammesSection programmes={profileProgrammes} user={profileUser} isOwnProfile={isOwnProfile} />
                            </div>
                        )}

                        {activeTab === 'projector' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <SectionHeader label="DEVOTEE ANALYTICS" title="Projector Room" />

                                {/* ── REGISTRY — derived stats panel ── */}
                                {profileLogs.length > 0 && (() => {
                                    // Ratings distribution 1–5
                                    const ratingBuckets = [1, 2, 3, 4, 5].map(r => ({
                                        star: r,
                                        count: profileLogs.filter(l => Math.round(l.rating) === r).length,
                                    }))
                                    const maxRatingCount = Math.max(...ratingBuckets.map(b => b.count), 1)

                                    // Decade breakdown
                                    const decadeBuckets = {}
                                    profileLogs.forEach(l => {
                                        if (!l.year) return
                                        const decade = Math.floor(l.year / 10) * 10
                                        decadeBuckets[decade] = (decadeBuckets[decade] || 0) + 1
                                    })
                                    const decades = Object.entries(decadeBuckets).sort(([a], [b]) => +a - +b)
                                    const maxDecadeCount = Math.max(...Object.values(decadeBuckets), 1)

                                    // Runtime estimate (avg 115 min per film)
                                    const totalMins = profileLogs.length * 115
                                    const totalHours = Math.floor(totalMins / 60)

                                    return (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>

                                            {/* Ratings Distribution */}
                                            <div className="card" style={{ padding: '1.75rem' }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.25rem' }}>RATINGS REGISTER</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                    {ratingBuckets.reverse().map(({ star, count }) => (
                                                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--flicker)', width: 28, flexShrink: 0, textAlign: 'right' }}>
                                                                {'★'.repeat(star)}
                                                            </div>
                                                            <div style={{ flex: 1, height: 6, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}>
                                                                <div style={{
                                                                    height: '100%', borderRadius: 3,
                                                                    width: `${(count / maxRatingCount) * 100}%`,
                                                                    background: 'linear-gradient(90deg, var(--sepia), var(--flicker))',
                                                                    transition: 'width 0.6s ease',
                                                                }} />
                                                            </div>
                                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Decade Breakdown */}
                                            <div className="card" style={{ padding: '1.75rem' }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.25rem' }}>ERA DISTRIBUTION</div>
                                                {decades.length === 0 ? (
                                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', opacity: 0.5 }}>No dated logs yet.</div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                        {decades.map(([decade, count]) => (
                                                            <div key={decade} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 38, flexShrink: 0 }}>{decade}s</div>
                                                                <div style={{ flex: 1, height: 6, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}>
                                                                    <div style={{
                                                                        height: '100%', borderRadius: 3,
                                                                        width: `${(count / maxDecadeCount) * 100}%`,
                                                                        background: 'linear-gradient(90deg, var(--blood-reel), var(--sepia))',
                                                                        transition: 'width 0.6s ease',
                                                                    }} />
                                                                </div>
                                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Runtime + Catalog Summary */}
                                            <div className="card" style={{ padding: '1.75rem' }}>
                                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1.25rem' }}>CATALOG METRICS</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                                                    {[
                                                        { label: 'ESTIMATED RUNTIME', value: `${totalHours.toLocaleString()} hrs` },
                                                        { label: 'TOTAL FILMS LOGGED', value: profileLogs.length },
                                                        { label: 'WATCHLIST QUEUED', value: profileWatchlist.length },
                                                        { label: 'LISTS CURATED', value: profileLists.length },
                                                        { label: 'RATED 5 STARS', value: profileLogs.filter(l => l.rating === 5).length },
                                                        { label: 'WRITTEN REVIEWS', value: profileLogs.filter(l => l.review?.length > 10).length },
                                                    ].map(({ label, value }) => (
                                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                                                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>{label}</span>
                                                            <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--bone)' }}>{value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}

                                <ProjectorRoom stats={stats} user={profileUser} />
                            </div>
                        )}

                        {activeTab === 'lists' && (
                            <div>
                                <SectionHeader label="YOUR COLLECTIONS" title="The Stacks" />
                                <ListsSection lists={profileLists} user={profileUser} />
                            </div>
                        )}

                        {activeTab === 'watchlist' && (
                            <div>
                                <SectionHeader label="FILMS TO SEE" title="Watchlist" />
                                {profileWatchlist.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                                        {isOwnProfile ? "Your watchlist is empty. Start saving films." : "This member hasn't saved any films yet."}
                                    </div>
                                ) : (
                                    <>
                                        <WatchlistRoulette watchlist={profileWatchlist} />
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                                            {profileWatchlist.map((film) => (
                                                <Link key={film.id} to={`/film/${film.id}`}>
                                                    <motion.div whileHover={{ y: -3, transition: { type: 'spring', damping: 12 } }}>
                                                        <FilmCard film={film} />
                                                    </motion.div>
                                                </Link>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <TasteDNA logs={profileLogs} />
                        <VaultSection vault={isOwnProfile ? currentWatchlist : []} user={profileUser} logs={profileLogs} />

                        {/* Recent high-rated */}
                        {profileLogs.filter(l => l.rating >= 4).length > 0 && (
                            <div className="card">
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                                    YOUR FAVOURITES
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {profileLogs.filter(l => l.rating >= 4).slice(0, 4).map((log) => (
                                        <Link key={log.id} to={`/film/${log.filmId}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                                            {log.poster && (
                                                <img
                                                    src={tmdb.poster(log.poster, 'w92')}
                                                    alt={log.title}
                                                    style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: '2px', filter: 'sepia(0.3)', flexShrink: 0 }}
                                                />
                                            )}
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--parchment)', lineHeight: 1.2 }}>{log.title}</div>
                                                <ReelRating value={log.rating} size="sm" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Social Lists Modal */}
            {
                socialModal && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000000,
                        background: 'rgba(10,7,3,0.98)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '1.5rem', backdropFilter: 'blur(10px)'
                    }} onClick={() => setSocialModal(null)}>
                        <div className="card" style={{
                            maxWidth: 440, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                            border: '1px solid var(--sepia)', padding: 0, overflow: 'hidden'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--ash)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)' }}>{socialModal.title.toUpperCase()}</h3>
                                <button className="btn btn-ghost" onClick={() => setSocialModal(null)}>✕</button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                {socialModal.list.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                                        This archive is empty.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {socialModal.list.map(username => {
                                            const member = community.find(u => u.username === username) || (username === currentUser?.username ? currentUser : null)
                                            return (
                                                <Link
                                                    key={username}
                                                    to={`/user/${username}`}
                                                    onClick={() => setSocialModal(null)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                                                        background: 'rgba(255,255,255,0.02)', textDecoration: 'none', borderRadius: '4px'
                                                    }}
                                                >
                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--ash)', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {member?.avatar?.startsWith('data:image/') ? (
                                                            <img src={member.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <Buster size={20} mood={member?.avatar || 'smiling'} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--parchment)', lineHeight: 1 }}>@{username.toUpperCase()}</div>
                                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--sepia)', letterSpacing: '0.1em', marginTop: '0.2rem' }}>
                                                            {member?.followers?.length || 0} FOLLOWERS
                                                        </div>
                                                    </div>
                                                    <div style={{ color: 'var(--fog)' }}>→</div>
                                                </Link>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Share Card Overlay */}
            <ShareCardOverlay log={shareLog} user={profileUser} onClose={() => setShareLog(null)} />
        </div >
    )
}
