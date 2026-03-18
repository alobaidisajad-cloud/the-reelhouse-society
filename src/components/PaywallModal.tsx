import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock, Database, Briefcase, Zap, ShieldAlert } from 'lucide-react'
import { useUIStore, useAuthStore } from '../store'
import toast from 'react-hot-toast'
import { useFocusTrap } from '../hooks/useFocusTrap'

export default function PaywallModal({ featureName, onClose }) {
    const { user, updateUser } = useAuthStore()
    const focusTrapRef = useFocusTrap(true, onClose)

    const handleUpgrade = (tier) => {
        // Stripe Checkout logic goes here
        toast(`Mock Checkout Initialized for ${tier?.toUpperCase()} TIER`)
        setTimeout(() => {
            updateUser({ membershipTier: tier })
            toast.success(`CLEARANCE UPGRADED TO ${tier?.toUpperCase()}`)
            onClose()
        }, 1500)
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
                    initial={{ scale: 0.9, opacity: 0, y: 40 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={e => e.stopPropagation()}
                    style={{ background: 'var(--soot)', border: '1px solid var(--blood-reel)', borderRadius: '4px', maxWidth: 800, width: '100%', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(92,26,11,0.5)', display: 'flex', flexDirection: 'column' }}
                >
                    <div style={{ padding: '2rem 2rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px dashed var(--ash)', background: 'radial-gradient(ellipse at top right, rgba(92,26,11,0.15), transparent 60%)' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                <ShieldAlert size={20} color="var(--blood-reel)" />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.3em', color: 'var(--blood-reel)' }}>RESTRICTED SECTOR</div>
                            </div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', color: 'var(--parchment)', lineHeight: 1.1, margin: 0 }}>
                                {featureName || 'Advanced Clearance Required'}
                            </h2>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--fog)', marginTop: '0.75rem', maxWidth: 500, lineHeight: 1.6 }}>
                                You are attempting to access a Level 2 Intelligence Asset. The basic clearance only grants access to standard logging and community feeds.
                            </p>
                        </div>
                        <button onClick={onClose} style={{ background: 'var(--ink)', border: '1px solid var(--ash)', color: 'var(--bone)', padding: '0.5rem', cursor: 'pointer', borderRadius: '4px' }}>
                            <X size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: 'var(--ash)' }}>
                        {/* Archivist Tier */}
                        <div style={{ background: 'var(--soot)', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <Database size={16} color="var(--sepia)" />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>THE ARCHIVIST</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--bone)', marginBottom: '0.2rem' }}>$1.99<span style={{ fontSize: '0.9rem', color: 'var(--fog)', fontFamily: 'var(--font-body)' }}>/mo</span></div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', minHeight: 40, marginBottom: '1.5rem' }}>For collectors digitizing their physical media vaults.</p>

                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                                {[
                                    'Unlimited Physical Media Tracking',
                                    'The Director Autopsy Radar',
                                    'Clone other users\' Lists',
                                    'No incoming transmission ads'
                                ].map(f => (
                                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                                        <Lock size={12} color="var(--sepia)" style={{ marginTop: 2 }} /> {f}
                                    </li>
                                ))}
                            </ul>

                            <button className="btn" style={{ width: '100%', marginTop: '2rem', background: 'var(--ink)', borderColor: 'var(--sepia)', color: 'var(--sepia)' }} onClick={() => handleUpgrade('archivist')}>
                                INITIATE PAYMENT
                            </button>
                        </div>

                        {/* Auteur Tier */}
                        <div style={{ background: 'linear-gradient(135deg, var(--soot) 0%, #2a1f10 100%)', padding: '2rem', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'var(--flicker)', color: 'var(--ink)', padding: '0.2rem 0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', borderRadius: '2px' }}>MAXIMUM CLEARANCE</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <Zap size={16} color="var(--flicker)" />
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--flicker)' }}>THE AUTEUR</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--parchment)', marginBottom: '0.2rem' }}>$4.99<span style={{ fontSize: '0.9rem', color: 'var(--fog)', fontFamily: 'var(--font-body)' }}>/mo</span></div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', minHeight: 40, marginBottom: '1.5rem' }}>For professional critics and venue operators.</p>

                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                                {[
                                    'Everything in ARCHIVIST',
                                    'B2B Venue Operations Link',
                                    'Deep Box Office Analytics',
                                    'Early access to beta operations',
                                    'Auteur Black Card Profile Badge'
                                ].map(f => (
                                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                                        <CheckCircle2 size={12} color="var(--flicker)" style={{ marginTop: 2 }} /> {f}
                                    </li>
                                ))}
                            </ul>

                            <button className="btn" style={{ width: '100%', marginTop: '2rem', background: 'var(--flicker)', borderColor: 'var(--flicker)', color: 'var(--ink)', fontWeight: 'bold' }} onClick={() => handleUpgrade('auteur')}>
                                SECURE ASSET NOW
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

function CheckCircle2({ size, color, style }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
    )
}
