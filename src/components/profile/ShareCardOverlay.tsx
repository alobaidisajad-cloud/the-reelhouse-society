import { useRef, useState } from 'react'
import { X, Download, Share2 } from 'lucide-react'
import Buster from '../Buster'
import { ReelRating, RadarChart, Portal } from '../UI'
import { tmdb } from '../../tmdb'
import reelToast from '../../utils/reelToast'

/** Adaptive Share Card — breathtaking for both short captions and long essays. */
export function ShareCardOverlay({ log, onClose, user }: { log: any; onClose: () => void; user: any }) {
    const cardRef = useRef<HTMLDivElement>(null)
    const [downloading, setDownloading] = useState(false)

    if (!log) return null

    // Strip HTML tags from review
    const rawReview = (log.review || '').replace(/<[^>]+>/g, '').trim()
    const isLong = rawReview.length > 280
    const isVeryLong = rawReview.length > 600
    const hasReview = rawReview.length > 0
    const hasAutopsy = log.isAutopsied && log.autopsy

    // Download card as image
    const handleDownload = async () => {
        if (!cardRef.current) return
        setDownloading(true)
        try {
            const html2canvas = (await import('html2canvas')).default
            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#0A0703',
                scale: 3, // High-res for social media
                useCORS: true,
                logging: false,
            })
            const link = document.createElement('a')
            link.download = `reelhouse-${log.title?.replace(/\s+/g, '-').toLowerCase() || 'log'}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
            reelToast.success('Card downloaded.')
        } catch {
            reelToast.error('Download failed. Try a screenshot instead.')
        } finally {
            setDownloading(false)
        }
    }

    // Native share (Web Share API)
    const handleShare = async () => {
        if (!cardRef.current) return
        try {
            const html2canvas = (await import('html2canvas')).default
            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: '#0A0703',
                scale: 3,
                useCORS: true,
                logging: false,
            })
            canvas.toBlob(async (blob) => {
                if (!blob) return
                const file = new File([blob], 'reelhouse-log.png', { type: 'image/png' })
                if (navigator.share && navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], title: `${log.title} — ReelHouse Log` })
                } else {
                    // Fallback: download
                    handleDownload()
                }
            })
        } catch {
            handleDownload()
        }
    }

    return (
        <Portal>
            <div style={{
                position: 'fixed', inset: 0, zIndex: 100005,
                background: 'rgba(5, 3, 1, 0.97)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '1.5rem',
                overflow: 'auto',
            }}>
                {/* Close */}
                <button onClick={onClose} className="btn btn-ghost" style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 100006,
                    width: 40, height: 40, padding: 0, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <X size={16} style={{ margin: 'auto' }} />
                </button>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="btn btn-primary"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.65rem 1.5rem', fontSize: '0.6rem', letterSpacing: '0.2em',
                        }}
                    >
                        <Download size={13} />
                        {downloading ? 'RENDERING...' : 'DOWNLOAD CARD'}
                    </button>
                    <button
                        onClick={handleShare}
                        className="btn btn-ghost"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.65rem 1.5rem', fontSize: '0.6rem', letterSpacing: '0.2em',
                            borderColor: 'rgba(139,105,20,0.4)',
                        }}
                    >
                        <Share2 size={13} />
                        SHARE
                    </button>
                </div>

                {/* ═══════════════════════════════════════════════
                    THE CARD — Adaptive layout based on review length
                ═══════════════════════════════════════════════ */}
                <div
                    ref={cardRef}
                    style={{
                        width: '100%',
                        maxWidth: isVeryLong ? 420 : 360,
                        background: '#0A0703',
                        position: 'relative',
                        overflow: 'hidden',
                        border: '1px solid rgba(139,105,20,0.4)',
                        boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 0 1px rgba(139,105,20,0.3)',
                    }}
                >
                    {/* ── Blurred atmospheric backdrop ── */}
                    {(log.altPoster || log.poster) && (
                        <div style={{
                            position: 'absolute', inset: -60,
                            backgroundImage: `url(${tmdb.poster(log.altPoster || log.poster, 'w342')})`,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                            filter: 'blur(40px) sepia(0.7) brightness(0.15) saturate(1.2)',
                            zIndex: 0,
                        }} />
                    )}

                    {/* Film grain overlay */}
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
                        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
                        mixBlendMode: 'multiply',
                    }} />

                    <div style={{ position: 'relative', zIndex: 2, padding: isLong ? '2rem 1.75rem' : '2.5rem 2rem' }}>

                        {/* ── TOP: Username + Branding ── */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: isLong ? '1.5rem' : '2rem',
                            paddingBottom: '0.75rem',
                            borderBottom: '1px solid rgba(139,105,20,0.15)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'rgba(139,105,20,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '1px solid rgba(139,105,20,0.3)',
                                }}>
                                    <Buster size={18} mood="smiling" />
                                </div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.18em', color: 'var(--parchment)' }}>
                                    @{user.username}
                                </div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.3em', color: 'var(--sepia)', opacity: 0.7 }}>
                                REELHOUSE
                            </div>
                        </div>

                        {/* ═══ ADAPTIVE BODY ═══ */}
                        {isLong ? (
                            /* ── EDITORIAL LAYOUT: Long reviews ── */
                            <div>
                                {/* Compact film header */}
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'flex-start' }}>
                                    {(log.altPoster || log.poster) && (
                                        <img
                                            src={tmdb.poster(log.altPoster || log.poster, 'w342')}
                                            alt={log.title}
                                            style={{
                                                width: 72, height: 108, objectFit: 'cover',
                                                borderRadius: '3px', flexShrink: 0,
                                                border: '1px solid rgba(139,105,20,0.25)',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                            }}
                                        />
                                    )}
                                    <div style={{ flex: 1, paddingTop: '0.15rem' }}>
                                        <h2 style={{
                                            fontFamily: 'var(--font-display)', fontSize: '1.35rem',
                                            color: 'var(--parchment)', lineHeight: 1.15, margin: 0,
                                            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                                        }}>
                                            {log.title}
                                        </h2>
                                        <div style={{
                                            fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                                            letterSpacing: '0.2em', color: 'var(--fog)', marginTop: '0.35rem',
                                        }}>
                                            {log.year}
                                        </div>
                                        <div style={{ marginTop: '0.5rem' }}>
                                            <ReelRating value={log.rating} size="sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* Pull quote if available */}
                                {log.pullQuote && (
                                    <div style={{
                                        padding: '0.85rem 1rem', marginBottom: '1rem',
                                        borderLeft: '2px solid var(--sepia)',
                                        background: 'rgba(139,105,20,0.06)',
                                    }}>
                                        <div style={{
                                            fontFamily: 'var(--font-display)', fontStyle: 'italic',
                                            fontSize: '0.95rem', color: 'var(--sepia)', lineHeight: 1.5,
                                        }}>
                                            « {log.pullQuote} »
                                        </div>
                                    </div>
                                )}

                                {/* Full review text — magazine column style */}
                                <div style={{
                                    fontFamily: 'var(--font-body)',
                                    fontSize: isVeryLong ? '0.72rem' : '0.78rem',
                                    color: 'var(--bone)',
                                    lineHeight: 1.75,
                                    whiteSpace: 'pre-wrap',
                                    columnCount: isVeryLong ? 2 : 1,
                                    columnGap: '1.25rem',
                                    columnRule: '1px solid rgba(139,105,20,0.1)',
                                }}>
                                    {log.dropCap ? (
                                        <>
                                            <span style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: '2.2rem', lineHeight: 1,
                                                float: 'left', marginRight: '0.35rem', marginTop: '0.1rem',
                                                color: 'var(--sepia)',
                                                textShadow: '0 2px 6px rgba(139,105,20,0.2)',
                                            }}>
                                                {rawReview.charAt(0)}
                                            </span>
                                            {rawReview.slice(1)}
                                        </>
                                    ) : (
                                        rawReview
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* ── CINEMATIC LAYOUT: Short reviews ── */
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                {/* Large poster */}
                                {(log.altPoster || log.poster) && (
                                    <img
                                        src={tmdb.poster(log.altPoster || log.poster, 'w342')}
                                        alt={log.title}
                                        style={{
                                            width: '65%', aspectRatio: '2/3', objectFit: 'cover',
                                            borderRadius: '4px',
                                            filter: 'sepia(0.15) contrast(1.1)',
                                            border: '1px solid rgba(139,105,20,0.2)',
                                            boxShadow: '0 20px 50px rgba(0,0,0,0.7), 0 0 30px rgba(139,105,20,0.06)',
                                            marginBottom: '1.5rem',
                                        }}
                                    />
                                )}

                                {/* Film title */}
                                <h2 style={{
                                    fontFamily: 'var(--font-display)', fontSize: '1.7rem',
                                    color: 'var(--parchment)', lineHeight: 1.1, margin: 0,
                                    marginBottom: '0.5rem',
                                    textShadow: '0 4px 12px rgba(0,0,0,0.8)',
                                }}>
                                    {log.title}
                                </h2>

                                {/* Year */}
                                <div style={{
                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                                    letterSpacing: '0.3em', color: 'var(--fog)', marginBottom: '0.75rem',
                                }}>
                                    {log.year}
                                </div>

                                {/* Rating */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <ReelRating value={log.rating} size="md" />
                                    {log.watchedWith && (
                                        <span style={{
                                            fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                                            letterSpacing: '0.12em', color: 'var(--fog)',
                                            borderLeft: '1px solid var(--ash)', paddingLeft: '0.75rem',
                                        }}>
                                            ♡ W/ {log.watchedWith.toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                {/* Short review */}
                                {hasReview && (
                                    <p style={{
                                        fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                                        color: 'var(--bone)', fontStyle: 'italic',
                                        lineHeight: 1.7, margin: 0, padding: '0 0.5rem',
                                    }}>
                                        "{rawReview}"
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Autopsy radar (if available) */}
                        {hasAutopsy && (
                            <div style={{
                                marginTop: '1.25rem', display: 'flex', justifyContent: 'center',
                                transform: isLong ? 'scale(0.7)' : 'scale(0.8)',
                                marginBottom: isLong ? '-1rem' : '-0.5rem',
                            }}>
                                <RadarChart autopsy={log.autopsy} size={140} />
                            </div>
                        )}

                        {/* ── BOTTOM: Watermark ── */}
                        <div style={{
                            marginTop: '1.5rem', paddingTop: '0.75rem',
                            borderTop: '1px solid rgba(139,105,20,0.15)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div style={{
                                fontFamily: 'var(--font-display)', fontSize: '1.1rem',
                                color: 'var(--sepia)', opacity: 0.8, letterSpacing: '0.05em',
                            }}>
                                REELHOUSE
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.38rem',
                                letterSpacing: '0.2em', color: 'var(--fog)', opacity: 0.6,
                            }}>
                                THE SOCIETY
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    )
}
