import { useState, useRef, useEffect, memo } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Film, BookOpen, Lock, Check, RotateCcw, X } from 'lucide-react'
import { useAuthStore } from '../../store'
import { ReelRating, RadarChart } from '../UI'
import { tmdb } from '../../tmdb'
import { sanitizeDescription, sanitizeListTitle } from '../../utils/sanitize'
import '../../styles/stacks.css'

import { useViewport } from '../../hooks/useViewport'

// ── PROFILE BACKDROP — Dynamic Favorite Films (Auteur-only) ──
export const ProfileBackdrop = memo(function ProfileBackdrop({ logs, user }: any) {
    const { isTouch } = useViewport()
    const favorites = (user?.preferences?.favorites || []).filter((f: any) => f && f.poster_path)
    
    // Use favorites if available, otherwise fall back to log posters
    const allImages = favorites.length > 0
        ? favorites.slice(0, 3).map((f: any) => `https://image.tmdb.org/t/p/w780${f.poster_path}`)
        : logs?.filter((l: any) => l.poster).slice(0, 3).map((l: any) => tmdb.poster(l.poster, 'w342')) || []

    if (allImages.length === 0) return null

    // On mobile: show only the FIRST poster as a full-bleed hero
    // On desktop: show all posters in a dynamic grid
    const backdropImages = isTouch ? [allImages[0]] : allImages
    const count = backdropImages.length

    return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
            {/* Poster panels */}
            <div style={{
                position: 'absolute', inset: 0,
                display: 'grid',
                gridTemplateColumns: count === 1 ? '1fr' : count === 2 ? '1fr 1fr' : '1fr 1fr 1fr',
                gap: 0,
            }}>
                {backdropImages.map((src: string, i: number) => (
                    <div key={i} style={{ position: 'relative', overflow: 'hidden' }}>
                        <img
                            src={src || undefined}
                            alt=""
                            decoding="async"
                            loading="lazy"
                            style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                                objectPosition: isTouch ? 'center 20%' : 'center center',
                                filter: isTouch
                                    ? 'saturate(0.5) brightness(0.4) contrast(1.2)'
                                    : 'saturate(0.6) brightness(0.35) contrast(1.15)',
                                transform: 'scale(1.08)',
                                animation: 'profileBackdropBreathe 12s ease-in-out infinite',
                                animationDelay: `${i * 2}s`,
                            }}
                        />
                        {/* Panel separator — subtle vertical gold line between posters (desktop only) */}
                        {!isTouch && i < count - 1 && (
                            <div style={{
                                position: 'absolute', top: '15%', right: 0, bottom: '15%',
                                width: '1px',
                                background: 'linear-gradient(180deg, transparent, rgba(139,105,20,0.3), transparent)',
                                zIndex: 2,
                            }} />
                        )}
                    </div>
                ))}
            </div>

            {/* Cinematic vignette overlay — tighter on mobile for focus on center */}
            <div style={{
                position: 'absolute', inset: 0,
                background: isTouch
                    ? `
                        radial-gradient(ellipse at 50% 35%, transparent 10%, rgba(10,7,3,0.35) 45%, rgba(10,7,3,0.8) 100%),
                        linear-gradient(180deg, rgba(10,7,3,0.1) 0%, rgba(10,7,3,0.4) 40%, var(--ink) 100%)
                    `
                    : `
                        radial-gradient(ellipse at 50% 30%, transparent 20%, rgba(10,7,3,0.4) 60%, rgba(10,7,3,0.85) 100%),
                        linear-gradient(180deg, rgba(10,7,3,0.15) 0%, rgba(10,7,3,0.5) 50%, var(--ink) 100%)
                    `,
            }} />

            {/* Top edge fade for seamless navbar blend */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: isTouch ? '40px' : '60px',
                background: 'linear-gradient(180deg, rgba(10,7,3,0.9) 0%, transparent 100%)',
            }} />

            {/* Side fades on mobile for vignette framing */}
            {isTouch && (
                <>
                    <div style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0, width: '25%',
                        background: 'linear-gradient(90deg, rgba(10,7,3,0.7) 0%, transparent 100%)',
                    }} />
                    <div style={{
                        position: 'absolute', top: 0, right: 0, bottom: 0, width: '25%',
                        background: 'linear-gradient(270deg, rgba(10,7,3,0.7) 0%, transparent 100%)',
                    }} />
                </>
            )}

            {/* Warm gold atmospheric glow centered */}
            <div style={{
                position: 'absolute',
                top: isTouch ? '5%' : '10%',
                left: '50%', transform: 'translateX(-50%)',
                width: isTouch ? '90%' : '70%',
                height: isTouch ? '70%' : '60%',
                background: isTouch
                    ? 'radial-gradient(ellipse, rgba(139,105,20,0.1) 0%, transparent 65%)'
                    : 'radial-gradient(ellipse, rgba(139,105,20,0.08) 0%, transparent 70%)',
                animation: 'profileBackdropBreathe 8s ease-in-out infinite',
            }} />
        </div>
    )
})

// ── FILM LOG ROW ──
export const FilmLogRow = memo(function FilmLogRow({ log, onShare }: any) {
    const isAbandoned = log.status === 'abandoned'
    const navigate = useNavigate()
    return (
        <div 
            onClick={() => navigate(`/log/${log.id}`)}
            className={`card ${isAbandoned ? 'log-abandoned' : ''}`} 
            style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer' }}
        >
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
                            {log.status === 'watched' ? <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> WATCHED</> : log.status === 'rewatched' ? <><RotateCcw size={10} style={{ display: "inline-block", verticalAlign: "middle" }} /> REWATCHED</> : `{<X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} />} ABANDONED${log.abandonedReason ? ` — ${log.abandonedReason}` : ''}`}
                        </span>
                        {log.watchedWith && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>♡ with {log.watchedWith}</span>}
                        {log.physicalMedia && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', border: '1px solid var(--sepia)', background: 'rgba(139,105,20,0.1)', padding: '0.1rem 0.3rem', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><BookOpen size={8} /> {log.physicalMedia}</span>}
                    </div>
                    {onShare && <button onClick={(e) => { e.stopPropagation(); onShare(log); }} className="btn btn-ghost" style={{ fontSize: '0.5rem', padding: '0.1rem 0.4rem' }}>SHARE</button>}
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

// ── SINGLETON OBSERVER ENGINE ──
const _observerCallbacks = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>()
let _sharedObserver: IntersectionObserver | null = null

function getSharedObserver() {
    if (typeof window === 'undefined') return null
    if (!_sharedObserver) {
        _sharedObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const cb = _observerCallbacks.get(entry.target)
                if (cb) cb(entry)
            })
        }, { rootMargin: '600px 0px' })
    }
    return _sharedObserver
}

// ── LAZY LOG ROW (Intersection Observer virtualization with Perfect Height Cache) ──
export function LazyLogRow({ log, onShare }: any) {
    const ref = useRef<HTMLDivElement>(null)
    const [visible, setVisible] = useState(false)
    const [cachedHeight, setCachedHeight] = useState<number>(88)

    useEffect(() => {
        const el = ref.current
        const observer = getSharedObserver()
        if (!el || !observer) return
        
        _observerCallbacks.set(el, (entry) => { 
            if (entry.isIntersecting) { 
                setVisible(true)
            } else {
                // If it leaves viewport, capture exact height before unmounting
                if (el.offsetHeight > 50) setCachedHeight(el.offsetHeight)
                setVisible(false)
            }
        })
        observer.observe(el)

        return () => {
            _observerCallbacks.delete(el)
            observer.unobserve(el)
        }
    }, [])

    useEffect(() => {
        const el = ref.current
        if (!el || !visible) return
        
        // When visible, let the ResizeObserver track the true height dynamically
        // in case images load or the autopsy chart adjusts
        const ro = new ResizeObserver((entries) => {
            for (let entry of entries) {
                if (entry.target === el && el.offsetHeight > 50) {
                    setCachedHeight(el.offsetHeight)
                }
            }
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [visible])

    return (
        <div ref={ref} style={{ height: visible ? 'auto' : cachedHeight, overflow: 'hidden' }}>
            {visible ? <FilmLogRow log={log} onShare={onShare} /> : <div style={{ height: cachedHeight }} />}
        </div>
    )
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

// ── LISTS SECTION — Premium Stack Cards (matching community page) ──
export function ListsSection({ lists, user }: any) {
    const { isAuthenticated } = useAuthStore()

    const gradients = [
        'linear-gradient(135deg, #1a0e05 0%, #3a2010 40%, #0a0703 100%)',
        'linear-gradient(135deg, #0a0a0a 0%, #1c1710 50%, #2a1a05 100%)',
        'linear-gradient(135deg, #05080a 0%, #101820 50%, #1a2010 100%)',
        'linear-gradient(135deg, #0a0508 0%, #1a0f18 50%, #0a0508 100%)',
    ]

    return (
        <>
            <style>{`
                .profile-stacks-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                }
                @media (min-width: 768px) {
                    .profile-stacks-grid {
                        grid-template-columns: repeat(3, 1fr);
                        gap: 1.25rem;
                    }
                }
            `}</style>
            {lists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>No lists yet. The stacks are empty.</div>
            ) : (
                <div className="profile-stacks-grid">
                    {lists.map((list: any, index: number) => {
                        const posters = list.films.filter((f: any) => f.poster || f.poster_path).slice(0, 3).map((f: any) => f.poster || f.poster_path)
                        const cardGradient = gradients[Math.abs((list.id || '').toString().charCodeAt(0) || index) % gradients.length]

                        return (
                            <Link key={list.id} to={`/lists/${list.id}`} className="stack-card" style={{ textDecoration: 'none', minHeight: 220 }}>
                                {/* Poster Background (Triptych) */}
                                <div className="stack-card-poster-wrap">
                                    {posters.length === 0 ? (
                                        <div style={{ width: '100%', height: '100%', background: cardGradient }} />
                                    ) : (
                                        posters.map((p: string, i: number) => (
                                            <div key={i} className="stack-card-poster-panel">
                                                <img
                                                    src={tmdb.poster(p, 'w342') || undefined}
                                                    alt=""
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                                {i < posters.length - 1 && (
                                                    <div className="stack-card-poster-fade" />
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Overlays */}
                                <div className="stack-card-glow" />
                                <div className="stack-card-gradient" />

                                {/* Content Pane */}
                                <div className="stack-card-content">
                                    {/* Meta Row — Film count badge */}
                                    <div className="stack-card-meta-row">
                                        <span className="stack-card-badge">
                                            {list.films.length} FILMS
                                        </span>
                                        <div className="stack-card-meta-divider" />
                                    </div>

                                    {/* Title */}
                                    <h3 className="stack-card-title">
                                        {sanitizeListTitle(list.title).toUpperCase()}
                                    </h3>

                                    {/* Description */}
                                    {sanitizeDescription(list.description) && (
                                        <p className="stack-card-desc">{sanitizeDescription(list.description)}</p>
                                    )}

                                    {/* Privacy indicator */}
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.5, marginTop: '0.25rem' }}>
                                        {list.isPrivate ? '⊠ PRIVATE' : '◎ PUBLIC'}
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </>
    )
}
