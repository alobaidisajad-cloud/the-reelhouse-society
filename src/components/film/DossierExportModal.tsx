import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share2, X } from 'lucide-react'
import { tmdb } from '../../tmdb'
import { Portal } from '../UI'

// ── Draw the dossier card directly on a canvas (bypasses all CORS/html2canvas issues)
async function drawDossierCard(film: Record<string, any>, log: Record<string, any>): Promise<Blob> {
    const W = 1080
    const H = 1920
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // ── 1. Background
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // ── 2. Poster image (loaded via fetch → no CORS block)
    const posterUrl = tmdb.poster(film.poster_path, 'w780')
    if (posterUrl) {
        try {
            const res = await fetch(posterUrl)
            const blob = await res.blob()
            const bmp = await createImageBitmap(blob)
            // Draw sepia+dark poster scaled to fill canvas
            ctx.save()
            ctx.globalAlpha = 1
            ctx.drawImage(bmp, 0, 0, W, H * 0.72)
            // Sepia overlay
            ctx.globalAlpha = 0.55
            ctx.fillStyle = '#3D2800'
            ctx.fillRect(0, 0, W, H * 0.72)
            ctx.restore()
        } catch { /* poster load failed, fallback to plain bg */ }
    }

    // ── 3. Gradient overlays
    const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.15)
    topGrad.addColorStop(0, 'rgba(10,7,3,0.7)')
    topGrad.addColorStop(1, 'rgba(10,7,3,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, W, H * 0.15)

    const botGrad = ctx.createLinearGradient(0, H * 0.42, 0, H)
    botGrad.addColorStop(0, 'rgba(10,7,3,0)')
    botGrad.addColorStop(0.3, 'rgba(10,7,3,0.92)')
    botGrad.addColorStop(1, 'rgba(10,7,3,1)')
    ctx.fillStyle = botGrad
    ctx.fillRect(0, H * 0.42, W, H * 0.58)

    // ── 4. Brand label
    const MARGIN = 90
    const startY = H * 0.62
    ctx.font = '500 44px "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '12px'
    ctx.fillStyle = '#8B6914'
    ctx.fillText('REELHOUSE  ·  DECLASSIFIED', MARGIN, startY)

    // Divider line
    ctx.strokeStyle = 'rgba(139,105,20,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(MARGIN, startY + 28)
    ctx.lineTo(W - MARGIN, startY + 28)
    ctx.stroke()

    // ── 5. Film title
    ctx.font = `bold ${film.title.length > 18 ? 110 : 140}px Georgia, "Times New Roman", serif`
    ctx.letterSpacing = '-2px'
    ctx.fillStyle = '#F0E8D0'
    wrapText(ctx, film.title, MARGIN, startY + 110, W - MARGIN * 2, film.title.length > 18 ? 120 : 150)

    // ── 6. Year + Director
    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')?.name
    const metaLine = [film.release_date?.slice(0, 4), director ? `DIR. ${director.toUpperCase()}` : null].filter(Boolean).join('  ·  ')
    const titleLines = Math.ceil(film.title.length / (film.title.length > 18 ? 14 : 18))
    const metaY = startY + 110 + titleLines * (film.title.length > 18 ? 120 : 150) + 20
    ctx.font = '500 44px "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '8px'
    ctx.fillStyle = '#F2E8A0'
    ctx.globalAlpha = 0.85
    ctx.fillText(metaLine, MARGIN, metaY)
    ctx.globalAlpha = 1

    // ── 7. Rating reels (drawn as circles)
    const rating = Math.round(log.rating ?? 0)
    const reelY = metaY + 80
    for (let i = 0; i < 5; i++) {
        const cx = MARGIN + i * 120 + 50
        const cy = reelY + 50
        const r = 46
        // Outer ring
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = i < rating ? '#DAA520' : 'rgba(139,105,20,0.3)'
        ctx.lineWidth = i < rating ? 5 : 3
        ctx.stroke()
        // Inner spokes (film reel style)
        for (let s = 0; s < 6; s++) {
            const angle = (s / 6) * Math.PI * 2
            ctx.beginPath()
            ctx.moveTo(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 16)
            ctx.lineTo(cx + Math.cos(angle) * r * 0.75, cy + Math.sin(angle) * r * 0.75)
            ctx.strokeStyle = i < rating ? 'rgba(218,165,32,0.5)' : 'rgba(139,105,20,0.15)'
            ctx.lineWidth = 2
            ctx.stroke()
        }
        // Center hole
        ctx.beginPath()
        ctx.arc(cx, cy, 14, 0, Math.PI * 2)
        ctx.fillStyle = i < rating ? '#8B6914' : 'rgba(139,105,20,0.15)'
        ctx.fill()
    }

    // ── 8. Review text
    if (log.review) {
        ctx.font = 'italic 54px Georgia, serif'
        ctx.letterSpacing = '0px'
        ctx.fillStyle = '#C8BFA0'
        ctx.globalAlpha = 0.9
        wrapText(ctx, `"${log.review}"`, MARGIN, reelY + 170, W - MARGIN * 2, 70, 6)
        ctx.globalAlpha = 1
    }

    // ── 9. ReelHouse watermark at bottom
    ctx.font = '500 38px "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '10px'
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillText('REELHOUSE ARCHIVAL NETWORK', MARGIN, H - 60)

    return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

// Text wrapping helper
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 99) {
    const words = text.split(' ')
    let line = ''
    let lineCount = 0
    for (const word of words) {
        const test = line + word + ' '
        if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line.trim(), x, y + lineCount * lineH)
            line = word + ' '
            lineCount++
            if (lineCount >= maxLines) { ctx.fillText(line.trim() + '…', x, y + lineCount * lineH); return }
        } else {
            line = test
        }
    }
    ctx.fillText(line.trim(), x, y + lineCount * lineH)
}

export default function DossierExportModal({ film, log, onClose }: { film: Record<string, any>; log: Record<string, any> | null; onClose: () => void }) {
    const previewRef = useRef<HTMLCanvasElement>(null)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    if (!log) return null

    // Generate a low-res preview on mount
    useEffect(() => {
        let cancelled = false
        drawDossierCard(film, log).then(blob => {
            if (cancelled) return
            setPreviewUrl(URL.createObjectURL(blob))
        }).catch(() => {})
        return () => { cancelled = true }
    }, [film.id, log.id])

    const generate = () => drawDossierCard(film, log)

    const handleSave = async () => {
        setBusy(true)
        try {
            const blob = await generate()
            const filename = `reelhouse-${film.title.toLowerCase().replace(/\s+/g, '-')}.png`
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
            if (isMobile && navigator.canShare) {
                const file = new File([blob], filename, { type: 'image/png' })
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: film.title })
                    setDone(true); setTimeout(() => setDone(false), 2500)
                    return
                }
            }
            // Desktop or fallback
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.download = filename; a.href = url; a.click()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            setDone(true); setTimeout(() => setDone(false), 2500)
        } catch { } finally { setBusy(false) }
    }

    const handleShare = async () => {
        setBusy(true)
        try {
            const blob = await generate()
            const filename = `reelhouse-${film.title.toLowerCase().replace(/\s+/g, '-')}.png`
            const file = new File([blob], filename, { type: 'image/png' })
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `${film.title} — ReelHouse Dossier`,
                    text: `I just watched ${film.title} • ${log.rating}/5 reels ✦ ReelHouse Society`,
                })
            } else {
                // Desktop fallback: copy to clipboard
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
                    style={{ position: 'fixed', inset: 0, background: 'rgba(6,4,2,0.97)', zIndex: 50000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={onClose}
                >
                    {/* Close */}
                    <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', padding: '0.5rem', zIndex: 10 }}>
                        <X size={22} />
                    </button>

                    <div style={{ position: 'absolute', top: '3.5vh', textAlign: 'center', zIndex: 10 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.2rem', color: 'var(--blood-reel)', marginBottom: '0.3rem' }}>● CLASSIFIED DOSSIER</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)' }}>Declassify and Distribute</div>
                    </div>

                    {/* Preview */}
                    <div style={{ width: '100%', maxWidth: 320, aspectRatio: '9/16', maxHeight: '70vh', margin: '0 auto', position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(139,105,20,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(139,105,20,0.1)' }} onClick={e => e.stopPropagation()}>
                        {previewUrl ? (
                            <img src={previewUrl} alt="Dossier preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', background: '#0F0D0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', animation: 'pulse 1.5s ease-in-out infinite' }}>DEVELOPING…</div>
                            </div>
                        )}
                    </div>

                    {/* Buttons */}
                    <div style={{ width: '100%', maxWidth: 320, display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={handleSave}
                            disabled={busy}
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.9rem', background: busy ? 'rgba(139,105,20,0.5)' : 'linear-gradient(135deg, #8B6914, #DAA520)', border: 'none', borderRadius: '6px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.15em', color: '#0E0B08', fontWeight: 700, transition: 'opacity 0.2s' }}
                        >
                            <Download size={15} />
                            {busy ? 'GENERATING…' : done ? 'SAVED ✓' : 'SAVE TO PHOTOS'}
                        </button>
                        {typeof navigator.share === 'function' && (
                            <button
                                onClick={handleShare}
                                disabled={busy}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,105,20,0.4)', borderRadius: '6px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.58rem', letterSpacing: '0.15em', color: '#E8DFC8' }}
                            >
                                <Share2 size={14} /> SHARE
                            </button>
                        )}
                    </div>
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
