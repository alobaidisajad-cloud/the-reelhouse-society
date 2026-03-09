import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore, useNotificationStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

const REACTIONS = [
    { emoji: '🎬', label: 'Masterpiece' },
    { emoji: '🔥', label: 'Fire' },
    { emoji: '💀', label: 'Devastating' },
    { emoji: '💎', label: 'Hidden Gem' },
    { emoji: '👏', label: 'Encore' },
]

export default function ReactionBar({ logId, logAuthor, filmTitle }) {
    const [hoveredEmoji, setHoveredEmoji] = useState(null)
    const [reactions, setReactions] = useState({})  // { emoji: [username, ...] }
    const [loading, setLoading] = useState(false)
    const user = useAuthStore(s => s.user)
    const isAuthenticated = useAuthStore(s => s.isAuthenticated)
    const pushNotif = useNotificationStore(s => s.push)

    // Fetch existing reactions for this log from Supabase
    useEffect(() => {
        if (!logId || !isSupabaseConfigured) return
        let cancelled = false

        const fetchReactions = async () => {
            const { data, error } = await supabase
                .from('interactions')
                .select('type, user_id, profiles(username)')
                .eq('target_log_id', logId)
                .like('type', 'react_%')

            if (error || cancelled) return

            // Group by emoji
            const grouped = {}
            for (const row of (data || [])) {
                const emoji = row.type.replace('react_', '')
                const username = row.profiles?.username || 'anon'
                if (!grouped[emoji]) grouped[emoji] = []
                grouped[emoji].push(username)
            }
            setReactions(grouped)
        }

        fetchReactions()
        return () => { cancelled = true }
    }, [logId])

    const handleReact = async (emoji) => {
        if (!isAuthenticated || !user || loading) return
        setLoading(true)

        const username = user?.username || 'anonymous'
        const reactionType = `react_${emoji}`
        const usersForEmoji = reactions[emoji] || []
        const alreadyReacted = usersForEmoji.includes(username)

        try {
            if (alreadyReacted) {
                // Remove reaction from Supabase
                await supabase
                    .from('interactions')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('target_log_id', logId)
                    .eq('type', reactionType)

                // Optimistic update
                setReactions(prev => {
                    const updated = { ...prev }
                    updated[emoji] = (updated[emoji] || []).filter(u => u !== username)
                    if (updated[emoji].length === 0) delete updated[emoji]
                    return updated
                })
            } else {
                // Insert reaction into Supabase
                await supabase
                    .from('interactions')
                    .insert([{ user_id: user.id, target_log_id: logId, type: reactionType }])

                // Optimistic update
                setReactions(prev => ({
                    ...prev,
                    [emoji]: [...(prev[emoji] || []), username]
                }))

                // Push notification to log author (via Supabase notifications table)
                if (logAuthor && logAuthor !== username) {
                    // Insert notification into Supabase
                    const { data: authorProfile } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('username', logAuthor)
                        .single()

                    if (authorProfile) {
                        await supabase.from('notifications').insert([{
                            user_id: authorProfile.id,
                            type: 'reaction',
                            from_username: username,
                            message: `${username} reacted ${emoji} to your log of ${filmTitle || 'a film'}`,
                        }]).catch(() => { })  // Graceful if table doesn't exist yet
                    }

                    // Also push locally for immediate feedback
                    pushNotif({
                        type: 'reaction',
                        from: username,
                        message: `${username} reacted ${emoji} to your log of ${filmTitle || 'a film'}`,
                    })
                }
            }
        } catch (err) {
            console.error('[ReactionBar] Error:', err)
        } finally {
            setLoading(false)
        }
    }

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
                            opacity: isAuthenticated ? (loading ? 0.5 : 1) : 0.5,
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
