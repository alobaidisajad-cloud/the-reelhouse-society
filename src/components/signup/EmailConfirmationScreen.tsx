import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, RefreshCw } from 'lucide-react'

interface EmailConfirmationScreenProps {
    confirmedEmail: string
    resending: boolean
    onResend: () => void
    onClose: () => void
    focusTrapRef: React.RefObject<HTMLDivElement>
}

export default function EmailConfirmationScreen({ confirmedEmail, resending, onResend, onClose, focusTrapRef }: EmailConfirmationScreenProps) {
    return (
        <AnimatePresence>
            <motion.div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-label="Check your email"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    /* ── Same immersive space as all auth screens ── */
                    background: `
                        radial-gradient(ellipse 50% 40% at 50% 45%, rgba(139, 105, 20, 0.03), transparent),
                        rgba(5, 3, 1, 0.98)
                    `,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="scanlines"
                    style={{
                        width: '100%', maxWidth: 480,
                        background: 'radial-gradient(ellipse at center top, rgba(139, 105, 20, 0.04), transparent 60%), var(--ink)',
                        border: '1px solid rgba(139, 105, 20, 0.3)',
                        borderRadius: '4px', padding: '3rem 2rem',
                        position: 'relative',
                        boxShadow: '0 0 40px rgba(139,105,20,0.1)',
                        textAlign: 'center',
                    }}
                >
                    <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--sepia)', cursor: 'pointer', opacity: 0.5, zIndex: 2 }}>
                        <X size={16} />
                    </button>

                    {/* ── Floating mail icon with breathing glow ── */}
                    <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                        style={{
                            display: 'inline-flex', marginBottom: '1.5rem',
                            background: 'rgba(139,105,20,0.1)', padding: '1.25rem', borderRadius: '50%',
                            border: '1px solid var(--sepia)',
                            animation: 'breatheGlow 3s ease-in-out infinite',
                        }}
                    >
                        <Mail size={32} color="var(--sepia)" />
                    </motion.div>

                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                        CLEARANCE PENDING
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                        Check Your Inbox.
                    </h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, marginBottom: '0.5rem' }}>
                        We sent a classified verification link to:
                    </p>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'var(--flicker)', background: 'var(--soot)', padding: '0.6rem 1rem', borderRadius: '2px', border: '1px solid var(--ash)', marginBottom: '1.5rem', wordBreak: 'break-all' }}>
                        {confirmedEmail}
                    </div>
                    <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'var(--fog)', lineHeight: 1.7, marginBottom: '2rem' }}>
                        CLICK THE LINK IN YOUR EMAIL TO COMPLETE YOUR ENROLLMENT.<br />
                        CHECK YOUR SPAM FOLDER IF IT DOESN'T ARRIVE WITHIN 2 MINUTES.
                    </p>

                    <button
                        onClick={onResend}
                        disabled={resending}
                        style={{ background: 'none', border: '1px solid var(--ash)', color: resending ? 'var(--fog)' : 'var(--bone)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', cursor: resending ? 'default' : 'pointer', padding: '0.6rem 1.25rem', borderRadius: '2px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
                    >
                        <RefreshCw size={12} style={{ animation: resending ? 'spin 1s linear infinite' : 'none' }} />
                        {resending ? 'SENDING...' : 'RESEND LINK'}
                    </button>
                    <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.08em', color: 'var(--fog)', marginTop: '1.5rem', opacity: 0.6 }}>
                        THIS PAGE WILL AUTOMATICALLY LOG YOU IN ONCE CONFIRMED.
                    </p>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
