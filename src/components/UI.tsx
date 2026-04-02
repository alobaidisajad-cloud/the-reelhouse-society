import { X, Check } from 'lucide-react'
import { useState, memo, useCallback, useRef, useEffect, ReactNode, CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tmdb } from '../tmdb'
import type { TMDBMovie } from '../types'
import Poster from './film/Poster'
import { createPortal } from 'react-dom'

// ── Prop Interfaces ──

interface ReelRatingProps {
    value?: number
    onChange?: ((value: number) => void) | null
    size?: 'sm' | 'md' | 'lg'
}

interface FilmCardProps {
    film: TMDBMovie & { altPoster?: string | null; title?: string }
    onClick?: () => void
    size?: 'sm' | 'md' | 'lg'
    showRating?: boolean
}

interface ObscurityBadgeProps {
    score: number
}

interface GenreTagsProps {
    genreIds?: number[]
    genres?: Array<{ id?: number; name: string }>
}

interface PersonaStampProps {
    persona: string
}

interface SectionHeaderProps {
    label: string
    title: string
    action?: ReactNode
    className?: string
    style?: CSSProperties
}

interface TickerProps {
    items?: string[]
}

interface SkeletonProps {
    count?: number
}

interface StatCardProps {
    label: string
    value: string | number
    icon?: ReactNode
}

interface PersonPlaceholderProps {
    size?: string
}

interface RadarChartProps {
    autopsy: Record<string, number> | null
    size?: number
}

// Film reel rating — 5 segments, half-reels allowed
export const ReelRating = memo(function ReelRating({ value = 0, onChange = null, size = 'md' }: ReelRatingProps) {
    const [hovered, setHovered] = useState<number | null>(null)
    const display = hovered !== null ? hovered : value

    const sizes = { sm: 18, md: 24, lg: 32 }
    const s = sizes[size] || 24

    return (
        <div
            style={{ display: 'flex', gap: 3, alignItems: 'center', userSelect: 'none' }}
            onMouseLeave={() => setHovered(null)}
            role="slider"
            aria-label={`Rating: ${value} out of 5 reels`}
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={value}
            aria-valuetext={`${value} out of 5 reels`}
        >
            {[1, 2, 3, 4, 5].map((reel) => {
                const full = display >= reel
                const half = !full && display >= reel - 0.5
                return (
                    <div
                        key={reel}
                        style={{ position: 'relative', width: s, height: s, cursor: onChange ? 'pointer' : 'default' }}
                        onMouseMove={onChange ? (e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const x = e.clientX - rect.left
                            setHovered(x < rect.width / 2 ? reel - 0.5 : reel)
                        } : undefined}
                        onClick={onChange ? () => {
                            const v = hovered !== null ? hovered : reel
                            // Haptic feedback on touch devices — feels like a mechanical reel click
                            if (navigator.vibrate) navigator.vibrate(10)
                            onChange(v)
                        } : undefined}
                    >
                        <ReelSegmentSVG size={s} filled={full ? 'full' : half ? 'half' : 'empty'} />
                    </div>
                )
            })}
        </div>
    )
})

function ReelSegmentSVG({ size, filled }: { size: number; filled: 'full' | 'half' | 'empty' }) {
    const srcPath = filled === 'full' ? '/rating-full.png' 
                  : filled === 'half' ? '/rating-half.png' 
                  : '/rating-empty.png';

    return (
        <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={srcPath} alt={`Rating: ${filled}`} style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'crisp-edges', WebkitFontSmoothing: 'antialiased', filter: filled === 'full' ? 'drop-shadow(0 0 4px rgba(218,165,32,0.4))' : 'none' }} loading="lazy" decoding="async" />
        </div>
    )
}

// Obscurity badge
export function ObscurityBadge({ score }: ObscurityBadgeProps) {
    const label = score > 80 ? 'GHOST REEL' : score > 60 ? 'OBSCURE' : score > 40 ? 'CULT' : score > 20 ? 'KNOWN' : 'MAINSTREAM'
    const opacity = score > 60 ? 1 : score > 30 ? 0.6 : 0.3

    return (
        <div className="obscurity-meter">
            <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity }}>
                <path
                    d="M8 2 Q12 2 14 6 Q16 10 12 13 L8 15 L4 13 Q0 10 2 6 Q4 2 8 2Z"
                    fill="var(--fog)"
                />
                <circle cx="6" cy="8" r="1.5" fill="var(--ink)" />
                <circle cx="10" cy="8" r="1.5" fill="var(--ink)" />
            </svg>
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--fog)' }}>
                {score}/100 · {label}
            </span>
        </div>
    )
}

// Film poster card
export const FilmCard = memo(function FilmCard({ film, onClick, size = 'md', showRating = false }: FilmCardProps) {
    const posterUrl = tmdb.responsivePoster(film.altPoster || film.poster_path)
    const queryClient = useQueryClient()
    const [isLoaded, setIsLoaded] = useState(false)

    const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleMouseEnter = useCallback(() => {
        hoverTimeout.current = setTimeout(() => {
            if (!film?.id) return
            // movieDetails already includes credits via append_to_response
            queryClient.prefetchQuery({
                queryKey: ['film', String(film.id)],
                queryFn: () => tmdb.movieDetails(film.id),
                staleTime: 1000 * 60 * 10
            })
        }, 500) // 500ms debounce prevents API hammering during fast scrolling
    }, [film?.id, queryClient])

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    }, [])

    useEffect(() => {
        return () => {
            if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
        }
    }, [])

    return (
        <div
            className="card-film cine-card projector-glow"
            style={{ aspectRatio: '2/3' }}
            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleMouseEnter}
            aria-label={film.title || 'Film'}
            role="button"
            tabIndex={onClick ? 0 : undefined}
        >
            <Poster 
                path={film.altPoster || film.poster_path} 
                title={film.title || 'Film'} 
                sizeHint="md" 
                style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            />
            <div className="card-film-overlay">
                <div style={{ fontFamily: 'var(--font-sub)', fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', color: 'var(--parchment)', lineHeight: 1.3 }}>
                    {film.title}
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.2rem' }}>
                    {film.release_date?.slice(0, 4) || '—'}
                </div>
                {showRating && (film.vote_average ?? 0) > 0 && (
                    <div style={{ marginTop: '0.3rem' }}>
                        <ReelRating value={(film.vote_average ?? 0) / 2} size="sm" />
                    </div>
                )}
            </div>
        </div>
    )
})

// ── NEW: PREMIUM PERSON PLACEHOLDER ──
export function PersonPlaceholder({ size = '100%' }: PersonPlaceholderProps) {
    return (
        <div style={{
            width: size, height: '100%',
            background: 'var(--soot)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden'
        }}>
            <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.2 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12C10.34 12 9 10.66 9 9C9 7.34 10.34 6 12 6ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="var(--sepia)" />
            </svg>
            <div style={{
                position: 'absolute', inset: 0,
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(139,105,20,0.03) 3px)',
                pointerEvents: 'none'
            }} />
        </div>
    )
}

function FilmReelIcon() {
    return (
        <img src="/reelhouse-logo.svg" alt="ReelHouse Frame" width="32" height="32" style={{ opacity: 0.3, filter: 'grayscale(100%)' }} />
    )
}

// Genre tag cloud
const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western',
}

export function GenreTags({ genreIds = [], genres = [] }: GenreTagsProps) {
    const display = genres.length > 0
        ? genres.slice(0, 3).map((g) => g.name)
        : genreIds.slice(0, 3).map((id) => GENRE_MAP[id]).filter(Boolean)

    return (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {display.map((g) => (
                <span key={g} className="tag">{g}</span>
            ))}
        </div>
    )
}

// Persona stamp
const PERSONAS: Record<string, { color: string; symbol: React.ReactNode }> = {
    'The Midnight Devotee': { color: '#5C1A0B', symbol: '🕛' },
    'The Archivist': { color: '#8B6914', symbol: '📜' },
    'The Weeper': { color: '#4A6B8A', symbol: '💧' },
    'The Contrarian': { color: '#6B4A8A', symbol: '⚡' },
    'The Completionist': { color: '#1C5C1A', symbol: <><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></> },
}

export function PersonaStamp({ persona }: PersonaStampProps) {
    const p = PERSONAS[persona] || { color: 'var(--sepia)', symbol: '✦' }
    return (
        <span className="persona-stamp" style={{ color: p.color, borderColor: p.color }}>
            {p.symbol} {persona}
        </span>
    )
}

// Section header
export function SectionHeader({ label, title, action, className = '', style = {} }: SectionHeaderProps) {
    return (
        <div className={`section-header ${className}`} style={{ ...style }}>
            <span className="section-label">{label}</span>
            <h2>{title}</h2>
            {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
        </div>
    )
}

// Marquee ticker
export function Ticker({ items = [] }: TickerProps) {
    if (!items.length) return null
    const content = items.join(' ✦ ')
    return (
        <div className="ticker-wrap">
            <div className="ticker-content">{content} ✦ {content}</div>
        </div>
    )
}

// ── DARKROOM SKELETON — Perceived-speed skeleton loaders ──
function SkeletonPulse({ style = {} }: { style?: CSSProperties }) {
    return (
        <div className="shimmer" style={{
            borderRadius: 'var(--radius-card)',
            ...style
        }} />
    )
}

// Film strip poster grid skeleton
export function PosterGridSkeleton({ count = 6 }: SkeletonProps) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <SkeletonPulse style={{ aspectRatio: '2/3', width: '100%', animationDelay: `${i * 0.08}s` }} />
                    <SkeletonPulse style={{ height: '0.75rem', width: '80%', animationDelay: `${i * 0.08 + 0.1}s` }} />
                    <SkeletonPulse style={{ height: '0.5rem', width: '50%', animationDelay: `${i * 0.08 + 0.2}s` }} />
                </div>
            ))}
        </div>
    )
}

// Horizontal film strip row skeleton
export function FilmStripSkeleton({ count = 8 }: SkeletonProps) {
    return (
        <div style={{ display: 'flex', gap: '1rem', overflow: 'hidden', padding: '0.5rem 0 1rem' }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} style={{ flexShrink: 0, width: 130, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <SkeletonPulse style={{ width: 130, height: 195, animationDelay: `${i * 0.06}s` }} />
                    <SkeletonPulse style={{ height: '0.6rem', width: '75%', animationDelay: `${i * 0.06 + 0.1}s` }} />
                </div>
            ))}
        </div>
    )
}

// Legacy spinner fallback (used in detail pages)
export function LoadingReel() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '4rem 0' }}>
            <svg className="loading-reel" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="28" stroke="#8B6914" strokeWidth="2" fill="#0A0703" />
                <circle cx="30" cy="30" r="10" stroke="#8B6914" strokeWidth="2" fill="#1C1710" />
                <circle cx="30" cy="30" r="4" fill="#F2E8A0" />
                <circle cx="30" cy="7" r="5" fill="#3A3228" stroke="#8B6914" strokeWidth="1.5" />
                <circle cx="30" cy="53" r="5" fill="#3A3228" stroke="#8B6914" strokeWidth="1.5" />
                <circle cx="7" cy="30" r="5" fill="#3A3228" stroke="#8B6914" strokeWidth="1.5" />
                <circle cx="53" cy="30" r="5" fill="#3A3228" stroke="#8B6914" strokeWidth="1.5" />
            </svg>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                LOADING REEL...
            </span>
        </div>
    )
}

// Film stat card
export function StatCard({ label, value, icon }: StatCardProps) {
    return (
        <div className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
            {icon && <div style={{ marginBottom: '0.5rem', color: 'var(--sepia)' }}>{icon}</div>}
            <div style={{ fontFamily: 'var(--font-display-alt)', fontSize: '1.8rem', color: 'var(--flicker)' }}>
                {value}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)', marginTop: '0.25rem' }}>
                {label}
            </div>
        </div>
    )
}

// ── THE AUTOPSY (CELLULOID GAUGE) ──
export function RadarChart({ autopsy }: RadarChartProps) {
    if (!autopsy) return null;

    // Data mapping uses the new precise architectural constraints while maintaining backwards compatibility with legacy logs
    const data = [
        { key: 'story', label: 'STORY', value: autopsy.story !== undefined ? autopsy.story : autopsy.screenplay || 0 },
        { key: 'script', label: 'SCRIPT / DIALOGUE', value: autopsy.script !== undefined ? autopsy.script : autopsy.screenplay || 0 },
        { key: 'acting', label: 'ACTING & CHARACTER', value: autopsy.acting || autopsy.direction || 0 },
        { key: 'cinematography', label: 'CINEMATOGRAPHY', value: autopsy.cinematography || 0 },
        { key: 'editing', label: 'EDITING & PACING', value: autopsy.editing !== undefined ? autopsy.editing : autopsy.pacing || 0 },
        { key: 'sound', label: 'SOUND DESIGN & SCORE', value: autopsy.sound || 0 },
    ];

    return (
        <div className="card" style={{ padding: '2rem', margin: '2rem 0', display: 'flex', flexDirection: 'column', gap: '2rem', position: 'relative', overflow: 'hidden', background: 'var(--ink)' }}>

            {/* Deep vintage vignette - completely removing any bright ambient light */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ash)', paddingBottom: '1rem', position: 'relative', zIndex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--bone)', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: 'var(--blood-reel)' }}>✦</span>
                    THE AUTOPSY
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--fog)', textTransform: 'uppercase' }}>
                    Confidential
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem', position: 'relative', zIndex: 1 }}>
                {data.map((item, i) => (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.1rem' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                                {item.label}
                            </span>
                            {/* Using the core cinematic font to perfectly match the Nitrate Noir aesthetic */}
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', lineHeight: 1, color: 'var(--parchment)', opacity: 0.85, letterSpacing: '0.05em' }}>
                                {item.value === 10 ? '10.0' : `${parseFloat(String(item.value)).toFixed(1)}`}
                            </span>
                        </div>

                        {/* Vaporized DOM Track — Ultra-Lightweight CSS Gradient Projection */}
                        <div style={{ width: '100%', height: '8px', position: 'relative', background: 'var(--soot)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9)', border: '1px solid rgba(10, 7, 3, 0.8)', borderRadius: '1px', overflow: 'hidden' }}>
                            <div style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${(item.value / 10) * 100}%`,
                                background: 'linear-gradient(to bottom, var(--sepia), #5a430d)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                            }} />
                            {/* Mathematical vertical dividers simulate physical segmentation */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                background: 'repeating-linear-gradient(to right, transparent 0%, transparent calc(10% - 4px), #0A0703 calc(10% - 4px), #0A0703 10%)',
                                pointerEvents: 'none'
                            }} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="scanlines" style={{ position: 'absolute', inset: 0, opacity: 0.1, pointerEvents: 'none' }} />
        </div>
    )
}

// ── Query Error Banner — themed error state with retry ──
export function QueryErrorBanner({ message, onRetry }: { message?: string; onRetry?: () => void }) {
    return (
        <div className="section-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--blood-reel)', lineHeight: 1 }}><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)' }}>The Projector Has Jammed</div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', lineHeight: 1.5, maxWidth: 340 }}>
                {message || 'Something went wrong while loading this section. The reel can be reloaded.'}
            </p>
            {onRetry && <button onClick={onRetry} className="btn btn-ghost" style={{ fontSize: '0.6rem' }}>↻ TRY AGAIN</button>}
        </div>
    )
}

export function Portal({ children }: { children: React.ReactNode }) {
    if (typeof document === 'undefined') return <>{children}</>
    return createPortal(children, document.body)
}
