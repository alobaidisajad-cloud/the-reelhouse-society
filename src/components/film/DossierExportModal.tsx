import { useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Copy, Share2, Check } from 'lucide-react'
import html2canvas from 'html2canvas'
import { tmdb } from '../../tmdb'
import { ReelRating, Portal } from '../UI'

export default function DossierExportModal({ film, log, onClose }: { film: Record<string, any>; log: Record<string, any> | null; onClose: () => void }) {
    const cardRef = useRef<HTMLDivElement>(null)
    const [downloaded, setDownloaded] = useState(false)
    const [copying, setCopying] = useState(false)

    if (!log) return null;

    const handleDownload = async () => {
        if (!cardRef.current) return
        try {
            const canvas = await html2canvas(cardRef.current, { useCORS: true, backgroundColor: '#0F0D0A', scale: 2 })
            const link = document.createElement('a')
            link.download = `reelhouse-dossier-${film.title.toLowerCase().replace(/\s+/g, '-')}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
            setDownloaded(true)
            setTimeout(() => setDownloaded(false), 2000)
        } catch (e) {
            console.error('Failed to generate sharing card', e)
        }
    }

    const handleCopy = async () => {
        if (!cardRef.current) return
        try {
            const canvas = await html2canvas(cardRef.current, { useCORS: true, backgroundColor: '#0F0D0A', scale: 2 })
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    setCopying(true)
                    setTimeout(() => setCopying(false), 2000)
                }
            }, 'image/png')
        } catch {
            const text = `Dossier: ${film.title}\nRating: ${log.rating}/5\n"${log.review}"\n✦ The ReelHouse Society`
            navigator.clipboard.writeText(text)
            setCopying(true)
            setTimeout(() => setCopying(false), 2000)
        }
    }

    const handleNativeShare = async () => {
        if (!cardRef.current) return
        try {
            const canvas = await html2canvas(cardRef.current, { useCORS: true, backgroundColor: '#0F0D0A', scale: 2 })
            canvas.toBlob(async (blob) => {
                if (blob && navigator.share) {
                    const file = new File([blob], 'reelhouse-dossier.png', { type: 'image/png' })
                    await navigator.share({
                        title: film.title,
                        text: `Dossier: ${film.title} — ${log.rating}/5 ✦ The ReelHouse Society`,
                        files: [file],
                    })
                }
            }, 'image/png')
        } catch { }
    }

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100vw', height: '100dvh', background: 'rgba(8, 6, 4, 0.95)', zIndex: 50000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'pointer' }}
                onClick={onClose}
            >
                <div style={{ position: 'absolute', top: '4vh', textAlign: 'center', zIndex: 10 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2rem', color: 'var(--blood-reel)', marginBottom: '0.5rem' }}>● DIRECTIVES</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)' }}>Declassify and Distribute</div>
                </div>

                <div 
                    ref={cardRef}
                    style={{ width: '100%', maxWidth: '380px', aspectRatio: '9/16', maxHeight: '78vh', background: 'var(--soot)', position: 'relative', overflow: 'hidden', border: '1px solid rgba(139,105,20,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(139,105,20,0.15)', borderRadius: '4px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${tmdb.poster(film.poster_path, 'w780')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'sepia(0.3) brightness(0.4) contrast(1.15)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,13,10,0.95) 15%, transparent 65%)' }} />

                    <div style={{ position: 'absolute', bottom: '2rem', left: '1.5rem', right: '1.5rem', zIndex: 2 }}>
                        <div className="section-title" style={{ marginBottom: '0.6rem', borderBottom: '1px solid rgba(139,105,20,0.3)', paddingBottom: '0.4rem' }}>REELHOUSE · DECLASSIFIED</div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 6vw, 2.6rem)', color: 'var(--parchment)', lineHeight: 1.1, margin: '0 0 0.5rem 0' }}>{film.title}</h2>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--flicker)', marginBottom: '1rem', opacity: 0.8 }}>{film.release_date?.slice(0, 4)} · DIR. {film.credits?.crew?.find((c: any) => c.job === 'Director')?.name?.toUpperCase()}</div>
                        {log.rating > 0 && <div style={{ marginBottom: '1.2rem' }}><ReelRating value={log.rating} size="lg" /></div>}
                        <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{log.review || "Classified Analysis"}"</p>
                    </div>
                </div>

                {/* ACTION BUTTONS */}
                <div style={{ width: '100%', maxWidth: '380px', display: 'flex', gap: '0.5rem', marginTop: '1.5rem', zIndex: 10 }} onClick={e => e.stopPropagation()}>
                    <button onClick={handleDownload} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        padding: '0.8rem', background: 'linear-gradient(135deg, #8B6914, #DAA520)',
                        border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        fontSize: '0.55rem', letterSpacing: '0.15em', color: '#0E0B08', fontWeight: 700,
                    }}>
                        <Download size={14} />
                        {downloaded ? 'SAVED' : 'DOWNLOAD'}
                    </button>
                    <button onClick={handleCopy} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        padding: '0.8rem', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(139,105,20,0.4)', borderRadius: '4px', cursor: 'pointer',
                        fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: '#E8DFC8',
                    }}>
                        <Copy size={14} />
                        {copying ? 'COPIED' : 'COPY'}
                    </button>
                    {typeof navigator.share === 'function' && (
                        <button onClick={handleNativeShare} style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            padding: '0.8rem', background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(139,105,20,0.4)', borderRadius: '4px', cursor: 'pointer',
                            fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: '#E8DFC8',
                        }}>
                            <Share2 size={14} />
                            SHARE
                        </button>
                    )}
                </div>

                <div style={{ position: 'absolute', bottom: '2vh', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                    ReelHouse Archival Network
                </div>
            </motion.div>
        </AnimatePresence>
        </Portal>
    )
}
