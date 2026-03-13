import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, Clock, BookOpen, EyeOff, Edit3 } from 'lucide-react'
import { useUIStore, useAuthStore } from '../store'
import { tmdb } from '../tmdb'
import { ReelRating } from './UI'
import { useNavigate } from 'react-router-dom'

export default function LogViewModal() {
    const viewLogData = useUIStore(state => state.viewLogData)
    const closeViewLog = useUIStore(state => state.closeViewLog)
    const openLogModal = useUIStore(state => state.openLogModal)
    const currentUser = useAuthStore(state => state.user)
    const navigate = useNavigate()

    if (!viewLogData) return null

    const { log, film, ownerUsername } = viewLogData
    const isOwn = currentUser?.username === ownerUsername

    const statusLabel = { watched: 'WATCHED', rewatched: 'REWATCH', abandoned: 'ABANDONED' }
    const statusColor = { watched: 'var(--sepia)', rewatched: 'var(--flicker)', abandoned: 'var(--blood-reel)' }

    const handleEdit = () => {
        closeViewLog()
        openLogModal(film, log.id)
    }

    return (
        <AnimatePresence>
            <motion.div
                key="view-log-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeViewLog}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(10,7,3,0.88)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
            >
                <motion.div
                    key="view-log-box"
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--ash)',
                        borderRadius: 'var(--radius-card)',
                        width: 'calc(100% - 2rem)',
                        maxWidth: 580,
                        maxHeight: 'calc(100vh - 2rem)',
                        overflow: 'auto',
                        position: 'relative',
                    }}
                >
                    {/* Editorial Header */}
                    {log.editorialHeader && (
                        <div style={{ width: '100%', height: 180, overflow: 'hidden', position: 'relative' }}>
                            <img
                                src={tmdb.backdrop(log.editorialHeader, 'w780')}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.2) brightness(0.7)' }}
                            />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, var(--soot) 100%)' }} />
                        </div>
                    )}

                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                        padding: '1.5rem 1.5rem 0',
                    }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1 }}>
                            {(log.altPoster || log.poster || film?.poster_path) && (
                                <img
                                    src={tmdb.poster(log.altPoster || log.poster || film?.poster_path, 'w154')}
                                    alt={log.title}
                                    style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: '4px', filter: 'sepia(0.2)', flexShrink: 0, cursor: 'pointer' }}
                                    onClick={() => { closeViewLog(); navigate(`/film/${log.filmId}`) }}
                                />
                            )}
                            <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', lineHeight: 1.2, cursor: 'pointer' }} onClick={() => { closeViewLog(); navigate(`/film/${log.filmId}`) }}>
                                    {log.title}
                                </div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.3rem' }}>
                                    {log.year}
                                </div>

                                {/* Status badge */}
                                <div style={{
                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em',
                                    color: statusColor[log.status] || 'var(--sepia)',
                                    marginTop: '0.5rem',
                                    padding: '0.2rem 0.5rem',
                                    background: `${statusColor[log.status] || 'var(--sepia)'}15`,
                                    border: `1px solid ${statusColor[log.status] || 'var(--sepia)'}40`,
                                    borderRadius: '2px',
                                    display: 'inline-block',
                                }}>
                                    {statusLabel[log.status] || 'WATCHED'}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={closeViewLog}
                            style={{ background: 'none', border: 'none', color: 'var(--fog)', padding: '0.25rem', flexShrink: 0 }}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                        {/* Author + Date row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--fog)' }}>
                                LOGGED BY <span
                                    style={{ color: 'var(--flicker)', cursor: 'pointer', textDecoration: 'underline' }}
                                    onClick={() => { closeViewLog(); navigate(`/user/${ownerUsername}`) }}
                                >
                                    @{ownerUsername?.toUpperCase()}
                                </span>
                            </div>
                            {log.watchedDate && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                                    <Clock size={10} />
                                    {new Date(log.watchedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                            )}
                        </div>

                        {/* Rating */}
                        {log.rating > 0 && (
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>RATING</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ReelRating value={log.rating} size="sm" />
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)' }}>
                                        {['', 'Unwatchable', 'Not Great', 'Fine', 'Really Good', 'Masterpiece'][Math.ceil(log.rating)]}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Abandoned Reason */}
                        {log.status === 'abandoned' && log.abandonedReason && (
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--blood-reel)', marginBottom: '0.4rem' }}>ABANDONED BECAUSE</div>
                                <div className="tag tag-flicker" style={{ display: 'inline-block' }}>{log.abandonedReason}</div>
                            </div>
                        )}

                        {/* Pull Quote */}
                        {log.pullQuote && (
                            <blockquote style={{
                                fontFamily: 'var(--font-sub)', fontStyle: 'italic',
                                fontSize: '1.1rem', color: 'var(--flicker)',
                                borderLeft: '3px solid var(--sepia)',
                                paddingLeft: '1rem', margin: '0.5rem 0',
                                lineHeight: 1.5,
                            }}>
                                "{log.pullQuote}"
                            </blockquote>
                        )}

                        {/* Review */}
                        {log.review && (
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>REVIEW</div>
                                {log.isSpoiler ? (
                                    <details style={{ cursor: 'pointer' }}>
                                        <summary style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--blood-reel)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' }}>
                                            <EyeOff size={12} /> CONTAINS SPOILERS — CLICK TO REVEAL
                                        </summary>
                                        <div style={{
                                            fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                                            color: 'var(--bone)', lineHeight: 1.7,
                                            whiteSpace: 'pre-wrap',
                                            ...(log.dropCap ? { '::first-letter': {} } : {}),
                                        }}>
                                            {log.review}
                                        </div>
                                    </details>
                                ) : (
                                    <div style={{
                                        fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                                        color: 'var(--bone)', lineHeight: 1.7,
                                        whiteSpace: 'pre-wrap',
                                    }}>
                                        {log.dropCap ? (
                                            <>
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.8rem', float: 'left', lineHeight: 0.8, marginRight: '0.1rem', marginTop: '0.15rem', color: 'var(--sepia)' }}>
                                                    {log.review.charAt(0)}
                                                </span>
                                                {log.review.slice(1)}
                                            </>
                                        ) : log.review}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Watched With */}
                        {log.watchedWith && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                                ♡ WATCHED WITH <span style={{ color: 'var(--bone)' }}>{log.watchedWith}</span>
                            </div>
                        )}

                        {/* Physical Media */}
                        {log.physicalMedia && log.physicalMedia !== 'None' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                                <BookOpen size={12} /> PHYSICAL COPY: <span style={{ color: 'var(--bone)' }}>{log.physicalMedia}</span>
                            </div>
                        )}

                        {/* Autopsy */}
                        {log.isAutopsied && log.autopsy && (
                            <div style={{ padding: '1rem', border: '1px solid var(--blood-reel)', borderRadius: 'var(--radius-card)', background: 'rgba(162,36,36,0.05)' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--blood-reel)', marginBottom: '0.75rem' }}>
                                    ✦ AUTOPSY ENGINE
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {Object.entries(log.autopsy).map(([axis, val]) => {
                                        const labels = { story: 'STORY', script: 'SCRIPT', acting: 'ACTING', cinematography: 'CINEMA', editing: 'EDITING', sound: 'SOUND' }
                                        return (
                                            <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 60, fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.05em', color: 'var(--fog)' }}>{labels[axis] || axis.toUpperCase()}</div>
                                                <div style={{ flex: 1, height: 4, background: 'var(--ash)', borderRadius: 2, overflow: 'hidden' }}>
                                                    <div style={{ width: `${val * 10}%`, height: '100%', background: 'linear-gradient(90deg, var(--blood-reel), var(--sepia))', borderRadius: 2, transition: 'width 0.4s' }} />
                                                </div>
                                                <div style={{ width: 20, textAlign: 'right', fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--bone)' }}>{val}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--ash)', paddingTop: '1rem' }}>
                            {isOwn && (
                                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', gap: '0.4rem' }} onClick={handleEdit}>
                                    <Edit3 size={14} /> Edit This Log
                                </button>
                            )}
                            <button
                                className="btn btn-ghost"
                                style={{ flex: isOwn ? 0 : 1, justifyContent: 'center' }}
                                onClick={() => { closeViewLog(); navigate(`/film/${log.filmId}`) }}
                            >
                                View Film Page
                            </button>
                            <button className="btn btn-ghost" onClick={closeViewLog}>
                                Close
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
