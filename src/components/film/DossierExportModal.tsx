import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share2, X } from 'lucide-react'
import html2canvas from 'html2canvas'
import { tmdb } from '../../tmdb'
import { ReelRating, Portal } from '../UI'

// Fetch any image as a base64 data URL (bypasses html2canvas CORS restriction)
async function toDataUrl(url: string): Promise<string> {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
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
    const cardRef = useRef<HTMLDivElement>(null)
    const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)

    if (!log) return null

    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')

    // Pre-fetch poster as data URL so html2canvas can render it pixel-perfectly
    useEffect(() => {
        const posterUrl = tmdb.poster(film.poster_path, 'w780')
        if (!posterUrl) return
        toDataUrl(posterUrl)
            .then(setPosterDataUrl)
            .catch(() => setPosterDataUrl(null))
    }, [film.poster_path])

    const captureCard = async (): Promise<Blob> => {
        if (!cardRef.current) throw new Error('No card ref')
        const canvas = await html2canvas(cardRef.current, {
            useCORS: false,        // data URLs need no CORS
            allowTaint: false,
            backgroundColor: '#0F0D0A',
            scale: 3,              // 3× for retina-quality output
            logging: false,
            imageTimeout: 0,
        })
        return new Promise((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Blob failed')), 'image/png')
        )
    }

    const handleSave = async () => {
        setBusy(true)
        try {
            const blob = await captureCard()
            const filename = `reelhouse-${film.title.toLowerCase().replace(/\s+/g, '-')}.png`
            const file = new File([blob], filename, { type: 'image/png' })
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

            // On mobile: native share sheet → "Save Image" to Photos
            if (isMobile && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: `${film.title} — ReelHouse Dossier` })
            } else {
                // Desktop: direct download to Downloads folder
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = filename; a.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
            }
            setDone(true); setTimeout(() => setDone(false), 2500)
        } catch { /* cancelled */ } finally { setBusy(false) }
    }

    const handleShare = async () => {
        setBusy(true)
        try {
            const blob = await captureCard()
            const filename = `reelhouse-${film.title.toLowerCase().replace(/\s+/g, '-')}.png`
            const file = new File([blob], filename, { type: 'image/png' })
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `${film.title} — ReelHouse Dossier`,
                    text: `I just watched ${film.title} • ${log.rating}/5 reels ✦ The ReelHouse Society`,
                })
            } else {
                // Fallback: copy image to clipboard
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                setDone(true); setTimeout(() => setDone(false), 2500)
            }
        } catch { } finally { setBusy(false) }
    }

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(4,3,2,0.97)',
                        zIndex: 50000,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '1rem',
                    }}
                    onClick={onClose}
                >
                    {/* Close */}
                    <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', zIndex: 10, padding: '0.5rem' }}>
                        <X size={22} />
                    </button>

                    <div style={{ position: 'absolute', top: '3.5vh', textAlign: 'center', zIndex: 10 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.22rem', color: 'var(--blood-reel)', marginBottom: '0.3rem' }}>● CLASSIFIED DOSSIER</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)' }}>Tap the card to preview · Save or Share below</div>
                    </div>

                    {/* ─── THE CARD — this exact DOM element is what gets screenshotted ─── */}
                    <div
                        ref={cardRef}
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: 340,
                            aspectRatio: '9/16',
                            maxHeight: '70vh',
                            background: 'var(--soot)',
                            position: 'relative',
                            overflow: 'hidden',
                            border: '1px solid rgba(196,150,26,0.3)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 50px rgba(196,150,26,0.12)',
                            borderRadius: 4,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {/* Poster background — uses data URL so html2canvas renders it */}
                        {(posterDataUrl || film.poster_path) && (
                            <div style={{
                                position: 'absolute', inset: 0,
                                backgroundImage: `url(${posterDataUrl ?? tmdb.poster(film.poster_path, 'w780')})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center top',
                                filter: 'sepia(0.35) brightness(0.38) contrast(1.18)',
                            }} />
                        )}

                        {/* Gradient overlays */}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,6,4,0.6) 0%, rgba(8,6,4,0) 30%)' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,6,4,1) 30%, rgba(8,6,4,0.7) 55%, rgba(8,6,4,0) 75%)' }} />

                        {/* Content — pushed to the bottom third */}
                        <div style={{ position: 'absolute', bottom: '1.5rem', left: '1.25rem', right: '1.25rem', zIndex: 2 }}>
                            {/* Brand label */}
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>
                                REELHOUSE · DECLASSIFIED
                            </div>

                            {/* Gold divider */}
                            <div style={{ height: 1, background: 'linear-gradient(to right, var(--sepia), rgba(196,150,26,0.2))', marginBottom: '0.65rem' }} />

                            {/* Title */}
                            <h2 style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: 'clamp(1.4rem, 7vw, 2.2rem)',
                                color: 'var(--parchment)',
                                lineHeight: 1.05,
                                margin: '0 0 0.4rem 0',
                                textShadow: '0 2px 12px rgba(0,0,0,0.8)',
                            }}>
                                {film.title}
                            </h2>

                            {/* Year · Director */}
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.15em', color: 'var(--flicker)', marginBottom: '0.85rem', opacity: 0.85 }}>
                                {film.release_date?.slice(0, 4)}
                                {director && <> · DIR. {director.name?.toUpperCase()}</>}
                            </div>

                            {/* Reel rating */}
                            {(log.rating ?? 0) > 0 && (
                                <div style={{ marginBottom: '0.9rem' }}>
                                    <ReelRating value={log.rating} size="lg" />
                                </div>
                            )}

                            {/* Review quote */}
                            <p style={{
                                fontFamily: 'var(--font-body)',
                                fontStyle: 'italic',
                                fontSize: 'clamp(0.65rem, 2.5vw, 0.82rem)',
                                color: 'var(--bone)',
                                lineHeight: 1.65,
                                margin: 0,
                                display: '-webkit-box',
                                WebkitLineClamp: 6,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                opacity: 0.9,
                            }}>
                                "{log.review || 'Classified Analysis'}"
                            </p>
                        </div>

                        {/* ReelHouse watermark */}
                        <div style={{ position: 'absolute', bottom: '0.4rem', left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.18em', color: 'rgba(196,150,26,0.3)' }}>
                            THE REELHOUSE SOCIETY
                        </div>
                    </div>

                    {/* Actions */}
                    <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
                        <button
                            onClick={handleSave}
                            disabled={busy || !posterDataUrl}
                            style={{
                                flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                padding: '0.9rem 1rem',
                                background: (busy || !posterDataUrl) ? 'rgba(139,105,20,0.35)' : 'linear-gradient(135deg, #8B6914, #DAA520)',
                                border: 'none', borderRadius: 6, cursor: (busy || !posterDataUrl) ? 'not-allowed' : 'pointer',
                                fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em',
                                color: '#0E0B08', fontWeight: 700, transition: 'opacity 0.2s',
                            }}
                        >
                            <Download size={14} />
                            {busy ? 'RENDERING…' : !posterDataUrl ? 'LOADING…' : done ? 'SAVED ✦' : 'SAVE TO PHOTOS'}
                        </button>

                        {typeof navigator.share === 'function' && (
                            <button
                                onClick={handleShare}
                                disabled={busy || !posterDataUrl}
                                style={{
                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                    padding: '0.9rem',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(196,150,26,0.4)',
                                    borderRadius: 6, cursor: (busy || !posterDataUrl) ? 'not-allowed' : 'pointer',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#C4961A',
                                }}
                            >
                                <Share2 size={13} /> SHARE
                            </button>
                        )}
                    </div>

                    {!posterDataUrl && (
                        <div style={{ marginTop: '0.6rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', opacity: 0.7 }}>
                            LOADING POSTER…
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
