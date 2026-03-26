import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Copy, Share2, Check } from 'lucide-react'
import { tmdb } from '../../tmdb'

interface ShareCardData {
    filmTitle: string
    filmYear?: string
    posterPath: string | null
    rating: number
    review?: string
    username: string
    status: 'watched' | 'rewatched' | 'abandoned'
}

interface ShareCardModalProps {
    data: ShareCardData
    onClose: () => void
}

import { ReelRating } from '../UI'

export default function ShareCardModal({ data, onClose }: ShareCardModalProps) {
    const cardRef = useRef<HTMLDivElement>(null)
    const [copying, setCopying] = useState(false)
    const [downloaded, setDownloaded] = useState(false)

    const posterUrl = data.posterPath
        ? tmdb.poster(data.posterPath, 'w500')
        : null

    const statusLabel: Record<string, string> = {
        watched: 'LOGGED', rewatched: 'REWATCHED', abandoned: 'ABANDONED'
    }

    const truncatedReview = data.review && data.review.length > 120
        ? data.review.substring(0, 117) + '...'
        : data.review

    // ── Canvas-based card export ──
    const renderToCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
        const canvas = document.createElement('canvas')
        const W = 1080, H = 1350 // Instagram portrait ratio
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')!

        // Background
        ctx.fillStyle = '#0E0B08'
        ctx.fillRect(0, 0, W, H)

        // Film grain overlay (subtle noise)
        const grainData = ctx.createImageData(W, H)
        for (let i = 0; i < grainData.data.length; i += 4) {
            const noise = Math.random() * 15
            grainData.data[i] = noise
            grainData.data[i + 1] = noise
            grainData.data[i + 2] = noise
            grainData.data[i + 3] = 8
        }
        ctx.putImageData(grainData, 0, 0)

        // Gold border
        ctx.strokeStyle = '#8B6914'
        ctx.lineWidth = 2
        ctx.strokeRect(30, 30, W - 60, H - 60)

        // Corner marks
        const cmLen = 20
        ctx.strokeStyle = 'rgba(139,105,20,0.5)'
        ctx.lineWidth = 1
        // Top-left
        ctx.beginPath(); ctx.moveTo(50, 70); ctx.lineTo(50, 50); ctx.lineTo(70, 50); ctx.stroke()
        // Top-right
        ctx.beginPath(); ctx.moveTo(W - 50, 70); ctx.lineTo(W - 50, 50); ctx.lineTo(W - 70, 50); ctx.stroke()
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(50, H - 70); ctx.lineTo(50, H - 50); ctx.lineTo(70, H - 50); ctx.stroke()
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(W - 50, H - 70); ctx.lineTo(W - 50, H - 50); ctx.lineTo(W - 70, H - 50); ctx.stroke()

        // Status badge
        ctx.fillStyle = '#DAA520'
        ctx.font = '600 14px "Courier Prime", monospace'
        ctx.letterSpacing = '6px'
        ctx.textAlign = 'center'
        ctx.fillText(`✦  ${statusLabel[data.status]}  ✦`, W / 2, 80)

        // Poster (draw as image)
        if (posterUrl) {
            try {
                const img = await loadImage(posterUrl)
                const posterW = 420, posterH = 630
                const posterX = (W - posterW) / 2
                const posterY = 110

                // Poster shadow
                ctx.shadowColor = 'rgba(0,0,0,0.6)'
                ctx.shadowBlur = 40
                ctx.shadowOffsetY = 10
                ctx.drawImage(img, posterX, posterY, posterW, posterH)
                ctx.shadowColor = 'transparent'
                ctx.shadowBlur = 0
                ctx.shadowOffsetY = 0

                // Poster border
                ctx.strokeStyle = 'rgba(139,105,20,0.3)'
                ctx.lineWidth = 1
                ctx.strokeRect(posterX, posterY, posterW, posterH)
            } catch {
                // Fallback: no poster
            }
        }

        // Film title
        const titleY = 780
        ctx.fillStyle = '#E8DFC8'
        ctx.font = '700 42px "Georgia", serif'
        ctx.textAlign = 'center'
        ctx.letterSpacing = '1px'

        // Word wrap title
        const titleLines = wrapText(ctx, data.filmTitle.toUpperCase(), W - 140, 42)
        titleLines.forEach((line, i) => {
            ctx.fillText(line, W / 2, titleY + i * 52)
        })

        // Year
        const yearY = titleY + titleLines.length * 52 + 10
        if (data.filmYear) {
            ctx.fillStyle = 'rgba(139,105,20,0.7)'
            ctx.font = '400 18px "Courier Prime", monospace'
            ctx.letterSpacing = '4px'
            ctx.fillText(data.filmYear, W / 2, yearY)
        }

        // Rating reels (using authentic High-Res PNGs)
        const reelY = yearY + 40
        const reelSize = 42
        const reelGap = 16
        const totalReelWidth = 5 * reelSize + 4 * reelGap
        const reelStartX = (W - totalReelWidth) / 2

        try {
            const [imgFull, imgHalf, imgEmpty] = await Promise.all([
                loadImage('/rating-full.png'),
                loadImage('/rating-half.png'),
                loadImage('/rating-empty.png')
            ])

            for (let i = 0; i < 5; i++) {
                const x = reelStartX + i * (reelSize + reelGap)
                const isFull = data.rating >= i + 1
                const isHalf = !isFull && data.rating >= i + 0.5
                
                const img = isFull ? imgFull : isHalf ? imgHalf : imgEmpty
                
                if (isFull || isHalf) {
                    ctx.shadowColor = 'rgba(218,165,32,0.6)'
                    ctx.shadowBlur = 15
                }
                
                ctx.drawImage(img, x, reelY - reelSize / 2, reelSize, reelSize)
                
                ctx.shadowColor = 'transparent'
                ctx.shadowBlur = 0
            }
        } catch {
            // Fallback to text if images completely fail to load on canvas
            ctx.fillStyle = '#DAA520'
            ctx.font = '24px "Courier Prime", monospace'
            ctx.fillText(`RATING: ${data.rating}/5`, W / 2, reelY)
        }

        // Review snippet
        if (truncatedReview) {
            const reviewY = reelY + 50
            ctx.fillStyle = 'rgba(232,223,200,0.7)'
            ctx.font = 'italic 20px "Georgia", serif'
            ctx.textAlign = 'center'

            const reviewLines = wrapText(ctx, `"${truncatedReview}"`, W - 160, 20)
            reviewLines.forEach((line, i) => {
                ctx.fillText(line, W / 2, reviewY + i * 30)
            })
        }

        // Divider
        const divY = truncatedReview
            ? (data.review && data.review.length > 60 ? H - 180 : H - 200)
            : H - 200
        ctx.strokeStyle = 'rgba(139,105,20,0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(100, divY)
        ctx.lineTo(W - 100, divY)
        ctx.stroke()

        // User attribution
        ctx.fillStyle = 'rgba(232,223,200,0.5)'
        ctx.font = '400 14px "Courier Prime", monospace'
        ctx.letterSpacing = '2px'
        ctx.textAlign = 'center'
        ctx.fillText(`Logged by @${data.username}`, W / 2, divY + 30)

        // Branding footer
        ctx.fillStyle = '#DAA520'
        ctx.font = '700 16px "Georgia", serif'
        ctx.letterSpacing = '8px'
        ctx.fillText('THE REELHOUSE SOCIETY', W / 2, H - 70)

        ctx.fillStyle = 'rgba(139,105,20,0.4)'
        ctx.font = '400 11px "Courier Prime", monospace'
        ctx.letterSpacing = '3px'
        ctx.fillText('thereelhousesociety.com', W / 2, H - 45)

        return canvas
    }, [data, posterUrl, truncatedReview])

    const handleDownload = async () => {
        try {
            const canvas = await renderToCanvas()
            const link = document.createElement('a')
            link.download = `reelhouse-${data.filmTitle.toLowerCase().replace(/\s+/g, '-')}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
            setDownloaded(true)
            setTimeout(() => setDownloaded(false), 2000)
        } catch (e) {
            console.error('Failed to generate share card:', e)
        }
    }

    const handleCopy = async () => {
        try {
            const canvas = await renderToCanvas()
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ])
                    setCopying(true)
                    setTimeout(() => setCopying(false), 2000)
                }
            }, 'image/png')
        } catch {
            // Fallback: copy text
            const text = `${data.filmTitle} (${data.filmYear}) — ${data.rating}/5 ✦ The ReelHouse Society\nhttps://thereelhousesociety.com`
            navigator.clipboard.writeText(text)
            setCopying(true)
            setTimeout(() => setCopying(false), 2000)
        }
    }

    const handleNativeShare = async () => {
        try {
            const canvas = await renderToCanvas()
            canvas.toBlob(async (blob) => {
                if (blob && navigator.share) {
                    const file = new File([blob], 'reelhouse-card.png', { type: 'image/png' })
                    await navigator.share({
                        title: data.filmTitle,
                        text: `${data.filmTitle} (${data.filmYear}) — ${data.rating}/5 ✦ The ReelHouse Society`,
                        files: [file],
                    })
                }
            }, 'image/png')
        } catch {
            // User cancelled or not supported
        }
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10001,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: '#151210',
                        border: '1px solid rgba(139,105,20,0.3)',
                        borderRadius: '8px',
                        maxWidth: '420px',
                        width: '100%',
                        overflow: 'hidden',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '1rem 1.2rem',
                        borderBottom: '1px solid rgba(139,105,20,0.15)',
                    }}>
                        <span style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.65rem',
                            letterSpacing: '0.2em',
                            color: '#DAA520',
                        }}>
                            ✦ SHARE YOUR LOG
                        </span>
                        <button onClick={onClose} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'rgba(232,223,200,0.5)', padding: '4px',
                        }}>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Card Preview */}
                    <div ref={cardRef} style={{
                        margin: '1rem',
                        background: '#0E0B08',
                        border: '1px solid rgba(139,105,20,0.2)',
                        borderRadius: '4px',
                        padding: '1.5rem 1.2rem',
                        textAlign: 'center',
                    }}>
                        {/* Status */}
                        <div style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.55rem',
                            letterSpacing: '0.3em',
                            color: '#DAA520',
                            marginBottom: '1rem',
                        }}>
                            ✦  {statusLabel[data.status]}  ✦
                        </div>

                        {/* Poster */}
                        {posterUrl && (
                            <img
                                src={posterUrl}
                                alt={data.filmTitle}
                                style={{
                                    width: '160px',
                                    height: '240px',
                                    objectFit: 'cover',
                                    borderRadius: '2px',
                                    border: '1px solid rgba(139,105,20,0.2)',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                    marginBottom: '1rem',
                                }}
                            />
                        )}

                        {/* Title */}
                        <div style={{
                            fontFamily: 'Georgia, serif',
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            color: '#E8DFC8',
                            letterSpacing: '0.05em',
                            lineHeight: 1.3,
                        }}>
                            {data.filmTitle.toUpperCase()}
                        </div>

                        {data.filmYear && (
                            <div style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.6rem',
                                letterSpacing: '0.2em',
                                color: 'rgba(139,105,20,0.6)',
                                marginTop: '0.3rem',
                            }}>
                                {data.filmYear}
                            </div>
                        )}

                            <div style={{
                                display: 'flex', gap: '8px',
                                justifyContent: 'center',
                                margin: '1rem 0',
                                transform: 'scale(1.4)'
                            }}>
                                <ReelRating value={data.rating} size="lg" />
                            </div>

                        {/* Review */}
                        {truncatedReview && (
                            <div style={{
                                fontFamily: 'Georgia, serif',
                                fontSize: '0.75rem',
                                fontStyle: 'italic',
                                color: 'rgba(232,223,200,0.6)',
                                lineHeight: 1.6,
                                margin: '0.5rem 0',
                                padding: '0 0.5rem',
                            }}>
                                "{truncatedReview}"
                            </div>
                        )}

                        {/* Divider */}
                        <div style={{
                            height: '1px',
                            background: 'rgba(139,105,20,0.2)',
                            margin: '1rem 2rem',
                        }} />

                        {/* Attribution */}
                        <div style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.5rem',
                            letterSpacing: '0.15em',
                            color: 'rgba(232,223,200,0.4)',
                        }}>
                            Logged by @{data.username}
                        </div>

                        {/* Branding */}
                        <div style={{
                            fontFamily: 'Georgia, serif',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            letterSpacing: '0.35em',
                            color: '#DAA520',
                            marginTop: '0.8rem',
                        }}>
                            THE REELHOUSE SOCIETY
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{
                        display: 'flex', gap: '0.5rem',
                        padding: '0 1rem 1.2rem',
                    }}>
                        <button onClick={handleDownload} style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            padding: '0.7rem',
                            background: 'linear-gradient(135deg, #8B6914, #DAA520)',
                            border: 'none', borderRadius: '4px', cursor: 'pointer',
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.6rem',
                            letterSpacing: '0.15em',
                            color: '#0E0B08',
                            fontWeight: 700,
                        }}>
                            <Download size={14} />
                            {downloaded ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>SAVED <Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></span> : 'DOWNLOAD'}
                        </button>

                        <button onClick={handleCopy} style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            padding: '0.7rem',
                            background: 'transparent',
                            border: '1px solid rgba(139,105,20,0.4)',
                            borderRadius: '4px', cursor: 'pointer',
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.6rem',
                            letterSpacing: '0.15em',
                            color: '#E8DFC8',
                        }}>
                            <Copy size={14} />
                            {copying ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>COPIED <Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></span> : 'COPY'}
                        </button>

                        {typeof navigator.share === 'function' && (
                            <button onClick={handleNativeShare} style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                padding: '0.7rem',
                                background: 'transparent',
                                border: '1px solid rgba(139,105,20,0.4)',
                                borderRadius: '4px', cursor: 'pointer',
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.6rem',
                                letterSpacing: '0.15em',
                                color: '#E8DFC8',
                            }}>
                                <Share2 size={14} />
                                SHARE
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

// ── Helpers ──
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
    })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, _fontSize: number): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
        } else {
            currentLine = testLine
        }
    }
    if (currentLine) lines.push(currentLine)
    return lines
}
