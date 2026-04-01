import { X, Edit3, Calendar, User } from 'lucide-react'
import { ReelRating } from '../UI'
import { tmdb } from '../../tmdb'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { Link } from 'react-router-dom'
import { Portal } from '../UI'

/**
 * Cinematic log detail modal — premium Nitrate Noir.
 * Close: click backdrop OR the single X button. No duplicate controls.
 * Visible to any user with access (edit button shown only to profile owner).
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
    const ratingLabel = ['', 'Walks Out', 'Poor Cut', 'Solid Frame', 'Compelling', 'Masterpiece'][Math.ceil(viewLog.rating)] || ''
    const statusColor = viewLog.status === 'abandoned' ? 'var(--blood-reel)' : viewLog.status === 'rewatched' ? 'var(--flicker)' : 'var(--sepia)'
    const statusLabel = viewLog.status === 'watched' ? 'WATCHED' : viewLog.status === 'rewatched' ? '⟳ REWATCH' : '✕ ABANDONED'
    const isArchivistLog = viewLog.editorialHeader || viewLog.dropCap || viewLog.pullQuote

    return (
        <Portal>
        <div
            ref={focusTrapRef}
            onMouseDown={(e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset.down = '1' }}
            onMouseUp={(e) => { if (e.target === e.currentTarget && (e.currentTarget as HTMLElement).dataset.down === '1') onClose(); (e.currentTarget as HTMLElement).dataset.down = '0' }}
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
                    borderRadius: '14px',
                    background: '#0D0B08',
                    boxShadow: isArchivistLog
                        ? '0 32px 100px rgba(0,0,0,0.95), 0 0 0 1px rgba(196,150,26,0.3), 0 0 60px rgba(139,105,20,0.08)'
                        : '0 32px 100px rgba(0,0,0,0.95), 0 0 0 1px rgba(196,150,26,0.18)',
                    scrollbarWidth: 'none',
                }}
            >

                {/* ══════════════════════════════════════
                    HERO — backdrop + poster + title inline
                    all contained, nothing overflows
                ══════════════════════════════════════ */}
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '14px 14px 0 0' }}>

                    {/* Atmospheric backdrop — uses editorial header if available, falls back to blurred poster */}
                    <div style={{ position: 'relative', height: viewLog.editorialHeader ? 280 : 200 }}>
                        {viewLog.editorialHeader ? (
                            <img
                                src={tmdb.backdrop(viewLog.editorialHeader, 'w1280')}
                                alt=""
                                aria-hidden
                                style={{
                                    position: 'absolute', inset: 0,
                                    width: '100%', height: '100%',
                                    objectFit: 'cover', objectPosition: 'center 25%',
                                    filter: 'sepia(0.08) contrast(1.1) brightness(0.45)',
                                }}
                            />
                        ) : poster ? (
                            <img
                                src={tmdb.poster(poster, 'w780')}
                                alt=""
                                aria-hidden
                                style={{
                                    position: 'absolute', inset: 0,
                                    width: '100%', height: '100%',
                                    objectFit: 'cover',
                                    filter: 'blur(20px) brightness(0.3) saturate(0.7)',
                                    transform: 'scale(1.15)',
                                }}
                            />
                        ) : (
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1C160E 0%, #0D0B08 100%)' }} />
                        )}
                        {/* Gradient that transitions smoothly to the card body */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: viewLog.editorialHeader
                                ? 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 25%, rgba(13,11,8,0.6) 55%, rgba(13,11,8,1) 100%)'
                                : 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(13,11,8,0.7) 60%, rgba(13,11,8,1) 100%)',
                        }} />
                        {/* Side vignette for editorial headers */}
                        {viewLog.editorialHeader && (
                            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center 35%, transparent 30%, rgba(13,11,8,0.45) 100%)' }} />
                        )}
                        {/* Horizontal scanlines */}
                        <div style={{
                            position: 'absolute', inset: 0, pointerEvents: 'none',
                            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
                        }} />

                        {/* Status badge — top left */}
                        <div style={{
                            position: 'absolute', top: '0.9rem', left: '0.9rem',
                            fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.25em',
                            color: statusColor,
                            background: `${statusColor}1A`,
                            border: `1px solid ${statusColor}44`,
                            padding: '0.25rem 0.6rem', borderRadius: '3px',
                        }}>
                            {statusLabel}
                        </div>

                        {/* Archivist badge — top right corner when editorial features are used */}
                        {isArchivistLog && (
                            <div style={{
                                position: 'absolute', top: '0.9rem', right: '2.8rem',
                                fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.2em',
                                color: 'var(--sepia)',
                                background: 'rgba(11,10,8,0.6)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(139,105,20,0.3)',
                                padding: '0.2rem 0.5rem', borderRadius: '3px',
                            }}>
                                ✦ ARCHIVIST
                            </div>
                        )}

                        {/* X close button — top right */}
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                position: 'absolute', top: '0.8rem', right: '0.8rem',
                                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '50%', width: 28, height: 28,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196,150,26,0.5)'; (e.currentTarget as HTMLElement).style.color = 'var(--sepia)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)' }}
                        >
                            <X size={11} />
                        </button>
                    </div>

                    {/* ── Poster + Title row — sits BELOW the backdrop, still inside the hero container ── */}
                    <div style={{
                        display: 'flex', gap: '1rem', alignItems: 'flex-end',
                        padding: '0 1.25rem 1.25rem',
                        marginTop: '-72px', // lifts up to overlap backdrop bottom, but stays inside
                        position: 'relative', zIndex: 2,
                    }}>
                        {/* Poster thumbnail */}
                        {poster && (
                            <div style={{
                                flexShrink: 0,
                                width: 72, height: 108,
                                borderRadius: '6px',
                                overflow: 'hidden',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.85), 0 0 0 1px rgba(196,150,26,0.25)',
                            }}>
                                <img
                                    src={tmdb.poster(poster, 'w185')}
                                    alt={viewLog.title}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                        )}
                        {/* Title block */}
                        <div style={{ flex: 1, paddingBottom: '0.25rem' }}>
                            <div style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: 'clamp(1.1rem, 4vw, 1.5rem)',
                                color: 'var(--parchment)',
                                lineHeight: 1.15,
                                marginBottom: '0.3rem',
                            }}>
                                {viewLog.title}
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                                letterSpacing: '0.25em', color: 'var(--fog)',
                            }}>
                                {viewLog.year}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════
                    BODY CONTENT
                ══════════════════════════════════════ */}
                <div style={{ padding: '0 1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

                    {/* ── Meta row ── */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
                        paddingBottom: '1rem',
                        borderBottom: '1px solid rgba(196,150,26,0.1)',
                    }}>
                        <Link
                            to={`/user/${profileUser?.username || routeUsername}`}
                            onClick={onClose}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
                        >
                            <User size={10} style={{ color: 'var(--fog)', flexShrink: 0 }} />
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', letterSpacing: '0.12em', color: 'var(--flicker)' }}>
                                @{(profileUser?.username || routeUsername || '').toUpperCase()}
                            </span>
                        </Link>
                        {viewLog.watchedDate && (
                            <>
                                <div style={{ width: 1, height: 9, background: 'var(--ash)' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Calendar size={10} style={{ color: 'var(--fog)', flexShrink: 0 }} />
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.48rem', letterSpacing: '0.08em', color: 'var(--fog)' }}>
                                        {new Date(viewLog.watchedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Rating ── */}
                    {viewLog.rating > 0 && (
                        <div style={{ textAlign: 'center', padding: '0.25rem 0' }}>
                            <ReelRating value={viewLog.rating} size="lg" />
                            <div style={{
                                fontFamily: 'var(--font-sub)', fontStyle: 'italic',
                                fontSize: '0.78rem', color: 'var(--sepia)',
                                letterSpacing: '0.05em', marginTop: '0.5rem',
                            }}>
                                {ratingLabel}
                                {viewLog.rating % 1 !== 0 && (
                                    <span style={{ color: 'var(--fog)', fontSize: '0.6rem' }}> · {viewLog.rating} reels</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Pull Quote ── */}
                    {viewLog.pullQuote && (
                        <div style={{ position: 'relative', padding: '1rem 1.25rem', background: 'rgba(196,150,26,0.04)', borderRadius: '0 4px 4px 0', borderLeft: '3px solid var(--sepia)' }}>
                            {/* Ornamental divider */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.35rem', letterSpacing: '0.2em', color: 'var(--sepia)', opacity: 0.6 }}>✦ PULL QUOTE</span>
                                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(139,105,20,0.2), transparent)' }} />
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-display)', fontStyle: 'italic',
                                fontSize: '1.1rem', color: 'var(--flicker)', lineHeight: 1.55,
                                textShadow: '0 1px 8px rgba(139,105,20,0.1)',
                            }}>
                                « {viewLog.pullQuote} »
                            </div>
                        </div>
                    )}

                    {/* ── Review / Field Notes ── */}
                    {viewLog.review && (
                        <div>
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.42rem',
                                letterSpacing: '0.25em', color: 'var(--sepia)', marginBottom: '0.5rem',
                            }}>FIELD NOTES</div>
                            <div style={{
                                fontFamily: 'var(--font-body)', fontSize: '0.88rem',
                                color: 'var(--bone)', lineHeight: 1.8, whiteSpace: 'pre-wrap',
                            }}>
                                {viewLog.review}
                            </div>
                        </div>
                    )}

                    {/* ── Abandoned Reason ── */}
                    {viewLog.status === 'abandoned' && viewLog.abandonedReason && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.25em', color: 'var(--blood-reel)', marginBottom: '0.4rem' }}>REASON FOR WALKOUT</div>
                            <span className="tag tag-flicker">{viewLog.abandonedReason}</span>
                        </div>
                    )}

                    {/* ── Private meta (own profile only) ── */}
                    {isOwnProfile && (viewLog.watchedWith || (viewLog.physicalMedia && viewLog.physicalMedia !== 'None')) && (
                        <div style={{
                            display: 'flex', gap: '1.25rem', flexWrap: 'wrap',
                            padding: '0.65rem 0.85rem',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '4px',
                        }}>
                            {viewLog.watchedWith && (
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                    ♡ WITH <span style={{ color: 'var(--bone)' }}>{viewLog.watchedWith}</span>
                                </div>
                            )}
                            {viewLog.physicalMedia && viewLog.physicalMedia !== 'None' && (
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.1em', color: 'var(--fog)' }}>
                                    ◎ <span style={{ color: 'var(--bone)' }}>{viewLog.physicalMedia}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Autopsy Engine ── */}
                    {viewLog.isAutopsied && viewLog.autopsy && (
                        <div style={{
                            padding: '0.85rem',
                            border: '1px solid rgba(107,26,10,0.25)',
                            borderRadius: '6px',
                            background: 'rgba(107,26,10,0.04)',
                        }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.25em', color: 'var(--blood-reel)', marginBottom: '0.65rem' }}>✦ AUTOPSY ENGINE</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                {Object.entries(viewLog.autopsy).map(([axis, val]) => {
                                    const labels: Record<string, string> = { story: 'STORY', script: 'SCRIPT', acting: 'ACTING', cinematography: 'CINEMA', editing: 'EDITING', sound: 'SOUND' }
                                    return (
                                        <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                            <div style={{ width: 52, fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.08em', color: 'var(--fog)', flexShrink: 0 }}>{labels[axis] || axis.toUpperCase()}</div>
                                            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                <div style={{ width: `${Number(val) * 10}%`, height: '100%', background: 'linear-gradient(90deg, var(--blood-reel), var(--sepia))', borderRadius: 2 }} />
                                            </div>
                                            <div style={{ width: 16, textAlign: 'right', fontFamily: 'var(--font-sub)', fontSize: '0.68rem', color: 'var(--bone)', flexShrink: 0 }}>{String(val)}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Edit action (owner only) ── */}
                    {isOwnProfile && (
                        <div style={{ borderTop: '1px solid rgba(196,150,26,0.1)', paddingTop: '1rem' }}>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', justifyContent: 'center', gap: '0.45rem', padding: '0.75rem', fontSize: '0.58rem', letterSpacing: '0.2em' }}
                                onClick={() => onEdit(viewLog)}
                            >
                                <Edit3 size={12} />
                                EDIT THIS LOG
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </Portal>
    )
}
