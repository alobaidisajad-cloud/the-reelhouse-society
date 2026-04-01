/**
 * ShareToLoungeModal — Share films, logs, people, or lists to a Lounge room.
 * Opens as a cinematic overlay with the user's joined lounges listed.
 * One tap shares the content as a rich embedded card in the conversation.
 */
import { useState, useEffect } from 'react'
import { X, MessageCircle, Send, Users, Check, Lock } from 'lucide-react'
import { useLoungeStore } from '../stores/lounge'
import type { Lounge } from '../stores/lounge'

export type ShareType = 'film_share' | 'log_share' | 'person_share' | 'list_share'

export interface SharePayload {
    type: ShareType
    title: string       // Display title (film name, person name, list title)
    subtitle?: string   // Year, role, film count, etc.
    image?: string      // Poster/photo URL
    metadata: Record<string, any>  // Full metadata for the embedded card
}

interface Props {
    payload: SharePayload
    onClose: () => void
}

export default function ShareToLoungeModal({ payload, onClose }: Props) {
    const { myLounges, fetchMyLounges, sendMessage, openLounge, closeLounge, activeLounge } = useLoungeStore()
    const [sentTo, setSentTo] = useState<string | null>(null)
    const [sending, setSending] = useState<string | null>(null)

    useEffect(() => {
        fetchMyLounges()
    }, [])

    const handleShare = async (lounge: Lounge) => {
        if (sending) return
        setSending(lounge.id)

        try {
            // Build the dispatch message
            const caption = payload.type === 'film_share'
                ? `🎬 ${payload.title}${payload.subtitle ? ` (${payload.subtitle})` : ''}`
                : payload.type === 'person_share'
                    ? `🎭 ${payload.title}${payload.subtitle ? ` — ${payload.subtitle}` : ''}`
                    : payload.type === 'list_share'
                        ? `📋 ${payload.title}${payload.subtitle ? ` · ${payload.subtitle}` : ''}`
                        : `📝 ${payload.title}`

            // We need to open the lounge channel to send, then restore previous state
            const previousLoungeId = activeLounge?.id
            await openLounge(lounge.id)
            await sendMessage(caption, payload.type, payload.metadata)

            // Restore previous active lounge or close
            if (previousLoungeId && previousLoungeId !== lounge.id) {
                await openLounge(previousLoungeId)
            } else if (!previousLoungeId) {
                closeLounge()
            }

            setSentTo(lounge.id)
            setTimeout(() => onClose(), 1200)
        } catch (err) {
            console.error('Share to lounge failed:', err)
        } finally {
            setSending(null)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div
                className="modal-card"
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: 420,
                    padding: 0,
                    overflow: 'hidden',
                    animation: 'fadeSlideUp 0.3s ease-out',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid rgba(139,105,20,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <MessageCircle size={16} color="var(--sepia)" />
                        <span style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.65rem',
                            letterSpacing: '0.2em',
                            color: 'var(--sepia)',
                        }}>
                            SHARE TO LOUNGE
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--fog)',
                            cursor: 'pointer',
                            padding: '0.25rem',
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Preview of what's being shared */}
                <div style={{
                    padding: '1rem 1.5rem',
                    background: 'rgba(139,105,20,0.04)',
                    borderBottom: '1px solid rgba(139,105,20,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.9rem',
                }}>
                    {payload.image && (
                        <div style={{
                            width: 44,
                            height: payload.type === 'film_share' ? 66 : 44,
                            borderRadius: payload.type === 'person_share' ? '50%' : '3px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            border: '1px solid rgba(139,105,20,0.3)',
                        }}>
                            <img
                                src={payload.image}
                                alt={payload.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            fontFamily: 'var(--font-sub)',
                            fontSize: '0.85rem',
                            color: 'var(--parchment)',
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {payload.title}
                        </div>
                        {payload.subtitle && (
                            <div style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.5rem',
                                letterSpacing: '0.1em',
                                color: 'var(--fog)',
                                marginTop: '0.2rem',
                            }}>
                                {payload.subtitle}
                            </div>
                        )}
                    </div>
                </div>

                {/* Lounge list */}
                <div style={{
                    maxHeight: 300,
                    overflowY: 'auto',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'var(--ash) transparent',
                }}>
                    {myLounges.length === 0 ? (
                        <div style={{
                            padding: '2.5rem 1.5rem',
                            textAlign: 'center',
                        }}>
                            <MessageCircle size={28} color="var(--ash)" style={{ marginBottom: '0.75rem' }} />
                            <div style={{
                                fontFamily: 'var(--font-sub)',
                                fontSize: '0.85rem',
                                color: 'var(--fog)',
                                marginBottom: '0.3rem',
                            }}>
                                No Lounges Yet
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.5rem',
                                letterSpacing: '0.1em',
                                color: 'var(--ash)',
                            }}>
                                Join or create a lounge to share content
                            </div>
                        </div>
                    ) : (
                        myLounges.map(lounge => {
                            const isSent = sentTo === lounge.id
                            const isSending = sending === lounge.id

                            return (
                                <button
                                    key={lounge.id}
                                    onClick={() => handleShare(lounge)}
                                    disabled={!!sending || isSent}
                                    style={{
                                        width: '100%',
                                        padding: '0.9rem 1.5rem',
                                        background: isSent
                                            ? 'rgba(139,105,20,0.08)'
                                            : 'transparent',
                                        border: 'none',
                                        borderBottom: '1px solid rgba(139,105,20,0.06)',
                                        cursor: sending ? 'wait' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.9rem',
                                        textAlign: 'left',
                                        transition: 'background 0.2s',
                                        opacity: sending && !isSending ? 0.5 : 1,
                                    }}
                                    onMouseEnter={e => {
                                        if (!sending && !isSent) e.currentTarget.style.background = 'rgba(139,105,20,0.06)'
                                    }}
                                    onMouseLeave={e => {
                                        if (!isSent) e.currentTarget.style.background = 'transparent'
                                    }}
                                >
                                    {/* Lounge avatar */}
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '8px',
                                        background: 'linear-gradient(135deg, rgba(139,105,20,0.2), rgba(10,7,3,0.8))',
                                        border: '1px solid rgba(139,105,20,0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        overflow: 'hidden',
                                    }}>
                                        {lounge.cover_image ? (
                                            <img
                                                src={`https://image.tmdb.org/t/p/w185${lounge.cover_image}`}
                                                alt=""
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(0.3) brightness(0.7)' }}
                                            />
                                        ) : (
                                            <MessageCircle size={14} color="var(--sepia)" />
                                        )}
                                    </div>

                                    {/* Lounge info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontFamily: 'var(--font-sub)',
                                            fontSize: '0.8rem',
                                            color: 'var(--parchment)',
                                            lineHeight: 1.2,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                        }}>
                                            {lounge.is_private && <Lock size={10} color="var(--fog)" />}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {lounge.name}
                                            </span>
                                        </div>
                                        <div style={{
                                            fontFamily: 'var(--font-ui)',
                                            fontSize: '0.45rem',
                                            letterSpacing: '0.1em',
                                            color: 'var(--fog)',
                                            marginTop: '0.15rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                        }}>
                                            <Users size={9} />
                                            {lounge.member_count} {lounge.member_count === 1 ? 'member' : 'members'}
                                        </div>
                                    </div>

                                    {/* Send indicator */}
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: isSent
                                            ? 'rgba(139,105,20,0.3)'
                                            : 'rgba(139,105,20,0.1)',
                                        border: `1px solid ${isSent ? 'var(--sepia)' : 'rgba(139,105,20,0.2)'}`,
                                        transition: 'all 0.3s',
                                    }}>
                                        {isSent ? (
                                            <Check size={14} color="var(--flicker)" />
                                        ) : isSending ? (
                                            <div style={{
                                                width: 12,
                                                height: 12,
                                                border: '2px solid var(--sepia)',
                                                borderTopColor: 'transparent',
                                                borderRadius: '50%',
                                                animation: 'spin 0.8s linear infinite',
                                            }} />
                                        ) : (
                                            <Send size={12} color="var(--sepia)" />
                                        )}
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
