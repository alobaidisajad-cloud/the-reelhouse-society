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
    const SEPIA = 'rgba(196,150,26,0.5)'
    const TICK = 12
    const INSET = 15
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
// Layout: Poster zone (flex 1.3) + Dossier Data Panel (flex 1) — "The Nitrate Dossier"
function CardContent({ film, log, posterDataUrl, username }: { film: Record<string, any>; log: Record<string, any>; posterDataUrl: string | null; username?: string | null }) {
    const MAX_REVIEW = 350
    const rawReview = String(log.review || 'Classified Analysis').trim()
    const cut = rawReview.lastIndexOf(' ', MAX_REVIEW)
    const reviewText = rawReview.length > MAX_REVIEW
        ? rawReview.slice(0, cut > 40 ? cut : MAX_REVIEW).trimEnd() + '…'
        : rawReview

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', padding: 15, boxSizing: 'border-box' }}>
            {/* Inset frame + corner ticks */}
            <div style={{ position: 'absolute', inset: 15, border: '1px solid rgba(196,150,26,0.25)', pointerEvents: 'none', zIndex: 2 }} />
            <CornerTicks />

            {/* 1. Top HUD */}
            <div style={{ textAlign: 'center', marginTop: 4, zIndex: 3 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.25em', color: 'var(--sepia)', opacity: 0.8 }}>
                    ● ARCHIVE DOSSIER ●
                </span>
            </div>

            <div style={{ flex: 0.8 }} />

            {/* 2. The Art (Poster) */}
            <div style={{ display: 'flex', justifyContent: 'center', zIndex: 3 }}>
                <div style={{ width: 230, height: 345, background: 'var(--soot)', position: 'relative', border: '1px solid rgba(196,150,26,0.15)', boxShadow: '0 6px 16px rgba(0,0,0,0.7)' }}>
                    {posterDataUrl ? (
                        <img src={posterDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} crossOrigin="anonymous" />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--fog)' }}>∅</span>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* 3. The Placard */}
            <div style={{ padding: '0 1.2rem', textAlign: 'center', zIndex: 3 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', lineHeight: 1.15, color: 'var(--parchment)', margin: '0 0 0.3rem 0', textShadow: '0 0 10px rgba(196,150,26,0.4)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {film.title}
                </h2>
                
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--flicker)', opacity: 0.85, marginBottom: '0.7rem' }}>
                    {film.release_date?.slice(0, 4)}
                </div>
                
                {(log?.rating ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.7rem' }}>
                        <ReelRating value={log.rating} size="md" />
                    </div>
                )}

                <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: '0.65rem', lineHeight: 1.5, color: 'var(--bone)', margin: 0, opacity: 0.95, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    "{reviewText}"
                </p>

                {username && (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.12em', color: 'var(--sepia)', marginTop: '0.5rem', opacity: 0.9 }}>
                        — @{username.toUpperCase()}
                    </div>
                )}
            </div>

            <div style={{ flex: 1 }} />

            {/* 4. Footer Lockup */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', marginBottom: '0.1rem', zIndex: 3 }}>
                <img src="/reelhouse-logo-transparent.png" alt="" style={{ height: 12, width: 'auto', opacity: 0.8 }} />
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.18em', color: 'rgba(196,150,26,0.5)' }}>
                    THE REELHOUSE SOCIETY
                </span>
            </div>
        </div>
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
                                background: 'var(--ink)',
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
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.22rem', color: 'var(--sepia)', marginBottom: '0.3rem', opacity: 0.8 }}>● ARCHIVE DOSSIER ●</div>
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
                            background: 'var(--ink)',
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
