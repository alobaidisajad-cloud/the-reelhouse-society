import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

// Premium monochrome thematic glyphs — no colorful Unicode emojis
const REACTIONS = [
    { emoji: '✦', label: 'Masterpiece' },
    { emoji: '†', label: 'Devastating' },
    { emoji: '◈', label: 'Hidden Gem' },
    { emoji: '∞', label: 'Timeless' },
    { emoji: '⌀', label: 'Void' },
]

export default function ReactionBar({ logId, logAuthor, filmTitle, cachedReactions, onReactionChange }: {
    logId: string;
    logAuthor?: string;
    filmTitle?: string;
    /** Pre-fetched reactions from useBatchReactions — if provided, skips independent fetch */
    cachedReactions?: Record<string, string[]>;
    /** Callback when a reaction changes — parent can refresh batch data */
    onReactionChange?: () => void;
}) {
    const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null)
    const [reactions, setReactions] = useState<Record<string, string[]>>({})  // { emoji: [username, ...] }
    const [loading, setLoading] = useState(false)
    const user = useAuthStore(s => s.user)
    const isAuthenticated = useAuthStore(s => s.isAuthenticated)

    // If parent provides cached data, use it; otherwise fetch independently
    useEffect(() => {
        if (cachedReactions) {
            setReactions(cachedReactions)
            return
        }
    }, [cachedReactions])

    // Independent fetch — only runs if no cached data provided
    useEffect(() => {
        if (cachedReactions || !logId || !isSupabaseConfigured) return
        let cancelled = false

        const fetchReactions = async () => {
            const { data, error } = await supabase
                .from('interactions')
                .select('type, user_id')
                .eq('target_log_id', logId)
                .like('type', 'react_%')

            if (error || cancelled) return

            // Batch resolve usernames
            const userIds = [...new Set((data || []).map(r => r.user_id).filter(Boolean))]
            let usernameMap: Record<string, string> = {}
            if (userIds.length > 0) {
                const { data: profilesData } = await supabase
                    .from('profiles').select('id, username').in('id', userIds)
                if (profilesData) usernameMap = Object.fromEntries(profilesData.map((p: any) => [p.id, p.username]))
            }

            // Group by emoji
            const grouped: Record<string, string[]> = {}
            for (const row of (data || [])) {
                const emoji = row.type.replace('react_', '')
                const username = usernameMap[row.user_id] || 'anon'
                if (!grouped[emoji]) grouped[emoji] = []
                grouped[emoji].push(username)
            }
            if (!cancelled) setReactions(grouped)
        }

        fetchReactions()
        return () => { cancelled = true }
    }, [logId, cachedReactions])

    const handleReact = async (emoji: string) => {
        if (!isAuthenticated || !user || loading) return
        setLoading(true)

        const username = user?.username || 'anonymous'
        const reactionType = `react_${emoji}`
        const usersForEmoji = reactions[emoji] || []
        const alreadyReacted = usersForEmoji.includes(username)

        // Save snapshot for rollback
        const snapshot = { ...reactions }

        try {
            if (alreadyReacted) {
                // Optimistic update FIRST
                setReactions((prev: Record<string, string[]>) => {
                    const updated = { ...prev }
                    updated[emoji] = (updated[emoji] || []).filter((u: string) => u !== username)
                    if (updated[emoji].length === 0) delete updated[emoji]
                    return updated
                })

                // Then persist to Supabase
                const { error } = await supabase
                    .from('interactions')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('target_log_id', logId)
                    .eq('type', reactionType)

                if (error) throw error
            } else {
                // Optimistic update FIRST
                setReactions(prev => ({
                    ...prev,
                    [emoji]: [...(prev[emoji] || []), username]
                }))

                // Then persist to Supabase
                const { error } = await supabase
                    .from('interactions')
                    .insert([{ user_id: user.id, target_log_id: logId, type: reactionType }])

                if (error) throw error

                // Push notification to log author (background — non-blocking)
                if (logAuthor && logAuthor !== username) {
                    supabase
                        .from('profiles')
                        .select('id')
                        .eq('username', logAuthor)
                        .single()
                        .then(({ data: authorProfile }) => {
                            if (authorProfile) {
                                supabase.from('notifications').insert({
                                    user_id: authorProfile.id,
                                    type: 'reaction',
                                    from_username: username,
                                    message: `@${username} reacted ${emoji} to your log of ${filmTitle || 'a film'}`,
                                    is_read: false,
                                })
                            }
                        })
                }
            }
            // Notify parent to refresh batch data if available
            onReactionChange?.()
        } catch {
            // Rollback to snapshot on failure
            setReactions(snapshot)
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
                        whileTap={{ scale: 0.8 }}
                        whileHover={{ scale: 1.15, transition: { type: 'spring', stiffness: 400, damping: 10 } }}
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
                                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                    style={{
                                        position: 'absolute',
                                        bottom: 'calc(100% + 8px)',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)',
                                        border: '1px solid rgba(139,105,20,0.3)',
                                        borderRadius: '4px',
                                        padding: '0.4rem 0.6rem',
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
