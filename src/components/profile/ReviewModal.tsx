import { ReelRating } from '../UI'
import { tmdb } from '../../tmdb'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * Inline review/log detail modal — shows full details of a logged film.
 * @param {{ viewLog: object, profileUser: object, isOwnProfile: boolean, routeUsername: string, onClose: Function, onEdit: Function }} props
 */
export default function ReviewModal({ viewLog, profileUser, isOwnProfile, routeUsername, onClose, onEdit }: { viewLog: any; profileUser: any; isOwnProfile: boolean; routeUsername: string; onClose: () => void; onEdit: (log: any) => void }) {
    const focusTrapRef = useFocusTrap(!!viewLog, onClose)
    if (!viewLog) return null

    return (
        <div
            onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.backdropMouseDown = 'true' }}
            onMouseUp={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.backdropMouseDown === 'true') onClose(); e.currentTarget.dataset.backdropMouseDown = 'false' }}
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Log details for ${viewLog.title}`}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(180deg, rgba(28,22,14,1) 0%, rgba(18,14,8,1) 100%)',
                    border: '1px solid rgba(139,105,20,0.35)',
                    borderRadius: '12px',
                    width: 'calc(100% - 2rem)', maxWidth: 580,
                    maxHeight: 'calc(100dvh - 2rem)',
                    overflow: 'auto',
                    position: 'relative',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(139,105,20,0.15)',
                }}
            >
                {/* Poster Banner */}
                {(viewLog.altPoster || viewLog.poster) && (
                    <div style={{ width: '100%', height: 200, overflow: 'hidden', position: 'relative' }}>
                        <img
                            src={tmdb.poster(viewLog.altPoster || viewLog.poster, 'w780')}
                            alt={viewLog.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.25) brightness(0.5) blur(2px)', transform: 'scale(1.05)' }}
                        />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 20%, rgba(28,22,14,1) 100%)' }} />
                    </div>
                )}

                {/* Header Bar */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1.5rem 1.5rem 0', marginTop: (viewLog.altPoster || viewLog.poster) ? '-3rem' : 0, position: 'relative', zIndex: 2 }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1 }}>
                        {(viewLog.altPoster || viewLog.poster) && (
                            <img
                                src={tmdb.poster(viewLog.altPoster || viewLog.poster, 'w154')}
                                alt={viewLog.title}
                                style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(139,105,20,0.3)', flexShrink: 0, boxShadow: '0 8px 20px rgba(0,0,0,0.6)' }}
                            />
                        )}
                        <div style={{ paddingTop: '0.25rem' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', lineHeight: 1.15 }}>
                                {viewLog.title}
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.12em', marginTop: '0.35rem' }}>
                                {viewLog.year}
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', marginTop: '0.5rem',
                                padding: '0.2rem 0.6rem', borderRadius: '3px', display: 'inline-block',
                                color: viewLog.status === 'abandoned' ? 'var(--blood-reel)' : viewLog.status === 'rewatched' ? 'var(--flicker)' : 'var(--sepia)',
                                background: viewLog.status === 'abandoned' ? 'rgba(162,36,36,0.12)' : viewLog.status === 'rewatched' ? 'rgba(212,185,117,0.1)' : 'rgba(139,105,20,0.12)',
                                border: `1px solid ${viewLog.status === 'abandoned' ? 'rgba(162,36,36,0.3)' : viewLog.status === 'rewatched' ? 'rgba(212,185,117,0.25)' : 'rgba(139,105,20,0.3)'}`,
                            }}>
                                {viewLog.status === 'watched' ? 'WATCHED' : viewLog.status === 'rewatched' ? 'REWATCH' : 'ABANDONED'}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)', cursor: 'pointer', flexShrink: 0 }}
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {/* Author + Date */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--fog)' }}>
                            LOGGED BY <span style={{ color: 'var(--flicker)' }}>@{(profileUser?.username || routeUsername || '').toUpperCase()}</span>
                        </div>
                        {viewLog.watchedDate && (
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                                {new Date(viewLog.watchedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        )}
                    </div>

                    {/* Rating */}
                    {viewLog.rating > 0 && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>RATING</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <ReelRating value={viewLog.rating} size="sm" />
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)' }}>
                                    {['', 'Unwatchable', 'Poor', 'Fine', 'Really Good', 'Masterpiece'][Math.ceil(viewLog.rating)]}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Abandoned Reason */}
                    {viewLog.status === 'abandoned' && viewLog.abandonedReason && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--blood-reel)', marginBottom: '0.4rem' }}>ABANDONED BECAUSE</div>
                            <div className="tag tag-flicker" style={{ display: 'inline-block' }}>{viewLog.abandonedReason}</div>
                        </div>
                    )}

                    {/* Pull Quote */}
                    {viewLog.pullQuote && (
                        <blockquote style={{
                            fontFamily: 'var(--font-sub)', fontStyle: 'italic',
                            fontSize: '1.15rem', color: 'var(--flicker)',
                            borderLeft: '3px solid var(--sepia)',
                            paddingLeft: '1rem', margin: '0.25rem 0',
                            lineHeight: 1.5,
                        }}>
                            "{viewLog.pullQuote}"
                        </blockquote>
                    )}

                    {/* Review */}
                    {viewLog.review && (
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>REVIEW</div>
                            <div style={{
                                fontFamily: 'var(--font-body)', fontSize: '0.92rem',
                                color: 'var(--bone)', lineHeight: 1.75,
                                whiteSpace: 'pre-wrap',
                            }}>
                                {viewLog.review}
                            </div>
                        </div>
                    )}

                    {/* Watched With — private, only visible on own profile */}
                    {isOwnProfile && viewLog.watchedWith && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                            ♡ WATCHED WITH <span style={{ color: 'var(--bone)' }}>{viewLog.watchedWith}</span>
                        </div>
                    )}

                    {/* Physical Media */}
                    {viewLog.physicalMedia && viewLog.physicalMedia !== 'None' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                            📀 PHYSICAL COPY: <span style={{ color: 'var(--bone)' }}>{viewLog.physicalMedia}</span>
                        </div>
                    )}

                    {/* Autopsy Engine */}
                    {viewLog.isAutopsied && viewLog.autopsy && (
                        <div style={{ padding: '1rem', border: '1px solid rgba(162,36,36,0.25)', borderRadius: '8px', background: 'rgba(162,36,36,0.04)' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--blood-reel)', marginBottom: '0.75rem' }}>
                                ✦ AUTOPSY ENGINE
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {Object.entries(viewLog.autopsy).map(([axis, val]) => {
                                const labels: Record<string, string> = { story: 'STORY', script: 'SCRIPT', acting: 'ACTING', cinematography: 'CINEMA', editing: 'EDITING', sound: 'SOUND' }
                                    return (
                                        <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: 60, fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.05em', color: 'var(--fog)' }}>{labels[axis] || axis.toUpperCase()}</div>
                                            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                                <div style={{ width: `${Number(val) * 10}%`, height: '100%', background: 'linear-gradient(90deg, var(--blood-reel), var(--sepia))', borderRadius: 2 }} />
                                            </div>
                                            <div style={{ width: 20, textAlign: 'right', fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)' }}>{String(val)}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid rgba(139,105,20,0.2)', paddingTop: '1rem' }}>
                        {isOwnProfile && (
                            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', gap: '0.4rem' }} onClick={() => onEdit(viewLog)}>
                                ✎ Edit This Log
                            </button>
                        )}
                        <button
                            className="btn btn-ghost"
                            style={{ flex: isOwnProfile ? 0 : 1, justifyContent: 'center' }}
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
