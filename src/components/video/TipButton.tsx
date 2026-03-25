import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, X } from 'lucide-react'
import { useAuthStore, useUIStore } from '../../store'
import { useVideoStore } from '../../stores/video'
import toast from 'react-hot-toast'

interface TipButtonProps {
    videoId: string
    creatorUserId: string
    creatorUsername: string
}

const PRESETS = [
    { amount: 1, label: '$1' },
    { amount: 3, label: '$3' },
    { amount: 5, label: '$5' },
]

export default function TipButton({ videoId, creatorUserId, creatorUsername }: TipButtonProps) {
    const { user, isAuthenticated } = useAuthStore()
    const { openSignupModal } = useUIStore()
    const { sendTip } = useVideoStore()
    const [open, setOpen] = useState(false)
    const [selectedAmount, setSelectedAmount] = useState(3)
    const [customAmount, setCustomAmount] = useState('')
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)

    const isOwnVideo = user?.id === creatorUserId

    const handleTip = async () => {
        if (!isAuthenticated) { openSignupModal(); return }
        if (isOwnVideo) { toast.error("You can't tip your own video."); return }
        
        const amount = customAmount ? parseFloat(customAmount) : selectedAmount
        if (!amount || amount <= 0 || amount > 100) {
            toast.error('Enter a valid amount ($0.50 – $100)')
            return
        }

        setSending(true)
        const ok = await sendTip({
            fromUserId: user!.id,
            fromUsername: user!.username,
            toUserId: creatorUserId,
            videoId,
            amount,
            message: message.trim() || undefined,
        })
        setSending(false)

        if (ok) {
            toast.success(`$${amount.toFixed(2)} sent to @${creatorUsername} ✦`, { icon: '💰' })
            setOpen(false)
            setMessage('')
            setCustomAmount('')
        } else {
            toast.error('Tip failed. Please try again.')
        }
    }

    if (isOwnVideo) return null

    return (
        <>
            <button
                onClick={() => {
                    if (!isAuthenticated) { openSignupModal(); return }
                    setOpen(true)
                }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.7rem 1.5rem',
                    background: 'linear-gradient(135deg, rgba(139,105,20,0.2), rgba(200,160,40,0.1))',
                    border: '1px solid rgba(139,105,20,0.5)',
                    color: 'var(--flicker)',
                    fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em',
                    cursor: 'pointer', borderRadius: '2px', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,105,20,0.3)'; e.currentTarget.style.borderColor = 'var(--sepia)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139,105,20,0.2), rgba(200,160,40,0.1))'; e.currentTarget.style.borderColor = 'rgba(139,105,20,0.5)' }}
            >
                <Heart size={14} /> ✦ SUPPORT THIS CRITIC
            </button>

            <AnimatePresence>
                {open && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,3,1,0.95)', padding: '1rem' }} onClick={() => setOpen(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', borderRadius: '2px', padding: '2rem', width: '100%', maxWidth: 400, position: 'relative' }}
                        >
                            <button onClick={() => setOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>

                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                                SUPPORT THE ARCHIVIST
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginBottom: '1.5rem' }}>
                                Tip @{creatorUsername}
                            </div>

                            {/* Preset amounts */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                {PRESETS.map(p => (
                                    <button
                                        key={p.amount}
                                        onClick={() => { setSelectedAmount(p.amount); setCustomAmount('') }}
                                        style={{
                                            flex: 1, padding: '0.75rem',
                                            background: selectedAmount === p.amount && !customAmount ? 'var(--sepia)' : 'var(--ink)',
                                            border: `1px solid ${selectedAmount === p.amount && !customAmount ? 'var(--flicker)' : 'var(--ash)'}`,
                                            color: selectedAmount === p.amount && !customAmount ? 'var(--ink)' : 'var(--parchment)',
                                            fontFamily: 'var(--font-display)', fontSize: '1.2rem',
                                            cursor: 'pointer', borderRadius: '2px', transition: 'all 0.15s',
                                        }}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            {/* Custom amount */}
                            <input
                                type="number"
                                className="input"
                                placeholder="Custom amount..."
                                value={customAmount}
                                onChange={e => { setCustomAmount(e.target.value); setSelectedAmount(0) }}
                                style={{ width: '100%', marginBottom: '1rem', textAlign: 'center', fontSize: '1rem' }}
                                step="0.50"
                                min="0.50"
                                max="100"
                            />

                            {/* Optional message */}
                            <textarea
                                className="input"
                                placeholder="Leave a note (optional)..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                style={{ width: '100%', minHeight: 60, marginBottom: '1.5rem', resize: 'none' }}
                                maxLength={200}
                            />

                            <button
                                className="btn btn-primary"
                                onClick={handleTip}
                                disabled={sending}
                                style={{ width: '100%', justifyContent: 'center', padding: '0.9rem', fontSize: '0.75rem', letterSpacing: '0.2em', opacity: sending ? 0.6 : 1 }}
                            >
                                {sending ? 'SENDING...' : `SEND $${(customAmount ? parseFloat(customAmount) || 0 : selectedAmount).toFixed(2)} ✦`}
                            </button>

                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', color: 'var(--fog)', textAlign: 'center', marginTop: '0.75rem', opacity: 0.6 }}>
                                TIPS ARE NON-REFUNDABLE · 85% GOES TO THE CREATOR
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    )
}
