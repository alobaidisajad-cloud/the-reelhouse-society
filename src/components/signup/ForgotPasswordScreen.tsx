import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import reelToast from '../../utils/reelToast'
import { useState } from 'react'

interface ForgotPasswordScreenProps {
    onClose: () => void
    onBackToLogin: () => void
    focusTrapRef: React.RefObject<HTMLDivElement>
}

export default function ForgotPasswordScreen({ onClose, onBackToLogin, focusTrapRef }: ForgotPasswordScreenProps) {
    const [forgotEmail, setForgotEmail] = useState('')
    const [forgotSent, setForgotSent] = useState(false)
    const [forgotLoading, setForgotLoading] = useState(false)

    return (
        <AnimatePresence>
            <motion.div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-label="Reset password"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    /* ── Same immersive space as the Velvet Rope ── */
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

                    {/* ── Breathing lock icon — the system is alive ── */}
                    <div style={{
                        display: 'inline-flex', marginBottom: '1.5rem',
                        background: 'rgba(139,105,20,0.1)', padding: '1.25rem', borderRadius: '50%',
                        border: '1px solid var(--sepia)',
                        animation: 'breatheGlow 3s ease-in-out infinite',
                    }}>
                        <Lock size={32} color="var(--sepia)" />
                    </div>

                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                        CREDENTIAL RECOVERY
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1rem' }}>
                        {forgotSent ? 'Check Your Inbox.' : 'Reset Your Password'}
                    </h2>

                    {forgotSent ? (
                        <>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--bone)', lineHeight: 1.6, marginBottom: '0.5rem' }}>
                                We sent a password reset link to:
                            </p>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'var(--flicker)', background: 'var(--soot)', padding: '0.6rem 1rem', borderRadius: '2px', border: '1px solid var(--ash)', marginBottom: '1.5rem', wordBreak: 'break-all' }}>
                                {forgotEmail}
                            </div>
                            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'var(--fog)', lineHeight: 1.7, marginBottom: '2rem' }}>
                                CLICK THE LINK IN YOUR EMAIL TO SET A NEW PASSWORD.<br />
                                CHECK YOUR SPAM FOLDER IF IT DOESN'T ARRIVE WITHIN 2 MINUTES.
                            </p>
                            <button
                                onClick={onBackToLogin}
                                style={{ background: 'none', border: '1px solid var(--ash)', color: 'var(--bone)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', cursor: 'pointer', padding: '0.6rem 1.25rem', borderRadius: '2px' }}
                            >
                                BACK TO SIGN IN
                            </button>
                        </>
                    ) : (
                        <>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                                Enter the email associated with your account and we'll send you a classified reset link.
                            </p>
                            <form onSubmit={async (e) => {
                                e.preventDefault()
                                if (!forgotEmail.trim()) { reelToast.error('Please enter your email.'); return }
                                setForgotLoading(true)
                                try {
                                    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
                                        redirectTo: `${window.location.origin}/auth/reset-password`,
                                    })
                                    if (error) throw error
                                    setForgotSent(true)
                                    reelToast.success('Reset link sent!')
                                } catch (err: any) {
                                    reelToast.error(err.message || 'Could not send reset link.')
                                } finally {
                                    setForgotLoading(false)
                                }
                            }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <input
                                    className="input"
                                    type="email"
                                    placeholder="your.email@address.com"
                                    autoComplete="email"
                                    value={forgotEmail}
                                    onChange={e => setForgotEmail(e.target.value)}
                                    autoFocus
                                    style={{ textAlign: 'center' }}
                                />
                                <button
                                    className="btn btn-primary"
                                    type="submit"
                                    disabled={forgotLoading}
                                    style={{ width: '100%', justifyContent: 'center', padding: '0.7em', opacity: forgotLoading ? 0.5 : 1 }}
                                >
                                    {forgotLoading ? 'SENDING...' : 'SEND RESET LINK'}
                                </button>
                            </form>
                            <button
                                onClick={onBackToLogin}
                                style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', textDecoration: 'underline', cursor: 'pointer' }}
                            >
                                BACK TO SIGN IN
                            </button>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
