import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'

export default function PaywallModal({ featureName, onClose }: any) {
    const focusTrapRef = useFocusTrap(true, onClose)
    const navigate = useNavigate()

    const handleAscend = () => {
        onClose()
        navigate('/patronage')
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(5, 4, 2, 0.95)', zIndex: 60000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(10px)' }}
                role="dialog"
                aria-modal="true"
                aria-label={featureName || 'Upgrade membership'}
            >
                <motion.div
                    ref={focusTrapRef}
                    initial={{ scale: 0.9, opacity: 0, y: 40 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={e => e.stopPropagation()}
                    style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', borderRadius: '4px', maxWidth: 480, width: '100%', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(139,105,20,0.3)', display: 'flex', flexDirection: 'column', position: 'relative' }}
                >
                    <div style={{ padding: '2.5rem 2rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.12), transparent 60%)' }}>
                        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'var(--ink)', border: '1px solid var(--ash)', color: 'var(--bone)', padding: '0.5rem', cursor: 'pointer', borderRadius: '4px' }}>
                            <X size={16} />
                        </button>

                        <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', background: 'rgba(139,105,20,0.1)', border: '1px solid var(--sepia)', marginBottom: '1.5rem' }}>
                            <Lock size={28} color="var(--sepia)" />
                        </div>

                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>RESTRICTED SECTOR</div>

                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: 'var(--parchment)', lineHeight: 1.1, margin: 0, marginBottom: '1rem' }}>
                            {featureName || 'Advanced Clearance Required'}
                        </h2>

                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 380, lineHeight: 1.6, marginBottom: '2rem' }}>
                            This feature is reserved for elevated ranks of The Society. Ascend your membership to unlock the full cinematic arsenal.
                        </p>

                        <button
                            className="btn btn-primary"
                            onClick={handleAscend}
                            style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '0.75rem', letterSpacing: '0.2em' }}
                        >
                            VIEW MEMBERSHIP TIERS
                        </button>

                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)', marginTop: '1.25rem', opacity: 0.6 }}>
                            STARTING AT $1.99/MO · CANCEL ANYTIME
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
