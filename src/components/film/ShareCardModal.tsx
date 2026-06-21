import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Share2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { tmdb } from '../../tmdb'
import { Portal, ReelRating } from '../UI'

interface ShareCardData {
    filmTitle: string
    filmYear?: string
    year?: string
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

const ENTITIES: Record<string, string> = {
    '&quot;': '"', '&apos;': "'", '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' '
}
function cleanReviewText(text: string): string {
    if (!text) return ''
    let parsed = text.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<(?:\/?(?:p|div|br|b|i|strong|em|span|a|ul|li))[^>]*>/gi, '').trim()
    return parsed.replace(/&[a-z0-9#]+;/gi, (m) => ENTITIES[m] || m)
}
function truncateReview(text: string, maxLength = 350) {
    const raw = cleanReviewText(text)
    if (raw.length <= maxLength) return raw
    const cut = raw.lastIndexOf(' ', maxLength)
    return raw.substring(0, cut > 40 ? cut : maxLength).trimEnd() + '…'
}

// Fixed dimensions
const RENDER_W = 360
const RENDER_H = 640

const getProxiedImageUrl = (path: string | null) => {
    if (!path) return null
    const posterUrl = tmdb.poster(path, 'w500')
    if (!posterUrl) return null
    return `/api/proxy-image?url=${encodeURIComponent(posterUrl)}`
}

const getBlurredProxiedImageUrl = (path: string | null) => {
    if (!path) return null
    const posterUrl = tmdb.poster(path, 'w92')
    if (!posterUrl) return null
    return `/api/proxy-image?url=${encodeURIComponent(posterUrl)}`
}

function CardContent({ data, posterDataUrl, blurDataUrl }: { data: ShareCardData, posterDataUrl: string | null, blurDataUrl: string | null }) {
    const reviewText = data.review ? truncateReview(data.review) : null
    const yearDisplay = data.filmYear ?? data.year ?? ''

    return (
        <div style={{
            position: 'relative', width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'var(--font-body)', color: 'var(--parchment)',
            overflow: 'hidden', background: '#040302'
        }}>
            {/* Ambient Blur Layer */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: blurDataUrl ? `url(${blurDataUrl})` : 'none',
                background: blurDataUrl ? undefined : 'radial-gradient(circle at center, rgba(196, 150, 26, 0.12) 0%, rgba(4, 3, 2, 0) 70%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                transform: 'scale(1.15)',
                opacity: blurDataUrl ? 0.45 : 1,
                zIndex: 0
            }} />

            {/* Vignette Overlay */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(circle at center, rgba(4,3,2,0.1) 0%, rgba(4,3,2,0.85) 90%)',
                zIndex: 1
            }} />

            {/* Obsidian Slab */}
            <div style={{
                margin: '45px 24px 25px 24px',
                flex: 1,
                background: '#090705',
                border: '1px solid rgba(196, 150, 26, 0.3)',
                borderRadius: '8px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8), 0 0 40px rgba(196,150,26,0.08)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                zIndex: 2
            }}>
                {/* Header */}
                <div style={{ padding: '12px 0 6px 0', textAlign: 'center', borderBottom: '1px solid rgba(196,150,26,0.15)', background: 'rgba(0,0,0,0.1)' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.25rem', color: 'var(--sepia)', opacity: 0.9 }}>
                        ● ARCHIVE DOSSIER ●
                    </span>
                </div>

                {/* Poster Container */}
                <div style={{ padding: '16px 16px 12px 16px', display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: 0 }}>
                    <div style={{
                        height: '100%',
                        aspectRatio: '2/3',
                        background: 'var(--soot)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.65)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                        {posterDataUrl ? (
                            <img src={posterDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Poster" crossOrigin="anonymous" />
                        ) : (
                            <div style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'linear-gradient(135deg, #15120e 0%, #090706 100%)',
                                padding: '16px',
                                border: '1px solid rgba(196, 150, 26, 0.15)',
                                boxSizing: 'border-box',
                                textAlign: 'center',
                                position: 'relative'
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    inset: '8px',
                                    border: '1px solid rgba(196, 150, 26, 0.08)',
                                    pointerEvents: 'none'
                                }} />
                                <div style={{
                                    fontFamily: 'var(--font-ui)',
                                    fontSize: '0.6rem',
                                    color: 'var(--sepia)',
                                    opacity: 0.6,
                                    marginBottom: '12px',
                                    fontWeight: 300,
                                    letterSpacing: '0.1em'
                                }}>
                                    RH
                                </div>
                                <div style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '0.75rem',
                                    lineHeight: 1.2,
                                    color: 'var(--parchment)',
                                    opacity: 0.85,
                                    marginBottom: '6px',
                                    textTransform: 'uppercase',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {data.filmTitle}
                                </div>
                                <div style={{
                                    fontFamily: 'var(--font-ui)',
                                    fontSize: '0.45rem',
                                    letterSpacing: '0.1em',
                                    color: 'var(--fog)',
                                    textTransform: 'uppercase'
                                }}>
                                    {yearDisplay}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Film & Review Metadata */}
                <div style={{ padding: '0 20px 16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <h1 style={{
                        fontFamily: 'var(--font-display)', fontSize: '1.25rem',
                        lineHeight: 1.15, color: 'var(--parchment)', margin: '0 0 0.25rem 0',
                        textShadow: '0 2px 8px rgba(0,0,0,0.6)'
                    }}>
                        {data.filmTitle}
                    </h1>

                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.5rem', opacity: 0.85 }}>
                        {yearDisplay}
                    </div>

                    {data.rating > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                            <ReelRating value={data.rating} size="sm" />
                        </div>
                    )}

                    <div style={{
                        fontFamily: 'var(--font-body-italic)', fontSize: '0.7rem', color: 'var(--bone)',
                        lineHeight: 1.5, opacity: 0.95,
                        padding: '8px 12px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '4px',
                        borderLeft: '2px solid var(--sepia)',
                        width: '100%',
                        maxHeight: '96px',
                        overflow: 'hidden',
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                        textAlign: 'left'
                    }}>
                        "{reviewText || 'Classified Analysis'}"
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(196,150,26,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <img src="/reelhouse-logo-transparent.png" alt="" style={{ width: 14, height: 14, opacity: 0.7 }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.15rem', color: 'var(--sepia)' }}>
                            REELHOUSE
                        </span>
                    </div>
                    {data.username && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.1rem', color: 'var(--flicker)' }}>
                            @{data.username.toUpperCase()}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function ShareCardModal({ data, onClose }: ShareCardModalProps) {
    const renderRef = useRef<HTMLDivElement>(null)
    const [saving, setSaving] = useState(false)
    const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null)
    const [blurDataUrl, setBlurDataUrl] = useState<string | null>(null)
    const [ready, setReady] = useState(false)
    const cachedBlob = useRef<Blob | null>(null)

    const screenshotCard = async (element: HTMLElement) => {
        try {
            const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#040302' })
            return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
        } catch (err) {
            console.error('Screenshot failed:', err)
            return null
        }
    }

    const preGenerate = useCallback(async () => {
        try {
            const sharpUrl = getProxiedImageUrl(data.posterPath)
            const blurredUrl = getBlurredProxiedImageUrl(data.posterPath)
            if (!sharpUrl) { setReady(true); return }

            // Fetch sharp poster
            const imgRes = await fetch(sharpUrl)
            const imgBlob = await imgRes.blob()
            const sharpDataUrl = await new Promise<string>((res, rej) => {
                const reader = new FileReader()
                reader.onloadend = () => res(reader.result as string)
                reader.onerror = rej
                reader.readAsDataURL(imgBlob)
            })
            setPosterDataUrl(sharpDataUrl)

            // Fetch blurred background
            if (blurredUrl) {
                try {
                    const blurRes = await fetch(blurredUrl)
                    const blurBlob = await blurRes.blob()
                    const blurDataUrlVal = await new Promise<string>((res, rej) => {
                        const reader = new FileReader()
                        reader.onloadend = () => res(reader.result as string)
                        reader.onerror = rej
                        reader.readAsDataURL(blurBlob)
                    })
                    setBlurDataUrl(blurDataUrlVal)
                } catch (e) {
                    console.error('Blurred background load failed', e)
                }
            }

            await new Promise(r => setTimeout(r, 180))
            if (!renderRef.current) return
            cachedBlob.current = await screenshotCard(renderRef.current)
            setReady(true)
        } catch (err) {
            console.error('[ShareCard] pre-gen failed', err)
            setReady(true)
        }
    }, [data.posterPath])

    useEffect(() => { preGenerate() }, [preGenerate])

    const save = async (shareMode: boolean) => {
        setSaving(true)
        try {
            let blob = cachedBlob.current
            if (!blob && renderRef.current) blob = await screenshotCard(renderRef.current)
            if (!blob) return
            const filename = `reelhouse-${data.filmTitle.toLowerCase().replace(/\s+/g, '-')}.png`
            const file = new File([blob], filename, { type: 'image/png' })
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
            if ((shareMode || isMobile) && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: `${data.filmTitle} • ReelHouse Dossier` })
            } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = filename; a.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
            }
        } catch { } finally { setSaving(false) }
    }

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(4,3,2,0.97)', zIndex: 50000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={onClose}
                >
                    <div
                        ref={renderRef}
                        aria-hidden="true"
                        style={{
                            position: 'fixed', top: 0, left: '-9999px',
                            width: RENDER_W, height: RENDER_H, background: '#040302',
                            overflow: 'hidden', borderRadius: 4, display: 'flex', flexDirection: 'column',
                            pointerEvents: 'none', zIndex: -1,
                        }}
                    >
                        <CardContent data={data} posterDataUrl={posterDataUrl} blurDataUrl={blurDataUrl} />
                    </div>

                    <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', zIndex: 10, padding: '0.5rem' }}>
                        <X size={22} />
                    </button>

                    <div style={{ position: 'absolute', top: '3.5vh', textAlign: 'center', zIndex: 10 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.22rem', color: 'var(--sepia)', marginBottom: '0.3rem', opacity: 0.8 }}>● ARCHIVE DOSSIER ●</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)' }}>
                            {ready ? 'Ready to save or share' : 'Developing…'}
                        </div>
                    </div>

                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 300, aspectRatio: '9/16', maxHeight: '68vh',
                            background: '#040302', position: 'relative', overflow: 'hidden',
                            border: '1px solid rgba(196,150,26,0.3)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 50px rgba(196,150,26,0.12)',
                            borderRadius: 4, display: 'flex', flexDirection: 'column',
                        }}
                    >
                        <CardContent data={data} posterDataUrl={posterDataUrl} blurDataUrl={blurDataUrl} />
                    </div>

                    <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 300, display: 'flex', gap: '0.6rem', marginTop: '1.1rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
                        <button
                            onClick={() => save(false)} disabled={saving}
                            style={{
                                flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                padding: '0.9rem 1rem', background: saving ? 'rgba(139,105,20,0.4)' : 'linear-gradient(135deg, #8B6914, #DAA520)',
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
                                onClick={() => save(true)} disabled={saving}
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
