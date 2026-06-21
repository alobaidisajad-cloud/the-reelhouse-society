import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share2, X } from 'lucide-react'
import html2canvas from 'html2canvas'
import { tmdb } from '../../tmdb'
import { ReelRating, Portal } from '../UI'
import { useAuthStore } from '../../store'

async function fetchPosterDataUrl(posterPath: string): Promise<string> {
    const originalUrl = tmdb.poster(posterPath, 'original')
    if (!originalUrl) throw new Error('No poster URL')
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`
    const res = await fetch(proxyUrl)
    if (!res.ok) throw new Error(`Proxy ${res.status}`)
    const blob = await res.blob()
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}

async function screenshotCard(el: HTMLDivElement): Promise<Blob> {
    // Ensure custom fonts are fully loaded before capture — otherwise html2canvas
    // renders a fallback system font into the exported image.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
        try { await document.fonts.ready } catch { /* fonts API unavailable — proceed */ }
    }
    const canvas = await html2canvas(el, {
        useCORS: false,
        allowTaint: false,
        backgroundColor: '#0F0D0A',
        scale: 3,
        logging: false,
        imageTimeout: 0,
        // Capture the full element regardless of viewport clipping
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
    })
    return new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Blob error')), 'image/png')
    )
}

// Decorative corner brackets marking the inset frame — fixed to the hidden
// render target's 380×676 canvas (the preview renders the same px values at
// a smaller scale, which is fine since only the hidden target is exported).
function CornerTicks() {
    const SEPIA = 'rgba(196,150,26,0.55)'
    const TICK = 16
    const INSET = 10
    const RIGHT = 380 - INSET
    const BOTTOM = 676 - INSET
    const corners = [
        { top: INSET, left: INSET },
        { top: INSET, left: RIGHT - TICK },
        { top: BOTTOM - TICK, left: INSET },
        { top: BOTTOM - TICK, left: RIGHT - TICK },
    ]
    return (
        <>
            {corners.map((pos, i) => (
                <div key={i} style={{ position: 'absolute', top: pos.top, left: pos.left, width: TICK, height: TICK }}>
                    <div style={{ position: 'absolute', top: 0, left: i % 2 === 0 ? 0 : 'auto', right: i % 2 === 1 ? 0 : 'auto', width: TICK, height: 1.5, background: SEPIA }} />
                    <div style={{ position: 'absolute', left: i % 2 === 0 ? 0 : 'auto', right: i % 2 === 1 ? 0 : 'auto', top: i < 2 ? 0 : 'auto', bottom: i >= 2 ? 0 : 'auto', width: 1.5, height: TICK, background: SEPIA }} />
                </div>
            ))}
        </>
    )
}

// Shared card content — renders inside both the visible preview and the hidden render target
function CardContent({ film, log, posterDataUrl, username }: { film: Record<string, any>; log: Record<string, any>; posterDataUrl: string | null; username?: string | null }) {
    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')
    // Graceful review truncation — cut on a word boundary with an ellipsis, never mid-word.
    const MAX_REVIEW = 300
    const rawReview = String(log.review || 'Classified Analysis').trim()
    const cut = rawReview.lastIndexOf(' ', MAX_REVIEW)
    const reviewText = rawReview.length > MAX_REVIEW
        ? rawReview.slice(0, cut > 40 ? cut : MAX_REVIEW).trimEnd() + '…'
        : rawReview
    const isAbandoned = log.status === 'abandoned'
    return (
        <>
            {/* Poster — lighter base filter since the gradients below now carry the darkening */}
            {posterDataUrl && (
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${posterDataUrl})`, backgroundSize: 'cover', backgroundPosition: 'center top', filter: 'sepia(0.28) brightness(0.66) contrast(1.1)' }} />
            )}
            {!posterDataUrl && (
                <div style={{ position: 'absolute', inset: 0, background: '#0F0D0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(196,150,26,0.3)', borderTopColor: '#C4961A', animation: 'spin 0.8s linear infinite' }} />
                </div>
            )}

            {/* Edge feather — the poster fades into the card's own background on three sides
                instead of sitting as a hard rectangle */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, var(--soot) 0%, transparent 12%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to left, var(--soot) 0%, transparent 12%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, var(--soot) 0%, transparent 14%)' }} />

            {/* Bottom vignette — gradual 5-stop fade so text legibility never depends on the poster */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--soot) 0%, rgba(14,13,10,0.85) 35%, rgba(14,13,10,0.45) 55%, rgba(14,13,10,0.12) 75%, transparent 100%)' }} />

            {/* Inset frame + corner ticks — the "mounted print" border */}
            <div style={{ position: 'absolute', inset: 10, border: '1px solid rgba(196,150,26,0.25)', pointerEvents: 'none' }} />
            <CornerTicks />

            {/* Content */}
            <div style={{ position: 'absolute', bottom: '1.5rem', left: '1.25rem', right: '1.25rem', zIndex: 2 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.35rem' }}>
                    CLASSIFIED DOSSIER
                </div>
                <div style={{ height: 1, background: 'linear-gradient(to right, var(--sepia), rgba(196,150,26,0.15))', marginBottom: '0.6rem' }} />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 6.5vw, 2.1rem)', color: 'var(--parchment)', lineHeight: 1.05, margin: '0 0 0.35rem 0', textShadow: '0 2px 12px rgba(0,0,0,0.9)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {film.title}
                </h2>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em', color: 'var(--flicker)', marginBottom: '0.8rem', opacity: 0.85 }}>
                    {film.release_date?.slice(0, 4)}{director && <> · DIR. {director.name?.toUpperCase()}</>}
                </div>
                {(log.rating ?? 0) > 0 && (
                    <div style={{ marginBottom: '0.8rem' }}>
                        <ReelRating value={log.rating} size="lg" />
                    </div>
                )}
                {isAbandoned && (
                    <div style={{ display: 'inline-block', fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.15em', color: 'var(--parchment)', background: 'rgba(196,150,26,0.08)', border: '1px solid rgba(196,150,26,0.4)', borderRadius: 2, padding: '0.2rem 0.5rem', marginBottom: '0.6rem' }}>
                        ✕ ABANDONED{log.abandonedReason ? ` — ${String(log.abandonedReason).toUpperCase()}` : ''}
                    </div>
                )}
                <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 'clamp(0.6rem, 2.4vw, 0.78rem)', color: 'var(--bone)', lineHeight: 1.65, margin: 0, display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.92 }}>
                    "{reviewText}"
                </p>
                {username && (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginTop: '0.55rem', opacity: 0.95 }}>
                        — @{username.toUpperCase()}
                    </div>
                )}
            </div>

            {/* Footer brand lockup — same seal + wordmark used in the navbar and footer */}
            <div style={{ position: 'absolute', bottom: '0.4rem', left: 0, right: 0, zIndex: 2 }}>
                <div style={{ width: 110, height: 1, margin: '0 auto 0.4rem', background: 'linear-gradient(to right, transparent, var(--sepia), transparent)' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <img src="/reelhouse-logo-transparent.png" alt="" style={{ height: 14, width: 'auto', opacity: 0.85 }} />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.2em', color: 'rgba(196,150,26,0.55)' }}>
                        THE REELHOUSE SOCIETY
                    </span>
                </div>
            </div>
        </>
    )
}

export default function DossierExportModal({
    film,
    log,
    onClose,
}: {
    film: Record<string, any>
    log: Record<string, any> | null
    onClose: () => void
}) {
    // ─── The HIDDEN render target: fixed 380×(380*16/9)px — no maxHeight clipping
    const renderRef = useRef<HTMLDivElement>(null)
    const cachedBlob = useRef<Blob | null>(null)
    const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null)
    const [ready, setReady] = useState(false)
    const [saving, setSaving] = useState(false)
    const username = useAuthStore(s => s.user?.username)

    const preGenerate = useCallback(async () => {
        try {
            const dataUrl = await fetchPosterDataUrl(film.poster_path)
            setPosterDataUrl(dataUrl)
            // Wait for React to re-render the hidden card with the poster
            await new Promise(r => setTimeout(r, 180))
            if (!renderRef.current) return
            cachedBlob.current = await screenshotCard(renderRef.current)
            setReady(true)
        } catch (err) {
            console.error('[Dossier] pre-gen failed', err)
            setReady(true) // allow save attempt even if poster failed
        }
    }, [film.poster_path])

    useEffect(() => { preGenerate() }, [preGenerate])

    const save = async (shareMode: boolean) => {
        setSaving(true)
        try {
            let blob = cachedBlob.current
            if (!blob && renderRef.current) blob = await screenshotCard(renderRef.current)
            if (!blob) return
            const filename = `reelhouse-${film.title.toLowerCase().replace(/\s+/g, '-')}.png`
            const file = new File([blob], filename, { type: 'image/png' })
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
            if ((shareMode || isMobile) && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: `${film.title} — ReelHouse Dossier` })
            } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = filename; a.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
            }
        } catch { } finally { setSaving(false) }
    }

    // Fixed render dimensions (380px wide, full 9:16)
    const RENDER_W = 380
    const RENDER_H = Math.round(RENDER_W * 16 / 9) // 676px

    // Guard placed AFTER all hooks (Rules of Hooks) — moving it above the
    // useCallback/useEffect above caused a conditional-hook crash when `log` changed.
    if (!log) return null

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(4,3,2,0.97)', zIndex: 50000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={onClose}
                >
                    {/* ─── HIDDEN render target (full 9:16, off-screen) — this is what gets screenshotted ─── */}
                    <div
                        ref={renderRef}
                        aria-hidden="true"
                        style={{
                            position: 'fixed',
                            top: 0, left: '-9999px',      // completely off-screen
                            width: RENDER_W, height: RENDER_H,
                            background: 'var(--soot)',
                            overflow: 'hidden',
                            borderRadius: 4,
                            display: 'flex', flexDirection: 'column',
                            pointerEvents: 'none', zIndex: -1,
                        }}
                    >
                        <CardContent film={film} log={log} posterDataUrl={posterDataUrl} username={username} />
                    </div>

                    {/* Close */}
                    <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', zIndex: 10, padding: '0.5rem' }}>
                        <X size={22} />
                    </button>

                    <div style={{ position: 'absolute', top: '3.5vh', textAlign: 'center', zIndex: 10 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.22rem', color: 'var(--blood-reel)', marginBottom: '0.3rem' }}>● CLASSIFIED DOSSIER</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)' }}>
                            {ready ? 'Ready to save or share' : 'Developing…'}
                        </div>
                    </div>

                    {/* ─── VISIBLE preview card (display only, clipped by maxHeight) ─── */}
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 300,
                            aspectRatio: '9/16',
                            maxHeight: '68vh',
                            background: 'var(--soot)',
                            position: 'relative', overflow: 'hidden',
                            border: '1px solid rgba(196,150,26,0.3)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 50px rgba(196,150,26,0.12)',
                            borderRadius: 4,
                            display: 'flex', flexDirection: 'column',
                        }}
                    >
                        <CardContent film={film} log={log} posterDataUrl={posterDataUrl} username={username} />
                    </div>

                    {/* Actions */}
                    <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 300, display: 'flex', gap: '0.6rem', marginTop: '1.1rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
                        <button
                            onClick={() => save(false)}
                            disabled={saving}
                            style={{
                                flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                padding: '0.9rem 1rem',
                                background: saving ? 'rgba(139,105,20,0.4)' : 'linear-gradient(135deg, #8B6914, #DAA520)',
                                border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
                                fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: '#0E0B08', fontWeight: 700,
                            }}
                        >
                            <Download size={14} />
                            {saving ? 'SAVING…' : !ready
                                ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(14,11,8,0.4)', borderTopColor: '#0E0B08', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                                    DEVELOPING…
                                  </span>
                                : 'SAVE TO PHOTOS'}
                        </button>

                        {typeof navigator.share === 'function' && (
                            <button
                                onClick={() => save(true)}
                                disabled={saving}
                                style={{
                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                    padding: '0.9rem', background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(196,150,26,0.4)', borderRadius: 6,
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#C4961A',
                                }}
                            >
                                <Share2 size={13} /> SHARE
                            </button>
                        )}
                    </div>
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
