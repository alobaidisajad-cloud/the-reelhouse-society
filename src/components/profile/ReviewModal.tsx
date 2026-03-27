import { X, Edit3, Calendar, User } from 'lucide-react'
import { ReelRating } from '../UI'
import { tmdb } from '../../tmdb'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { Link } from 'react-router-dom'

/**
 * Cinematic log detail modal — premium Nitrate Noir redesign.
 * Single close mechanism: click outside the card. No duplicate buttons.
 */
export default function ReviewModal({ viewLog, profileUser, isOwnProfile, routeUsername, onClose, onEdit }: {
    viewLog: any
    profileUser: any
    isOwnProfile: boolean
    routeUsername: string
    onClose: () => void
    onEdit: (log: any) => void
}) {
    const focusTrapRef = useFocusTrap(!!viewLog, onClose)
    if (!viewLog) return null

    const poster = viewLog.altPoster || viewLog.poster
    const ratingLabels = ['', 'Walks Out', 'Poor Cut', 'Solid Frame', 'Compelling', 'Masterpiece']
    const statusColor = viewLog.status === 'abandoned' ? 'var(--blood-reel)' : viewLog.status === 'rewatched' ? 'var(--flicker)' : 'var(--sepia)'
    const statusLabel = viewLog.status === 'watched' ? 'WATCHED' : viewLog.status === 'rewatched' ? '⟳ REWATCH' : '✕ ABANDONED'

    return (
        <div
            ref={focusTrapRef}
            onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.down = '1' }}
            onMouseUp={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.down === '1') onClose(); (e.currentTarget as HTMLElement).dataset.down = '0' }}
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Log details for ${viewLog.title}`}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: 'calc(100% - 2rem)',
                    maxWidth: 520,
                    maxHeight: 'calc(100dvh - 2rem)',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    borderRadius: '16px',
                    boxShadow: '0 40px 120px rgba(0,0,0,0.95), 0 0 0 1px rgba(196,150,26,0.2), 0 0 80px rgba(196,150,26,0.06)',
                    background: 'var(--soot)',
                    scrollbarWidth: 'none',
                }}
            >
                {/* ── CINEMATIC HERO ── */}
                <div style={{ position: 'relative', height: 260, overflow: 'hidden', flexShrink: 0 }}>
                    {/* Backdrop blur layer */}
                    {poster && (
                        <img
                            src={tmdb.poster(poster, 'w780')}
                            alt=""
                            aria-hidden
                            style={{
                                position: 'absolute', inset: 0,
                                width: '100%', height: '100%',
                                objectFit: 'cover',
                                filter: 'blur(18px) brightness(0.35) saturate(0.8)',
                                transform: 'scale(1.12)',
                            }}
                        />
                    )}
                    {/* Dramatic gradient fade */}
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(15,13,10,0) 40%, rgba(15,13,10,1) 100%)',
                        zIndex: 1,
                    }} />
                    {/* Scanline overlay */}
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 2,
                        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
                        pointerEvents: 'none',
                    }} />
                    {/* Status badge — top left */}
                    <div style={{
                        position: 'absolute', top: '1rem', left: '1rem', zIndex: 10,
                        fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.25em',
                        color: statusColor,
                        background: `${statusColor}18`,
                        border: `1px solid ${statusColor}55`,
                        padding: '0.3rem 0.7rem', borderRadius: '3px',
                    }}>
                        {statusLabel}
                    </div>
                    {/* Close button — top right, minimal */}
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            position: 'absolute', top: '0.85rem', right: '0.85rem', zIndex: 10,
                            background: 'rgba(15,13,10,0.7)', backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '50%', width: 30, height: 30,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(196,150,26,0.2)'; (e.currentTarget as HTMLElement).style.color = 'var(--sepia)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,13,10,0.7)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
                    >
                        <X size={12} />
                    </button>
                    {/* Large poster floating over the hero bottom */}
                    {poster && (
                        <div style={{
                            position: 'absolute', bottom: '-40px', left: '1.5rem', zIndex: 5,
                            width: 88, height: 132,
                            borderRadius: '6px',
                            overflow: 'hidden',
                            boxShadow: '0 12px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(196,150,26,0.3)',
                        }}>
                            <img
                                src={tmdb.poster(poster, 'w342')}
                                alt={viewLog.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </div>
                    )}
                </div>

                {/* ── TITLE SECTION ── */}
                <div style={{ padding: '0 1.5rem', paddingTop: poster ? '3rem' : '1.5rem', paddingBottom: '0' }}>
                    {/* Title + Year */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'clamp(1.3rem, 4vw, 1.75rem)',
                            color: 'var(--parchment)',
                            lineHeight: 1.1,
                            letterSpacing: '0.01em',
                            marginBottom: '0.3rem',
                        }}>
                            {viewLog.title}
                        </div>
                        <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                            letterSpacing: '0.3em', color: 'var(--fog)',
                        }}>
                            {viewLog.year}
                        </div>
                    </div>

                    {/* ── META ROW ── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.75rem 0',
                        borderTop: '1px solid rgba(196,150,26,0.12)',
                        borderBottom: '1px solid rgba(196,150,26,0.12)',
                        marginBottom: '1.5rem', flexWrap: 'wrap',
                    }}>
                        <Link
                            to={`/user/${profileUser?.username || routeUsername}`}
                            onClick={onClose}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
                        >
                            <User size={11} style={{ color: 'var(--fog)' }} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em', color: 'var(--flicker)' }}>
                                @{(profileUser?.username || routeUsername || '').toUpperCase()}
                            </span>
                        </Link>
                        {viewLog.watchedDate && (
                            <>
                                <div style={{ width: 1, height: 10, background: 'var(--ash)' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <Calendar size={11} style={{ color: 'var(--fog)' }} />
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>
                                        {new Date(viewLog.watchedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── RATING ── */}
                    {viewLog.rating > 0 && (
                        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                            <ReelRating value={viewLog.rating} size="lg" />
                            <div style={{
                                fontFamily: 'var(--font-sub)',
                                fontSize: '0.8rem',
                                color: 'var(--sepia)',
                                letterSpacing: '0.06em',
                                marginTop: '0.5rem',
                                fontStyle: 'italic',
                            }}>
                                {ratingLabels[Math.ceil(viewLog.rating)]}
                                {viewLog.rating % 1 !== 0 && <span style={{ color: 'var(--fog)', fontSize: '0.65rem' }}> · {viewLog.rating} reels</span>}
                            </div>
                        </div>
                    )}

                    {/* ── PULL QUOTE ── */}
                    {viewLog.pullQuote && (
                        <div style={{
                            margin: '0 0 1.5rem',
                            padding: '1rem 1.25rem',
                            background: 'rgba(196,150,26,0.04)',
                            borderLeft: '3px solid var(--sepia)',
                            borderRadius: '0 4px 4px 0',
                        }}>
                            <div style={{
                                fontFamily: 'var(--font-sub)', fontStyle: 'italic',
                                fontSize: '1.05rem', color: 'var(--flicker)',
                                lineHeight: 1.55,
                            }}>
                                "{viewLog.pullQuote}"
                            </div>
                        </div>
                    )}

                    {/* ── REVIEW ── */}
                    {viewLog.review && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.45rem',
                                letterSpacing: '0.25em', color: 'var(--sepia)', marginBottom: '0.6rem',
                            }}>FIELD NOTES</div>
                            <div style={{
                                fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                                color: 'var(--bone)', lineHeight: 1.8,
                                whiteSpace: 'pre-wrap',
                            }}>
                                {viewLog.review}
                            </div>
                        </div>
                    )}

                    {/* ── ABANDONED REASON ── */}
                    {viewLog.status === 'abandoned' && viewLog.abandonedReason && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.25em', color: 'var(--blood-reel)', marginBottom: '0.5rem' }}>REASON FOR WALKOUT</div>
                            <div className="tag tag-flicker" style={{ display: 'inline-block' }}>{viewLog.abandonedReason}</div>
                        </div>
                    )}

                    {/* ── PRIVATE META ── */}
                    {isOwnProfile && (viewLog.watchedWith || (viewLog.physicalMedia && viewLog.physicalMedia !== 'None')) && (
                        <div style={{
                            display: 'flex', gap: '1rem', flexWrap: 'wrap',
                            padding: '0.75rem',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '4px',
                            marginBottom: '1.5rem',
                        }}>
                            {viewLog.watchedWith && (
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                    ♡ WITH <span style={{ color: 'var(--bone)' }}>{viewLog.watchedWith}</span>
                                </div>
                            )}
                            {viewLog.physicalMedia && viewLog.physicalMedia !== 'None' && (
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                    ◎ <span style={{ color: 'var(--bone)' }}>{viewLog.physicalMedia}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── AUTOPSY ENGINE ── */}
                    {viewLog.isAutopsied && viewLog.autopsy && (
                        <div style={{
                            padding: '1rem', marginBottom: '1.5rem',
                            border: '1px solid rgba(107,26,10,0.3)',
                            borderRadius: '6px',
                            background: 'rgba(107,26,10,0.05)',
                        }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.25em', color: 'var(--blood-reel)', marginBottom: '0.75rem' }}>
                                ✦ AUTOPSY ENGINE
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {Object.entries(viewLog.autopsy).map(([axis, val]) => {
                                    const labels: Record<string, string> = { story: 'STORY', script: 'SCRIPT', acting: 'ACTING', cinematography: 'CINEMA', editing: 'EDITING', sound: 'SOUND' }
                                    return (
                                        <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: 58, fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.08em', color: 'var(--fog)', flexShrink: 0 }}>{labels[axis] || axis.toUpperCase()}</div>
                                            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                <div style={{ width: `${Number(val) * 10}%`, height: '100%', background: 'linear-gradient(90deg, var(--blood-reel), var(--sepia))', borderRadius: 2, transition: 'width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                                            </div>
                                            <div style={{ width: 18, textAlign: 'right', fontFamily: 'var(--font-sub)', fontSize: '0.7rem', color: 'var(--bone)', flexShrink: 0 }}>{String(val)}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── ACTION BAR ── */}
                    {isOwnProfile && (
                        <div style={{
                            padding: '1rem 0 1.5rem',
                            borderTop: '1px solid rgba(196,150,26,0.12)',
                        }}>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', padding: '0.8rem', fontSize: '0.6rem', letterSpacing: '0.2em' }}
                                onClick={() => onEdit(viewLog)}
                            >
                                <Edit3 size={13} />
                                EDIT THIS LOG
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
