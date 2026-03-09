import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore, useNotificationStore } from '../store'

const REACTIONS = [
    { emoji: '🎬', label: 'Masterpiece' },
    { emoji: '🔥', label: 'Fire' },
    { emoji: '💀', label: 'Devastating' },
    { emoji: '💎', label: 'Hidden Gem' },
    { emoji: '👏', label: 'Encore' },
]

export default function ReactionBar({ logId, logAuthor, filmTitle, reactions = {}, onReact }) {
    const [hoveredEmoji, setHoveredEmoji] = useState(null)
    const user = useAuthStore(s => s.user)
    const isAuthenticated = useAuthStore(s => s.isAuthenticated)
    const pushNotif = useNotificationStore(s => s.push)

    const handleReact = (emoji) => {
        if (!isAuthenticated) return
        const username = user?.username || 'anonymous'

        // Toggle reaction
        const currentReactions = { ...reactions }
        const users = currentReactions[emoji] || []
        const alreadyReacted = users.includes(username)

        if (alreadyReacted) {
            currentReactions[emoji] = users.filter(u => u !== username)
            if (currentReactions[emoji].length === 0) delete currentReactions[emoji]
        } else {
            currentReactions[emoji] = [...users, username]
            // Push notification to log author
            if (logAuthor && logAuthor !== username) {
                pushNotif({
                    type: 'reaction',
                    from: username,
                    message: `${username} reacted ${emoji} to your log of ${filmTitle || 'a film'}`,
                })
            }
        }

        if (onReact) onReact(logId, currentReactions)
    }

    const totalReactions = Object.values(reactions).reduce((sum, arr) => sum + arr.length, 0)

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            {REACTIONS.map(r => {
                const users = reactions[r.emoji] || []
                const count = users.length
                const iReacted = user && users.includes(user.username)

                return (
                    <motion.button
                        key={r.emoji}
                        whileTap={{ scale: 1.3 }}
                        whileHover={{ scale: 1.1 }}
                        onClick={() => handleReact(r.emoji)}
                        onMouseEnter={() => setHoveredEmoji(r.emoji)}
                        onMouseLeave={() => setHoveredEmoji(null)}
                        title={r.label}
                        style={{
                            position: 'relative',
                            background: iReacted ? 'rgba(139,105,20,0.15)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${iReacted ? 'rgba(139,105,20,0.4)' : 'rgba(255,255,255,0.06)'}`,
                            borderRadius: '100px',
                            padding: '0.2em 0.5em',
                            cursor: isAuthenticated ? 'pointer' : 'default',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3em',
                            transition: 'all 0.2s',
                            opacity: isAuthenticated ? 1 : 0.5,
                        }}
                    >
                        <span>{r.emoji}</span>
                        {count > 0 && (
                            <span style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.55rem',
                                color: iReacted ? 'var(--flicker)' : 'var(--fog)',
                                letterSpacing: '0.05em',
                            }}>
                                {count}
                            </span>
                        )}

                        {/* Tooltip */}
                        <AnimatePresence>
                            {hoveredEmoji === r.emoji && count > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 6 }}
                                    style={{
                                        position: 'absolute',
                                        bottom: 'calc(100% + 6px)',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'var(--soot)',
                                        border: '1px solid var(--ash)',
                                        borderRadius: '4px',
                                        padding: '0.3rem 0.5rem',
                                        whiteSpace: 'nowrap',
                                        fontFamily: 'var(--font-sub)',
                                        fontSize: '0.65rem',
                                        color: 'var(--bone)',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                                        zIndex: 10,
                                    }}
                                >
                                    {users.slice(0, 3).join(', ')}{users.length > 3 ? ` +${users.length - 3}` : ''}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.button>
                )
            })}
        </div>
    )
}
