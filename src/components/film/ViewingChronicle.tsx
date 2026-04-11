import { useState } from 'react'
import { ChevronDown, ChevronUp, RotateCcw, Eye } from 'lucide-react'
import type { FilmLog } from '../../types'

// ── Half-star display utility ──
function formatRating(rating: number): string {
    const full = Math.floor(rating)
    const half = rating % 1 >= 0.25 && rating % 1 < 0.75
    const remainder = 5 - full - (half ? 1 : 0)
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(Math.max(0, remainder))
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return ''
    try {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { return '' }
}

interface ViewingEntry {
    date?: string
    rating: number
    review?: string
    watchedWith?: string | null
}

interface ViewingChronicleProps {
    log: FilmLog
}

export default function ViewingChronicle({ log }: ViewingChronicleProps) {
    const [expanded, setExpanded] = useState(false)
    
    const history = log.viewingHistory || []
    if (history.length === 0) return null

    // Build timeline: current viewing (latest) + all past viewings from history
    const currentViewing: ViewingEntry = {
        date: log.watchedDate || log.createdAt,
        rating: log.rating,
        review: log.review,
        watchedWith: log.watchedWith,
    }
    const allViewings = [currentViewing, ...history] // newest-first
    const viewingCount = (log.viewCount || 1)
    
    return (
        <section>
            {/* Header */}
            <button 
                onClick={() => setExpanded(e => !e)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, rgba(139,105,20,0.06), rgba(10,7,3,0.4))',
                    border: '1px solid rgba(139,105,20,0.2)', borderRadius: 8,
                    padding: '0.85rem 1.1rem', cursor: 'pointer',
                    transition: 'border-color 0.3s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(139,105,20,0.5)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(139,105,20,0.2)'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <RotateCcw size={14} color="var(--sepia)" />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)' }}>
                        VIEWING CHRONICLE
                    </span>
                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.7rem', color: 'var(--fog)' }}>
                        — {viewingCount} viewings
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* Rating evolution sparkline */}
                    <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.65rem', color: 'var(--fog)', opacity: 0.7 }}>
                        {[...allViewings].reverse().filter(v => v.rating > 0).map((v, i, arr) => (
                            <span key={i}>
                                {formatRating(v.rating)}
                                {i < arr.length - 1 ? ' → ' : ''}
                            </span>
                        ))}
                    </span>
                    {expanded ? <ChevronUp size={14} color="var(--fog)" /> : <ChevronDown size={14} color="var(--fog)" />}
                </div>
            </button>

            {/* Timeline */}
            {expanded && (
                <div style={{
                    marginTop: '0.5rem', paddingLeft: '1.25rem',
                    borderLeft: '2px solid rgba(139,105,20,0.2)',
                    display: 'flex', flexDirection: 'column', gap: '0',
                }}>
                    {allViewings.map((viewing, index) => {
                        const isFirst = index === allViewings.length - 1 // Oldest = first watch
                        const isLatest = index === 0
                        const viewNum = viewingCount - index

                        return (
                            <div key={index} style={{
                                position: 'relative', padding: '1rem 0 1rem 1.25rem',
                                borderBottom: index < allViewings.length - 1 ? '1px solid rgba(139,105,20,0.08)' : 'none',
                            }}>
                                {/* Timeline dot */}
                                <div style={{
                                    position: 'absolute', left: '-7px', top: '1.2rem',
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: isLatest ? 'var(--sepia)' : 'var(--soot)',
                                    border: `2px solid ${isLatest ? 'var(--flicker)' : 'rgba(139,105,20,0.4)'}`,
                                    boxShadow: isLatest ? '0 0 8px rgba(139,105,20,0.4)' : 'none',
                                }} />

                                {/* Viewing number badge */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                                    <span style={{
                                        fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em',
                                        color: isLatest ? 'var(--sepia)' : 'var(--fog)',
                                        background: isLatest ? 'rgba(139,105,20,0.12)' : 'rgba(255,255,255,0.04)',
                                        padding: '0.15rem 0.5rem', borderRadius: 4,
                                        border: `1px solid ${isLatest ? 'rgba(139,105,20,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                    }}>
                                        {isFirst ? (
                                            <><Eye size={9} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} />FIRST WATCH</>
                                        ) : (
                                            <><RotateCcw size={8} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} />VIEWING {viewNum}</>
                                        )}
                                    </span>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>
                                        {formatDate(viewing.date)}
                                    </span>
                                    {isLatest && (
                                        <span style={{
                                            fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.2em',
                                            color: 'var(--ink)', background: 'var(--sepia)',
                                            padding: '0.1rem 0.35rem', borderRadius: 3,
                                        }}>LATEST</span>
                                    )}
                                </div>

                                {/* Rating */}
                                {viewing.rating > 0 && (
                                    <div style={{
                                        fontFamily: 'var(--font-sub)', fontSize: '0.85rem',
                                        color: isLatest ? 'var(--flicker)' : 'var(--bone)',
                                        marginBottom: '0.25rem',
                                    }}>
                                        {formatRating(viewing.rating)}
                                    </div>
                                )}

                                {/* Review excerpt */}
                                {viewing.review && (
                                    <p style={{
                                        fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                                        color: 'var(--bone)', lineHeight: 1.55, margin: 0,
                                        opacity: isLatest ? 0.9 : 0.65,
                                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any,
                                        overflow: 'hidden',
                                    }}>
                                        "{viewing.review}"
                                    </p>
                                )}

                                {/* Watched with */}
                                {viewing.watchedWith && (
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)', marginTop: '0.25rem' }}>
                                        ♡ {viewing.watchedWith}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
