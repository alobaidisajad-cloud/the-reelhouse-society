import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useAuthStore, useFilmStore, useUIStore } from '../store'
import Buster from './Buster'
import reelToast from '../utils/reelToast'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAndroidHardwareBack } from '../hooks/useAndroidHardwareBack'
import { Portal } from './UI'

// A first step, "PICK YOUR FIVE", asked for five films and said "Your taste
// profile has been seeded". Nothing was seeded: the picks were written to a
// column members may not write, and nothing anywhere reads it. The app has no
// such step; the website no longer pretends to.
const STEPS = [
    { label: 'LOG YOUR FIRST', sub: 'Record your last watched film.' },
    { label: 'JOIN THE SOCIETY', sub: "You're in. Welcome to the society." },
]

export default function OnboardingModal() {
    const user = useAuthStore(s => s.user)
    const isAuthenticated = useAuthStore(s => s.isAuthenticated)
    const logs = useFilmStore(s => s.logs)
    const openLogModal = useUIStore(s => s.openLogModal)

    const [open, setOpen] = useState(false)
    const [step, setStep] = useState(0)

    // Show onboarding ONLY for brand new users (0 logs, hasn't dismissed before)
    useEffect(() => {
        if (!isAuthenticated || !user) return
        // Check DB preference first, fall back to legacy localStorage
        const dismissedKey = `reelhouse_onboarded_${user.id || user.username}`
        if (user.preferences?.onboarded || localStorage.getItem(dismissedKey)) return
        if (logs.length === 0) {
            const timer = setTimeout(() => setOpen(true), 1500)
            return () => clearTimeout(timer)
        }
    }, [isAuthenticated, user, logs.length])

    const handleFinish = () => {
        if (user) {
            useAuthStore.getState().setPreference('onboarded', true)
            localStorage.setItem(`reelhouse_onboarded_${user.id || user.username}`, 'true')
        }
        setOpen(false)
        reelToast.success('Welcome to The Society ✦', { icon: '🎬' })
    }

    const handleLogFirst = () => {
        setOpen(false)
        if (user) {
            useAuthStore.getState().setPreference('onboarded', true)
            localStorage.setItem(`reelhouse_onboarded_${user.id || user.username}`, 'true')
        }
        openLogModal()
    }

    const handleDismiss = () => {
        if (user) {
            useAuthStore.getState().setPreference('onboarded', true)
            localStorage.setItem(`reelhouse_onboarded_${user.id || user.username}`, 'true')
        }
        setOpen(false)
    }

    const focusTrapRef = useFocusTrap(open, handleDismiss)
    useAndroidHardwareBack(open, handleDismiss)

    if (!open) return null

    return (
        <Portal>
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleDismiss}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10001,
                    background: 'rgba(10,7,3,0.95)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
                role="dialog"
                aria-modal="true"
                aria-label="Welcome onboarding"
            >
                <motion.div
                    ref={focusTrapRef}
                    tabIndex={-1}
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--ash)',
                        borderTop: '2px solid var(--sepia)',
                        borderRadius: 'var(--radius-card)',
                        width: '100%', maxWidth: 480,
                        maxHeight: 'calc(100dvh - 2rem)',
                        overflow: 'auto',
                        position: 'relative',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={handleDismiss}
                        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', zIndex: 2 }}
                    >
                        <X size={18} />
                    </button>

                    {/* Header */}
                    <div style={{ padding: '2rem 2rem 1rem', textAlign: 'center' }}>
                        <Buster size={48} mood="smiling" />
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginTop: '1rem' }}>
                            {STEPS[step].label}
                        </div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--parchment)', marginTop: '0.5rem' }}>
                            {step === 0 ? 'Log Your First Film' : 'Welcome, Devotee.'}
                        </h2>
                        <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--bone)', marginTop: '0.5rem', opacity: 0.8 }}>
                            {STEPS[step].sub}
                        </p>
                    </div>

                    {/* Step progress */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '0 2rem 1.5rem' }}>
                        {STEPS.map((_, i) => (
                            <div key={i} style={{
                                width: i === step ? 32 : 8, height: 4,
                                borderRadius: 2,
                                background: i <= step ? 'var(--sepia)' : 'var(--ash)',
                                transition: 'all 0.3s',
                            }} />
                        ))}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '0 2rem 2rem' }}>
                        {step === 0 && (
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', marginBottom: '2rem', lineHeight: 1.6 }}>
                                    Log a film to make your mark on The Society.
                                </p>

                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ fontSize: '0.75rem', padding: '0.7em 2em', letterSpacing: '0.15em' }}
                                        onClick={handleLogFirst}
                                    >
                                        + LOG A FILM
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        style={{ fontSize: '0.65rem', padding: '0.6em 1.5em', letterSpacing: '0.1em' }}
                                        onClick={() => setStep(1)}
                                    >
                                        SKIP FOR NOW
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 1 && (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✦</div>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--parchment)', lineHeight: 1.6, marginBottom: '2rem' }}>
                                    The projector is loaded. The house lights are dimming.
                                    <br />Your journey through the archive begins now.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.75rem', padding: '0.7em 2.5em', letterSpacing: '0.2em' }}
                                    onClick={handleFinish}
                                >
                                    ENTER THE SOCIETY
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        </Portal>
    )
}
