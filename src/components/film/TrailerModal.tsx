/**
 * TrailerModal — Fullscreen YouTube trailer player overlay.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Portal } from '../UI'

export default function TrailerModal({ trailerKey, onClose }: { trailerKey: string; onClose: () => void }) {
    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 50000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '100%', maxWidth: 960, position: 'relative' }}
                    >
                        <button onClick={onClose} style={{ position: 'absolute', top: -44, right: 0, background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--parchment)', padding: '0.4rem 0.75rem', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em' }}>
                            <X size={12} /> CLOSE
                        </button>
                        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000', borderRadius: '2px', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(139,105,20,0.3), 0 40px 80px rgba(0,0,0,0.8)' }}>
                            <iframe
                                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1&color=white`}
                                title="Trailer"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                                allowFullScreen
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                            />
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--fog)' }}>
                            OFFICIAL TRAILER
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
