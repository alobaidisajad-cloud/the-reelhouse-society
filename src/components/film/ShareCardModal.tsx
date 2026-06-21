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
}// Fixed dimensions for flawless pixel-parity
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
            position: 'relative', width: '360px', height: '640px',
            backgroundColor: 'var(--ink)', overflow: 'hidden',
            fontFamily: 'var(--font-body)', color: 'var(--parchment)'
        }}>
            {/* Poster top half full bleed */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '360px', height: '360px', zIndex: 1, backgroundColor: 'var(--soot)' }}>
                {posterDataUrl ? (
                    <img src={posterDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Poster" crossOrigin="anonymous" />
                ) : null}
            </div>

            {/* Abyss Fade Mask */}
            <div style={{
                position: 'absolute', top: '120px', left: 0, width: '360px', height: '240px', zIndex: 2,
                background: 'linear-gradient(to bottom, rgba(11, 10, 8, 0), rgba(11, 10, 8, 1))'
            }} />

            {/* Typography Container */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
                {/* Film Title */}
                <div style={{
                    position: 'absolute', top: '270px', left: '20px', width: '320px',
                    textAlign: 'center', fontFamily: 'var(--font-display)', color: 'var(--flicker)',
                    fontSize: '28px', lineHeight: '32px',
                    textShadow: '0 4px 12px rgba(0,0,0,0.8)',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                    {data.filmTitle}
                </div>

                {/* Metadata */}
                <div style={{
                    position: 'absolute', top: '335px', left: '20px', width: '320px',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                }}>
                    {yearDisplay ? <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--sepia)', fontSize: '11px', letterSpacing: '1.5px', fontWeight: 600 }}>{yearDisplay}</span> : null}
                    {yearDisplay ? <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--sepia)', fontSize: '11px', opacity: 0.5 }}>•</span> : null}
                    {data.rating > 0 ? <ReelRating value={data.rating} size="sm" /> : null}
                </div>

                {/* Review Text */}
                <div style={{
                    position: 'absolute', top: '380px', left: '24px', width: '312px', height: '170px',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}>
                    {reviewText ? (
                        <div style={{
                            fontFamily: '"Courier Prime", Courier, monospace', fontSize: '13px', lineHeight: '20px',
                            color: 'var(--bone)', textAlign: 'center', fontStyle: 'italic'
                        }}>
                            "{reviewText}"
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ fontFamily: '"Courier Prime", Courier, monospace', fontSize: '12px', color: 'rgba(200, 185, 154, 0.4)', letterSpacing: '1px' }}>
                                LOGGED // {data.status?.toUpperCase() || 'WATCHED'}
                            </div>
                        </div>
                    )}
                    
                    {/* Fade to black at bottom of review */}
                    {reviewText ? (
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px',
                            background: 'linear-gradient(to bottom, rgba(11, 10, 8, 0), rgba(11, 10, 8, 1))'
                        }} />
                    ) : null}
                </div>

                {/* Footer */}
                <div style={{
                    position: 'absolute', top: '580px', left: '24px', width: '312px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: '16px', borderTop: '1px solid rgba(196, 150, 26, 0.2)'
                }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '10px', color: 'var(--sepia)', letterSpacing: '1px', opacity: 0.8 }}>REELHOUSE</span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '10px', color: 'var(--parchment)', letterSpacing: '1px', opacity: 0.8 }}>@{data.username}</span>
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
