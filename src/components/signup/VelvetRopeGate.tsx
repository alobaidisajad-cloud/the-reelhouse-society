import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Terminal, X } from 'lucide-react'

interface VelvetRopeGateProps {
    clearanceCode: string
    setClearanceCode: (v: string) => void
    clearanceStatus: string
    onSubmit: (e: React.FormEvent) => void
    onSwitchToLogin: () => void
    onClose: () => void
}

// ── The cipher scramble characters — Cold War terminal aesthetic ──
const CIPHER_CHARS = '▓░▒█▐▌╬╠╣╦╩■□▪▫◆◇○●◎★✦'

function useCipherScramble(isScrambling: boolean, finalText: string) {
    const [display, setDisplay] = useState('')
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const iterRef = useRef(0)

    useEffect(() => {
        if (!isScrambling) {
            if (intervalRef.current) clearInterval(intervalRef.current)
            setDisplay('')
            iterRef.current = 0
            return
        }

        const maxIters = 20
        iterRef.current = 0

        intervalRef.current = setInterval(() => {
            iterRef.current++
            if (iterRef.current >= maxIters) {
                if (intervalRef.current) clearInterval(intervalRef.current)
                setDisplay(finalText)
                return
            }
            // Progressive reveal: as iterations increase, more final chars lock in
            const progress = iterRef.current / maxIters
            const locked = Math.floor(finalText.length * progress)
            let result = ''
            for (let i = 0; i < finalText.length; i++) {
                if (finalText[i] === ' ') {
                    result += ' '
                } else if (i < locked) {
                    result += finalText[i]
                } else {
                    result += CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)]
                }
            }
            setDisplay(result)
        }, 60)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [isScrambling, finalText])

    return display
}

export default function VelvetRopeGate({ clearanceCode, setClearanceCode, clearanceStatus, onSubmit, onSwitchToLogin, onClose }: VelvetRopeGateProps) {
    const cipherText = useCipherScramble(
        clearanceStatus === 'checking',
        'DECRYPTING CIPHER...'
    )

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    /* ── The Dark Corridor: warm projector glow bleeds through, vignette presses in ── */
                    background: `
                        radial-gradient(ellipse 50% 40% at 50% 45%, rgba(139, 105, 20, 0.04), transparent),
                        radial-gradient(ellipse 80% 70% at 50% 50%, rgba(10, 7, 3, 0.0), rgba(0, 0, 0, 0.4)),
                        rgba(5, 3, 1, 0.98)
                    `,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                }}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="scanlines"
                    style={{
                        width: '100%', maxWidth: 500,
                        background: `radial-gradient(ellipse at center top, rgba(139, 105, 20, 0.03), transparent 60%), var(--ink)`,
                        border: '1px solid var(--sepia)',
                        borderRadius: '2px',
                        padding: '3rem 2rem',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 0 40px rgba(139,105,20,0.1)',
                        /* ── Clearance bloom — CSS animation triggered by class ── */
                        ...(clearanceStatus === 'granted' ? {
                            animation: 'clearanceBloom 1.5s ease-out forwards',
                        } : {}),
                    }}
                >
                    {/* ── Boosted scanlines overlay for the terminal feel ── */}
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
                        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)',
                        borderRadius: 'inherit',
                    }} />

                    <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--sepia)', cursor: 'pointer', opacity: 0.5, zIndex: 4 }}>
                        <X size={16} />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem', position: 'relative', zIndex: 2 }}>
                        <Lock size={18} color="var(--blood-reel)" />
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.3em', color: 'var(--blood-reel)' }}>RESTRICTED ACCESS</div>
                    </div>

                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '1rem', lineHeight: 1.1, position: 'relative', zIndex: 2 }}>
                        The Archives are currently closed to the public.
                    </h2>
                    <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--fog)', letterSpacing: '0.1em', lineHeight: 1.6, marginBottom: '2.5rem', position: 'relative', zIndex: 2 }}>
                        REELHOUSE IS AN INVITE-ONLY SOCIETY.<br />PLEASE ENTER YOUR CLASSIFIED DOSSIER CLEARANCE CODE TO PROCEED.
                    </p>

                    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 2 }}>
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            borderBottom: `2px solid ${clearanceStatus === 'denied' ? 'var(--blood-reel)' : clearanceStatus === 'granted' ? 'var(--flicker)' : 'var(--ash)'}`,
                            transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
                            /* ── Terminal phosphor glow on focus state ── */
                            boxShadow: clearanceStatus === 'granted' ? '0 2px 20px rgba(196, 150, 26, 0.15)' : 'none',
                        }}>
                            <Terminal size={16} color="var(--fog)" style={{ marginRight: '0.75rem', opacity: 0.5 }} />
                            <input
                                autoFocus
                                placeholder="Enter Access Key..."
                                value={clearanceCode}
                                onChange={e => setClearanceCode(e.target.value.toUpperCase())}
                                style={{
                                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                    color: 'var(--bone)', fontFamily: 'var(--font-ui)', fontSize: '1.2rem',
                                    letterSpacing: '0.2em', padding: '0.75rem 0',
                                    caretColor: 'var(--sepia)',
                                }}
                                disabled={clearanceStatus !== 'idle' && clearanceStatus !== 'denied'}
                            />
                        </div>

                        <div style={{ height: 20, fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', marginTop: '0.5rem' }}>
                            {clearanceStatus === 'checking' && (
                                <span style={{ color: 'var(--fog)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em' }}>
                                    {cipherText || '░░░░░░░░░░░░░░░░░░░░'}
                                </span>
                            )}
                            {clearanceStatus === 'granted' && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.4 }}
                                    style={{ color: 'var(--flicker)', textShadow: '0 0 10px rgba(242, 232, 160, 0.3)' }}
                                >
                                    CLEARANCE GRANTED. INITIATING PROTOCOL.
                                </motion.span>
                            )}
                            {clearanceStatus === 'denied' && (
                                <motion.span
                                    initial={{ x: -4 }}
                                    animate={{ x: 0 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                                    style={{ color: 'var(--blood-reel)' }}
                                >
                                    ACCESS DENIED. INVALID CREDENTIALS.
                                </motion.span>
                            )}
                        </div>
                    </form>

                    <div style={{ marginTop: '3rem', borderTop: '1px dashed rgba(139,105,20,0.2)', paddingTop: '1.5rem', textAlign: 'center', position: 'relative', zIndex: 2 }}>
                        <button onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', textDecoration: 'underline', cursor: 'pointer' }}>
                            ALREADY A MEMBER? SIGN IN
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
