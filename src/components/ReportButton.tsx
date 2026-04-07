import { useState, useRef, useEffect } from 'react'
import { Flag, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store'
import reelToast from '../utils/reelToast'

interface ReportButtonProps {
    contentType: 'log' | 'list' | 'list_comment' | 'user'
    contentId: string
    size?: number
}

const REASONS = [
    { value: 'spam', label: 'Spam / Promotional', icon: '📧' },
    { value: 'harassment', label: 'Harassment / Hate', icon: '⚠️' },
    { value: 'spoilers', label: 'Unmarked Spoilers', icon: '🎬' },
    { value: 'offensive', label: 'Offensive Content', icon: '🚫' },
    { value: 'other', label: 'Other', icon: '📝' },
] as const

export default function ReportButton({ contentType, contentId, size = 14 }: ReportButtonProps) {
    const { user, isAuthenticated } = useAuthStore()
    const [showModal, setShowModal] = useState(false)
    const [reason, setReason] = useState('')
    const [details, setDetails] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const modalRef = useRef<HTMLDivElement>(null)

    // Don't show if not logged in or if user is reporting their own content
    if (!isAuthenticated || !user) return null

    const handleSubmit = async () => {
        if (!reason) {
            reelToast.error('Please select a reason.')
            return
        }
        setSubmitting(true)
        try {
            const { error } = await supabase.from('reports').insert({
                reporter_id: user.id,
                content_type: contentType,
                content_id: contentId,
                reason,
                details: details.trim(),
            })
            if (error) throw error
            reelToast.success('Report submitted. The Society will review it.')
            setShowModal(false)
            setReason('')
            setDetails('')
        } catch {
            reelToast.error('Failed to submit report. Try again.')
        } finally {
            setSubmitting(false)
        }
    }

    // Close on outside click
    useEffect(() => {
        if (!showModal) return
        const handleClick = (e: PointerEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
                setShowModal(false)
            }
        }
        document.addEventListener('pointerdown', handleClick)
        return () => document.removeEventListener('pointerdown', handleClick)
    }, [showModal])

    return (
        <>
            <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowModal(true) }}
                title="Report content"
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.3rem',
                    color: 'var(--fog)',
                    opacity: 0.5,
                    transition: 'opacity 0.2s, color 0.2s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.55rem',
                    letterSpacing: '0.1em',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger, #c0392b)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--fog)' }}
            >
                <Flag size={size} />
            </button>

            {showModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        background: 'rgba(10,7,3,0.92)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backdropFilter: 'blur(8px)',
                        animation: 'fadeIn 0.2s ease-out',
                    }}
                    onClick={() => setShowModal(false)}
                >
                    <div
                        ref={modalRef}
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'var(--ink, #0a0703)',
                            border: '1px solid rgba(139,105,20,0.4)',
                            borderRadius: '4px',
                            padding: '2rem',
                            maxWidth: 420,
                            width: '90%',
                            position: 'relative',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                        }}
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setShowModal(false)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                background: 'none',
                                border: 'none',
                                color: 'var(--fog)',
                                cursor: 'pointer',
                                padding: '0.25rem',
                            }}
                        >
                            <X size={16} />
                        </button>

                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <AlertTriangle size={20} style={{ color: 'var(--sepia)' }} />
                            <div>
                                <div style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '1.3rem',
                                    color: 'var(--parchment)',
                                    lineHeight: 1.2,
                                }}>
                                    File a Report
                                </div>
                                <div style={{
                                    fontFamily: 'var(--font-ui)',
                                    fontSize: '0.6rem',
                                    letterSpacing: '0.15em',
                                    color: 'var(--fog)',
                                    marginTop: '0.25rem',
                                }}>
                                    THE TRIBUNAL WILL REVIEW THIS
                                </div>
                            </div>
                        </div>

                        {/* Reason picker */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                            {REASONS.map(r => (
                                <button
                                    key={r.value}
                                    onClick={() => setReason(r.value)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.7rem 1rem',
                                        background: reason === r.value ? 'rgba(139,105,20,0.15)' : 'rgba(22,18,12,0.5)',
                                        border: reason === r.value ? '1px solid var(--sepia)' : '1px solid rgba(139,105,20,0.15)',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        color: reason === r.value ? 'var(--parchment)' : 'var(--bone, #c9b89d)',
                                        fontFamily: 'var(--font-sub)',
                                        fontSize: '0.85rem',
                                        textAlign: 'left',
                                    }}
                                >
                                    <span style={{ fontSize: '1rem' }}>{r.icon}</span>
                                    {r.label}
                                </button>
                            ))}
                        </div>

                        {/* Details textarea */}
                        <textarea
                            value={details}
                            onChange={e => setDetails(e.target.value)}
                            placeholder="Additional context (optional)..."
                            maxLength={500}
                            style={{
                                width: '100%',
                                minHeight: 70,
                                background: 'rgba(22,18,12,0.6)',
                                border: '1px solid rgba(139,105,20,0.2)',
                                borderRadius: '3px',
                                padding: '0.75rem',
                                resize: 'vertical',
                                fontFamily: 'var(--font-sub)',
                                fontSize: '0.85rem',
                                color: 'var(--parchment)',
                                outline: 'none',
                                marginBottom: '1.5rem',
                                boxSizing: 'border-box',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = 'rgba(139,105,20,0.5)'}
                            onBlur={e => e.currentTarget.style.borderColor = 'rgba(139,105,20,0.2)'}
                        />

                        {/* Submit */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowModal(false)}
                                className="btn btn-ghost"
                                style={{ flex: 1, justifyContent: 'center' }}
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!reason || submitting}
                                className="btn"
                                style={{
                                    flex: 1,
                                    justifyContent: 'center',
                                    background: reason ? 'rgba(139,105,20,0.2)' : 'rgba(22,18,12,0.5)',
                                    color: reason ? 'var(--sepia)' : 'var(--fog)',
                                    border: `1px solid ${reason ? 'var(--sepia)' : 'rgba(139,105,20,0.15)'}`,
                                    opacity: submitting ? 0.5 : 1,
                                    cursor: reason ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
