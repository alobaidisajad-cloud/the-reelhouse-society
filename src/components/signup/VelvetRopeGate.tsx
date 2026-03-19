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

export default function VelvetRopeGate({ clearanceCode, setClearanceCode, clearanceStatus, onSubmit, onSwitchToLogin, onClose }: VelvetRopeGateProps) {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(5, 3, 1, 0.98)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="scanlines"
                    style={{ width: '100%', maxWidth: 500, background: 'var(--ink)', border: '1px solid var(--sepia)', borderRadius: '2px', padding: '3rem 2rem', position: 'relative', overflow: 'hidden', boxShadow: '0 0 40px rgba(139,105,20,0.1)' }}
                >
                    <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--sepia)', cursor: 'pointer', opacity: 0.5 }}>
                        <X size={16} />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                        <Lock size={18} color="var(--blood-reel)" />
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.3em', color: 'var(--blood-reel)' }}>RESTRICTED ACCESS</div>
                    </div>

                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '1rem', lineHeight: 1.1 }}>
                        The Archives are currently closed to the public.
                    </h2>
                    <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--fog)', letterSpacing: '0.1em', lineHeight: 1.6, marginBottom: '2.5rem' }}>
                        REELHOUSE IS AN INVITE-ONLY SOCIETY.<br />PLEASE ENTER YOUR CLASSIFIED DOSSIER CLEARANCE CODE TO PROCEED.
                    </p>

                    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `2px solid ${clearanceStatus === 'denied' ? 'var(--blood-reel)' : clearanceStatus === 'granted' ? 'var(--sepia)' : 'var(--ash)'}`, transition: 'border-color 0.3s' }}>
                            <Terminal size={16} color="var(--fog)" style={{ marginRight: '0.75rem', opacity: 0.5 }} />
                            <input
                                autoFocus
                                placeholder="Enter Access Key..."
                                value={clearanceCode}
                                onChange={e => setClearanceCode(e.target.value.toUpperCase())}
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--bone)', fontFamily: 'var(--font-ui)', fontSize: '1.2rem', letterSpacing: '0.2em', padding: '0.75rem 0' }}
                                disabled={clearanceStatus !== 'idle' && clearanceStatus !== 'denied'}
                            />
                        </div>

                        <div style={{ height: 20, fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', marginTop: '0.5rem' }}>
                            {clearanceStatus === 'checking' && <span style={{ color: 'var(--fog)', animation: 'pulse 1s infinite' }}>DECRYPTING CIPHER...</span>}
                            {clearanceStatus === 'granted' && <span style={{ color: 'var(--sepia)' }}>CLEARANCE GRANTED. INITIATING PROTOCOL.</span>}
                            {clearanceStatus === 'denied' && <span style={{ color: 'var(--blood-reel)' }}>ACCESS DENIED. INVALID CREDENTIALS.</span>}
                        </div>
                    </form>

                    <div style={{ marginTop: '3rem', borderTop: '1px dashed rgba(139,105,20,0.2)', paddingTop: '1.5rem', textAlign: 'center' }}>
                        <button onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', textDecoration: 'underline', cursor: 'pointer' }}>
                            ALREADY A MEMBER? SIGN IN
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
