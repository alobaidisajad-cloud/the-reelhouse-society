import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share2, X } from 'lucide-react'
import { tmdb } from '../../tmdb'
import { Portal } from '../UI'

// ── Load Google Fonts into the document (so canvas can use them)
async function loadFonts() {
    if ((window as any).__reelFontsLoaded) return
    const fonts = [
        new FontFace('Rye', 'url(https://fonts.gstatic.com/s/rye/v15/r05XGLJT86YDFpTsXSqx.woff2)'),
        new FontFace('Special Elite', 'url(https://fonts.gstatic.com/s/specialelite/v18/XLYgIZbkc46tvqgoxjEither0VelW-rca2Yg.woff2)'),
        new FontFace('Bungee', 'url(https://fonts.gstatic.com/s/bungee/v15/N0bU2SZBIuF2K3.woff2)'),
    ]
    const loaded = await Promise.allSettled(fonts.map(f => f.load()))
    loaded.forEach(r => { if (r.status === 'fulfilled') document.fonts.add(r.value) })
    await document.fonts.ready
    ;(window as any).__reelFontsLoaded = true
}

// ── Fetch image as bitmap (bypasses CORS)
async function fetchBitmap(url: string): Promise<ImageBitmap | null> {
    try {
        const res = await fetch(url)
        const blob = await res.blob()
        return await createImageBitmap(blob)
    } catch { return null }
}

// ── Draw text wrapping
function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 99) {
    const words = text.split(' ')
    let line = ''
    let count = 0
    for (const word of words) {
        const test = line + word + ' '
        if (ctx.measureText(test).width > maxW && line) {
            if (count >= maxLines - 1) { ctx.fillText(line.trim() + '…', x, y + count * lineH); return count + 1 }
            ctx.fillText(line.trim(), x, y + count * lineH)
            line = word + ' '
            count++
        } else { line = test }
    }
    ctx.fillText(line.trim(), x, y + count * lineH)
    return count + 1
}

// ── Master card renderer
async function renderDossierCard(film: Record<string, any>, log: Record<string, any>): Promise<Blob> {
    await loadFonts()

    const W = 1080, H = 1920
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!

    // ── BG
    ctx.fillStyle = '#080604'
    ctx.fillRect(0, 0, W, H)

    // ── Poster
    const posterUrl = tmdb.poster(film.poster_path, 'w780')
    const bmp = posterUrl ? await fetchBitmap(posterUrl) : null
    if (bmp) {
        // Cover the top 65% of the card
        const coverH = H * 0.65
        const scale = Math.max(W / bmp.width, coverH / bmp.height)
        const dw = bmp.width * scale, dh = bmp.height * scale
        const dx = (W - dw) / 2, dy = 0
        ctx.drawImage(bmp, dx, dy, dw, dh)

        // Dark sepia colour-wash
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = '#2A1A00'
        ctx.globalAlpha = 0.65
        ctx.fillRect(0, 0, W, H * 0.65)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
    }

    // ── Top vignette
    const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.22)
    topGrad.addColorStop(0, 'rgba(8,6,4,0.75)')
    topGrad.addColorStop(1, 'rgba(8,6,4,0)')
    ctx.fillStyle = topGrad; ctx.fillRect(0, 0, W, H * 0.22)

    // ── Bottom gradient — smooth fade from transparent to dark
    const botGrad = ctx.createLinearGradient(0, H * 0.38, 0, H * 0.68)
    botGrad.addColorStop(0, 'rgba(8,6,4,0)')
    botGrad.addColorStop(0.5, 'rgba(8,6,4,0.88)')
    botGrad.addColorStop(1, 'rgba(8,6,4,1)')
    ctx.fillStyle = botGrad; ctx.fillRect(0, H * 0.38, W, H * 0.32)

    // ── Solid bottom half
    ctx.fillStyle = '#080604'; ctx.fillRect(0, H * 0.68, W, H * 0.32)

    // ── Subtle film grain texture (noise dots)
    ctx.save()
    ctx.globalAlpha = 0.04
    for (let i = 0; i < 8000; i++) {
        const gx = Math.random() * W, gy = Math.random() * H
        ctx.fillStyle = Math.random() > 0.5 ? '#FFF' : '#000'
        ctx.fillRect(gx, gy, 1.2, 1.2)
    }
    ctx.restore()

    // ── Golden side border lines
    ctx.strokeStyle = 'rgba(196,150,26,0.35)'
    ctx.lineWidth = 3
    ctx.strokeRect(36, 36, W - 72, H - 72)
    // Inner frame
    ctx.strokeStyle = 'rgba(196,150,26,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(48, 48, W - 96, H - 96)

    // ── Frame hole punches (film strip look) at very top and bottom
    const holeY = [20, H - 20]
    for (const hy of holeY) {
        for (let i = 0; i < 8; i++) {
            const hx = 100 + i * 120
            ctx.beginPath()
            ctx.roundRect(hx, hy - 12, 65, 25, 4)
            ctx.fillStyle = 'rgba(196,150,26,0.15)'
            ctx.fill()
        }
    }

    // ── CONTENT — positioned in the lower half
    const LEFT = 90
    const RIGHT = W - 90
    let curY = H * 0.635

    // Label: REELHOUSE · DECLASSIFIED
    ctx.font = '500 40px Bungee, sans-serif'
    ctx.letterSpacing = '6px'
    ctx.fillStyle = '#C4961A'
    ctx.globalAlpha = 0.9
    ctx.fillText('REELHOUSE  ·  DECLASSIFIED', LEFT, curY)
    ctx.globalAlpha = 1
    curY += 22

    // Gold rule
    const ruleGrad = ctx.createLinearGradient(LEFT, 0, RIGHT, 0)
    ruleGrad.addColorStop(0, 'rgba(196,150,26,0.8)')
    ruleGrad.addColorStop(0.5, 'rgba(248,240,192,0.9)')
    ruleGrad.addColorStop(1, 'rgba(196,150,26,0.3)')
    ctx.strokeStyle = ruleGrad; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(LEFT, curY); ctx.lineTo(RIGHT, curY); ctx.stroke()
    curY += 68

    // Film title
    const titleSize = film.title.length > 20 ? 118 : film.title.length > 14 ? 138 : 158
    ctx.font = `normal ${titleSize}px Rye, serif`
    ctx.letterSpacing = '-1px'
    ctx.fillStyle = '#EDE5D8'
    const titleLines = drawWrappedText(ctx, film.title, LEFT, curY, RIGHT - LEFT, titleSize * 1.1, 3)
    curY += titleLines * titleSize * 1.1 + 28

    // Year + Director
    const director = film.credits?.crew?.find((c: any) => c.job === 'Director')?.name
    const metaStr = [film.release_date?.slice(0, 4), director ? `DIR. ${director.toUpperCase()}` : null].filter(Boolean).join('   ·   ')
    ctx.font = '500 46px Bungee, sans-serif'
    ctx.letterSpacing = '4px'
    ctx.fillStyle = '#F8F0C0'
    ctx.globalAlpha = 0.82
    // Clip long director names
    const metaMaxW = RIGHT - LEFT
    let metaMeasure = ctx.measureText(metaStr).width
    let metaFontSize = 46
    while (metaMeasure > metaMaxW && metaFontSize > 28) {
        metaFontSize -= 2
        ctx.font = `500 ${metaFontSize}px Bungee, sans-serif`
        metaMeasure = ctx.measureText(metaStr).width
    }
    ctx.fillText(metaStr, LEFT, curY)
    ctx.globalAlpha = 1
    curY += 90

    // ── Reel rating icons (drawn as proper film reels)
    const rating = Math.round(log.rating ?? 0)
    const reelR = 52, reelGap = 130
    const reelStartX = LEFT + reelR
    const reelCY = curY + reelR
    for (let i = 0; i < 5; i++) {
        const cx = reelStartX + i * reelGap
        const filled = i < rating
        // ── Outer ring
        ctx.beginPath(); ctx.arc(cx, reelCY, reelR, 0, Math.PI * 2)
        ctx.strokeStyle = filled ? '#DAA520' : 'rgba(196,150,26,0.28)'
        ctx.lineWidth = filled ? 5 : 3
        ctx.stroke()
        // ── 3 spokes
        for (let s = 0; s < 3; s++) {
            const angle = (s / 3) * Math.PI * 2 - Math.PI / 2
            ctx.beginPath()
            ctx.moveTo(cx + Math.cos(angle) * 17, reelCY + Math.sin(angle) * 17)
            ctx.lineTo(cx + Math.cos(angle) * reelR * 0.78, reelCY + Math.sin(angle) * reelR * 0.78)
            ctx.strokeStyle = filled ? 'rgba(218,165,32,0.65)' : 'rgba(196,150,26,0.18)'
            ctx.lineWidth = 3.5; ctx.stroke()
        }
        // ── Inner ring + hub
        ctx.beginPath(); ctx.arc(cx, reelCY, 18, 0, Math.PI * 2)
        ctx.strokeStyle = filled ? 'rgba(218,165,32,0.5)' : 'rgba(196,150,26,0.15)'
        ctx.lineWidth = 2; ctx.stroke()
        ctx.beginPath(); ctx.arc(cx, reelCY, 9, 0, Math.PI * 2)
        ctx.fillStyle = filled ? '#C4961A' : 'rgba(196,150,26,0.12)'; ctx.fill()
    }
    curY = reelCY + reelR + 55

    // ── Review quote
    const reviewText = log.review ? `"${log.review}"` : '"Classified Analysis"'
    ctx.font = 'italic 52px "Special Elite", cursive'
    ctx.letterSpacing = '0.5px'
    ctx.fillStyle = '#C8B99A'
    ctx.globalAlpha = 0.88
    drawWrappedText(ctx, reviewText, LEFT, curY, RIGHT - LEFT, 70, 5)
    ctx.globalAlpha = 1

    // ── Bottom watermark
    ctx.font = '500 34px Bungee, sans-serif'
    ctx.letterSpacing = '8px'
    ctx.fillStyle = 'rgba(196,150,26,0.22)'
    const wm = 'THE REELHOUSE SOCIETY'
    const wmW = ctx.measureText(wm).width
    ctx.fillText(wm, (W - wmW) / 2, H - 58)

    return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

// ─────────────────────────────────────────────
export default function DossierExportModal({ film, log, onClose }: { film: Record<string, any>; log: Record<string, any> | null; onClose: () => void }) {
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewError, setPreviewError] = useState(false)

    if (!log) return null

    // Generate preview on mount
    useEffect(() => {
        let cancelled = false
        setPreviewUrl(null); setPreviewError(false)
        renderDossierCard(film, log)
            .then(blob => { if (!cancelled) setPreviewUrl(URL.createObjectURL(blob)) })
            .catch(() => { if (!cancelled) setPreviewError(true) })
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [film.id])

    const saveOrShare = async (shareFirst: boolean) => {
        setBusy(true); setDone(false)
        try {
            const blob = await renderDossierCard(film, log!)
            const filename = `reelhouse-${film.title.toLowerCase().replace(/\s+/g, '-')}.png`
            const file = new File([blob], filename, { type: 'image/png' })
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

            if ((shareFirst || isMobile) && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: `${film.title} — ReelHouse Dossier` })
                setDone(true); setTimeout(() => setDone(false), 2500)
                return
            }
            // Desktop / fallback download
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            setDone(true); setTimeout(() => setDone(false), 2500)
        } catch { /* user cancelled */ } finally { setBusy(false) }
    }

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(4,3,2,0.97)', zIndex: 50000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={onClose}
                >
                    {/* Close button */}
                    <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', zIndex: 10, padding: '0.5rem' }}>
                        <X size={22} />
                    </button>

                    <div style={{ position: 'absolute', top: '3.5vh', textAlign: 'center', zIndex: 10 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.22rem', color: 'var(--blood-reel)', marginBottom: '0.3rem' }}>● CLASSIFIED DOSSIER</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)' }}>Declassify and Distribute</div>
                    </div>

                    {/* Preview */}
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', maxWidth: 300, aspectRatio: '9/16', maxHeight: '68vh', margin: '0 auto', position: 'relative', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(196,150,26,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.95), 0 0 50px rgba(196,150,26,0.12)' }}
                    >
                        {previewUrl ? (
                            <img src={previewUrl} alt="Dossier card preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', background: '#080604', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                                {previewError ? (
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.15em', color: 'var(--blood-reel)', textAlign: 'center', padding: '1rem' }}>RENDER FAILED</div>
                                ) : (
                                    <>
                                        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--sepia)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>DEVELOPING…</div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 300, display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }}>
                        <button
                            onClick={() => saveOrShare(false)}
                            disabled={busy}
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.9rem 1rem', background: busy ? 'rgba(139,105,20,0.4)' : 'linear-gradient(135deg, #8B6914, #DAA520)', border: 'none', borderRadius: '6px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: '#0E0B08', fontWeight: 700 }}
                        >
                            <Download size={14} />
                            {busy ? 'RENDERING…' : done ? 'SAVED ✦' : 'SAVE TO PHOTOS'}
                        </button>
                        {typeof navigator.share === 'function' && (
                            <button
                                onClick={() => saveOrShare(true)}
                                disabled={busy}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(196,150,26,0.4)', borderRadius: '6px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#C4961A' }}
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
