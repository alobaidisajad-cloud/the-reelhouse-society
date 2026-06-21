import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Share2 } from 'lucide-react'
import { tmdb } from '../../lib/tmdb'
import { Portal, ReelRating } from '../UI'
import * as htmlToImage from 'html-to-image'

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
const RENDER_W = 380
const RENDER_H = Math.round(RENDER_W * 16 / 9)

const getProxiedImageUrl = (path: string | null) => {
    if (!path) return null
    return `https://images.weserv.nl/?url=${encodeURIComponent(tmdb.poster(path, 'w500'))}&output=webp`
}

function CornerTicks() {
    return (
        <div style={{ position: 'absolute', inset: '14px', border: '1px solid var(--sepia-border)', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 1.5, background: 'var(--sepia)' }} />
            <div style={{ position: 'absolute', top: 0, left: 0, width: 1.5, height: 12, background: 'var(--sepia)' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 1.5, background: 'var(--sepia)' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: 1.5, height: 12, background: 'var(--sepia)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 1.5, background: 'var(--sepia)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1.5, height: 12, background: 'var(--sepia)' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 1.5, background: 'var(--sepia)' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1.5, height: 12, background: 'var(--sepia)' }} />
        </div>
    )
}

function CardContent({ data, posterDataUrl }: { data: ShareCardData, posterDataUrl: string | null }) {
    const reviewText = data.review ? truncateReview(data.review) : null
    const yearDisplay = data.filmYear ?? data.year ?? ''

    return (
        <div style={{
            position: 'relative', width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'var(--font-body)', color: 'var(--parchment)',
            padding: 14, overflow: 'hidden'
        }}>
            <CornerTicks />
            <div style={{ textAlign: 'center', marginTop: 4 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.22rem', color: 'var(--sepia)', opacity: 0.8 }}>
                    ? ARCHIVE DOSSIER ?
                </span>
            </div>

            <div style={{ flex: 0.8 }} />

            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <div style={{
                    width: 220, height: 330, background: 'var(--soot)',
                    border: '1px solid rgba(196,150,26,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 40px rgba(196,150,26,0.1)'
                }}>
                    {posterDataUrl ? (
                        <img src={posterDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Poster" crossOrigin="anonymous" />
                    ) : (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', color: 'var(--fog)' }}>Ø</div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ textAlign: 'center', padding: '0 1rem' }}>
                <h1 style={{
                    fontFamily: 'var(--font-display)', fontSize: '1.4rem',
                    lineHeight: 1.1, color: 'var(--parchment)', margin: '0 0 0.3rem 0',
                    textShadow: '0 0 12px rgba(196,150,26,0.15)'
                }}>
                    {data.filmTitle}
                </h1>

                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--flicker)', opacity: 0.85, marginBottom: '0.6rem' }}>
                    {yearDisplay}
                </div>

                {data.rating > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.8rem' }}>
                        <ReelRating rating={data.rating} size={14} />
                    </div>
                )}

                <div style={{
                    fontFamily: 'var(--font-body-italic)', fontSize: '0.72rem', color: 'var(--bone)',
                    lineHeight: 1.5, opacity: 0.95,
                    display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                    "{reviewText || 'Classified Analysis'}"
                </div>

                {data.username && (
                    <div style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.12rem',
                        color: 'var(--sepia)', marginTop: '0.6rem', opacity: 0.9
                    }}>
                        — @{data.username.toUpperCase()}
                    </div>
                )}
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', marginBottom: 2 }}>
                <img src="/assets/images/reelhouse-logo-transparent.png" alt="" style={{ width: 12, height: 12, opacity: 0.8 }} />
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.22rem', color: 'var(--sepia-border-strong)' }}>
                    THE REELHOUSE SOCIETY
                </span>
            </div>
        </div>
    )
}

export default function ShareCardModal({ data, onClose }: ShareCardModalProps) {
    const renderRef = useRef<HTMLDivElement>(null)
    const [saving, setSaving] = useState(false)
    const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null)
    const [ready, setReady] = useState(false)
    const cachedBlob = useRef<Blob | null>(null)

    const screenshotCard = async (element: HTMLElement) => {
        try {
            const dataUrl = await htmlToImage.toPng(element, { quality: 1.0, pixelRatio: 3 })
            const response = await fetch(dataUrl)
            return await response.blob()
        } catch (err) {
            console.error('Screenshot failed:', err)
            return null
        }
    }

    const preGenerate = useCallback(async () => {
        try {
            const proxiedUrl = getProxiedImageUrl(data.posterPath)
            if (!proxiedUrl) { setReady(true); return }
            const imgRes = await fetch(proxiedUrl)
            const imgBlob = await imgRes.blob()
            const dataUrl = await new Promise<string>((res, rej) => {
                const reader = new FileReader()
                reader.onloadend = () => res(reader.result as string)
                reader.onerror = rej
                reader.readAsDataURL(imgBlob)
            })
            setPosterDataUrl(dataUrl)
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
                await navigator.share({ files: [file], title: `${data.filmTitle} — ReelHouse Dossier` })
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
                            width: RENDER_W, height: RENDER_H, background: 'var(--ink)',
                            overflow: 'hidden', borderRadius: 4, display: 'flex', flexDirection: 'column',
                            pointerEvents: 'none', zIndex: -1,
                        }}
                    >
                        <CardContent data={data} posterDataUrl={posterDataUrl} />
                    </div>

                    <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', zIndex: 10, padding: '0.5rem' }}>
                        <X size={22} />
                    </button>

                    <div style={{ position: 'absolute', top: '3.5vh', textAlign: 'center', zIndex: 10 }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.22rem', color: 'var(--sepia)', marginBottom: '0.3rem', opacity: 0.8 }}>? ARCHIVE DOSSIER ?</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--fog)' }}>
                            {ready ? 'Ready to save or share' : 'Developing…'}
                        </div>
                    </div>

                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 300, aspectRatio: '9/16', maxHeight: '68vh',
                            background: 'var(--ink)', position: 'relative', overflow: 'hidden',
                            border: '1px solid rgba(196,150,26,0.3)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 50px rgba(196,150,26,0.12)',
                            borderRadius: 4, display: 'flex', flexDirection: 'column',
                        }}
                    >
                        <CardContent data={data} posterDataUrl={posterDataUrl} />
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
