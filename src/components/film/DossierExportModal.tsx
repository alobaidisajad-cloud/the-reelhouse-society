/**
 * DossierExportModal — Full-screen Instagram Story export overlay.
 * Shows a 9:16 canvas with film poster, rating, and review for screenshotting.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { tmdb } from '../../tmdb'
import { ReelRating, Portal } from '../UI'

export default function DossierExportModal({ film, log, onClose }: { film: Record<string, any>; log: Record<string, any> | null; onClose: () => void }) {
    if (!log) return null;
    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100vw', height: '100dvh', background: '#0E0B08', zIndex: 50000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={onClose}
            >
                <div style={{ position: 'absolute', top: '3vh', textAlign: 'center', zIndex: 10 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2rem', color: 'var(--blood-reel)', marginBottom: '0.5rem' }}>● REC</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)' }}>Take a Screenshot to Declassify</div>
                </div>

                <div style={{ width: '100%', maxWidth: '380px', height: '100%', maxHeight: '75vh', minHeight: '550px', background: 'var(--soot)', position: 'relative', overflow: 'hidden', border: '1px solid var(--ash)', boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(139,105,20,0.15)', borderRadius: '4px' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${tmdb.poster(film.poster_path, 'w780')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'sepia(0.6) brightness(0.2) contrast(1.3)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ink) 25%, transparent 80%)' }} />

                    <div style={{ position: 'absolute', bottom: '2rem', left: '1.5rem', right: '1.5rem', zIndex: 2 }}>
                        <div className="section-title" style={{ marginBottom: '0.5rem', borderBottom: '1px solid rgba(139,105,20,0.3)', paddingBottom: '0.3rem' }}>REELHOUSE · DECLASSIFIED</div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 5vw, 2.8rem)', color: 'var(--parchment)', lineHeight: 1, margin: '0 0 0.5rem 0' }}>{film.title}</h2>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', marginBottom: '1rem' }}>{film.release_date?.slice(0, 4)} · DIR. {film.credits?.crew?.find((c: any) => c.job === 'Director')?.name?.toUpperCase()}</div>
                        {log.rating > 0 && <div style={{ marginBottom: '1rem' }}><ReelRating value={log.rating} size="lg" /></div>}
                        <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{log.review || "Classified Analysis"}"</p>
                    </div>
                </div>

                <div style={{ position: 'absolute', bottom: '2vh', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                    ReelHouse Archival Network
                </div>
            </motion.div>
        </AnimatePresence>
        </Portal>
    )
}
