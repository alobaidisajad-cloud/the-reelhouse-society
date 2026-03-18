import { useState, useRef, useEffect, memo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Film, BookOpen, Lock } from 'lucide-react'
import { useAuthStore } from '../../store'
import { ReelRating, RadarChart } from '../UI'
import { tmdb } from '../../tmdb'

// ── PROFILE BACKDROP ──
export const ProfileBackdrop = memo(function ProfileBackdrop({ logs }: any) {
    const posters = logs.filter((l: any) => l.poster).slice(0, 12).map((l: any) => tmdb.poster(l.poster, 'w185'))
    if (posters.length < 4) return null
    return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 2, overflow: 'hidden' }}>
                {posters.map((src: any, i: number) => (
                    <img key={i} src={src || undefined} alt="" decoding="async" loading="lazy"
                        style={{ flex: '1 0 auto', height: '100%', objectFit: 'cover', filter: 'sepia(0.8) brightness(0.15) contrast(1.2)', transform: `rotate(${(i % 3 - 1) * 0.5}deg) scale(1.04)` }} />
                ))}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,7,3,0.5) 0%, rgba(10,7,3,0.85) 60%, var(--ink) 100%)' }} />
        </div>
    )
})

// ── FILM LOG ROW ──
export const FilmLogRow = memo(function FilmLogRow({ log, onShare }: any) {
    const isAbandoned = log.status === 'abandoned'
    return (
        <div className={`card ${isAbandoned ? 'log-abandoned' : ''}`} style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div style={{ width: 44, height: 66, flexShrink: 0, borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--ash)' }}>
                {(log.altPoster || log.poster) ? (
                    <img src={tmdb.poster(log.altPoster || log.poster, 'w92') || undefined} alt={log.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3)' }} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)' }}><Film size={16} /></div>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                        <Link to={`/film/${log.filmId}`} style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)', textDecoration: 'none' }}>{log.title}</Link>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.15rem' }}>
                            {log.year} · {new Date(log.watchedDate || log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                    </div>
                    <div style={{ flexShrink: 0 }}><ReelRating value={log.rating} size="sm" /></div>
                </div>
                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`tag ${log.status === 'rewatched' ? 'tag-vibe' : ''}`} style={{ fontSize: '0.5rem' }}>
                            {log.status === 'watched' ? '✓ WATCHED' : log.status === 'rewatched' ? '↩ REWATCHED' : `✕ ABANDONED${log.abandonedReason ? ` — ${log.abandonedReason}` : ''}`}
                        </span>
                        {log.watchedWith && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>♡ with {log.watchedWith}</span>}
                        {log.physicalMedia && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', background: 'rgba(139,105,20,0.1)', padding: '0.1rem 0.3rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><BookOpen size={8} /> {log.physicalMedia}</span>}
                    </div>
                    {onShare && <button onClick={() => onShare(log)} className="btn btn-ghost" style={{ fontSize: '0.5rem', padding: '0.1rem 0.4rem' }}>SHARE</button>}
                </div>
                {log.pullQuote && <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: '3px solid var(--sepia)', fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--sepia)', fontStyle: 'italic', lineHeight: 1.2 }}>"{log.pullQuote}"</div>}
                {log.review && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.4rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{log.review}</p>}
                {log.isAutopsied && log.autopsy && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><RadarChart {...{ autopsy: log.autopsy, size: 140 } as any} /></div>}
                {log.privateNotes && (
                    <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(212, 185, 117, 0.05)', borderRadius: '2px', borderLeft: '2px solid var(--sepia)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginBottom: '0.2rem' }}><Lock size={10} /> THE CUTTING ROOM FLOOR (PRIVATE)</div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', margin: 0, fontStyle: 'italic' }}>{log.privateNotes}</p>
                    </div>
                )}
            </div>
        </div>
    )
})

// ── LAZY LOG ROW (Intersection Observer virtualization) ──
export function LazyLogRow({ log, onShare }: any) {
    const ref = useRef(null)
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    return <div ref={ref} style={{ minHeight: visible ? 'auto' : 88 }}>{visible && <FilmLogRow log={log} onShare={onShare} />}</div>
}

// ── VAULT SECTION ──
export const VaultSection = memo(function VaultSection({ vault }: any) {
    return (
        <div className="vault-box" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--parchment)', marginTop: '0.5rem' }}>THE VAULT</div>
                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--fog)', marginTop: '0.25rem' }}>{vault.length} TITLES WITHIN</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--fog)', marginTop: '0.5rem', fontStyle: 'italic' }}>Private. Mysterious. Yours alone.</div>
            </div>
        </div>
    )
})

// ── LISTS SECTION ──
export function ListsSection({ lists, user }: any) {
    const [posterMode, setPosterMode] = useState<any>(null)
    const { isAuthenticated } = useAuthStore()
    if (!isAuthenticated) return <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--ash)', borderRadius: 'var(--radius-card)' }}><p style={{ fontFamily: 'var(--font-sub)', color: 'var(--fog)', fontSize: '0.85rem' }}>Sign in to create and manage your lists</p></div>
    if (posterMode) {
        return (
            <div className="poster-export-view" style={{ position: 'fixed', inset: 0, zIndex: 100005, background: 'var(--ink)', padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
                <button onClick={() => setPosterMode(null)} className="btn btn-ghost" style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 100006 }}>✕ CLOSE POSTER</button>
                <div className="card" style={{ width: '100%', maxWidth: '800px', padding: '4rem', border: '4px double var(--sepia)', background: 'var(--soot)', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.5em', color: 'var(--sepia)', marginBottom: '1rem' }}>REELHOUSE ARCHIVE NO. {posterMode.id.toString().slice(0, 6)}</div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', color: 'var(--parchment)', marginBottom: '1rem' }}>{posterMode.title.toUpperCase()}</h1>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>CURATED BY @{user.username}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
                        {posterMode.films.map((film: any) => (
                            <div key={film.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <img src={tmdb.poster(film.poster_path, 'w185') || undefined} alt={film.title} loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', border: '1px solid var(--ash)' }} />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{film.title.toUpperCase()}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--ash)', paddingTop: '2rem' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--sepia)', opacity: 0.5 }}>REELHOUSE</div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>GENERATED {new Date().toLocaleDateString()}<br />{posterMode.films.length} TITLES IN SEQUENCE</div>
                    </div>
                </div>
            </div>
        )
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {lists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>No lists yet. The stacks are empty.</div>
            ) : lists.map((list: any) => (
                <motion.div key={list.id} className="card" style={{ padding: 0, overflow: 'hidden' }} whileHover={{ y: -2, transition: { type: 'spring', damping: 14 } }}>
                    <div style={{ display: 'flex', gap: 2, height: 64, overflow: 'hidden' }}>
                        {list.films.length > 0 ? list.films.slice(0, 4).map((f: any, i: number) => (
                            <div key={i} style={{ flex: 1, overflow: 'hidden' }}>
                                {f.poster ? <img src={tmdb.poster(f.poster, 'w92') || undefined} alt="" decoding="async" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.4) brightness(0.7)' }} /> : <div style={{ width: '100%', height: '100%', background: 'var(--ash)' }} />}
                            </div>
                        )) : <div style={{ flex: 1, background: 'linear-gradient(135deg, var(--soot), var(--ash))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.2em' }}>EMPTY REEL</span></div>}
                    </div>
                    <div style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{list.title}</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.2rem' }}>{list.films.length} FILMS · {list.isPrivate ? '⊠ PRIVATE' : '◎ PUBLIC'}</div>
                            </div>
                            <button onClick={() => setPosterMode(list)} className="btn btn-ghost" style={{ fontSize: '0.5rem', padding: '0.3rem 0.6rem' }}>POSTER</button>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}
