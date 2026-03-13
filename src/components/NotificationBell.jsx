import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Check } from 'lucide-react'
import { useNotificationStore, useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

const NOTIF_ICONS = {
    follow: '👤',
    reaction: '🎬',
    endorse: '🔥',
    system: '✦',
}

const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
}

export default function NotificationBell() {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    const navigate = useNavigate()
    const user = useAuthStore(s => s.user)
    const notifications = useNotificationStore(s => s.notifications)
    const setNotifications = useNotificationStore(s => s.setNotifications)
    const markAllRead = useNotificationStore(s => s.markAllRead)
    const dismiss = useNotificationStore(s => s.dismiss)
    const markRead = useNotificationStore(s => s.markRead)
    const unreadCount = notifications.filter(n => !n.read).length

    // Fetch notifications from Supabase on mount
    useEffect(() => {
        if (!user?.id || !isSupabaseConfigured) return
        let cancelled = false

        const fetchNotifs = async () => {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error && data && !cancelled) {
                const formatted = data.map(n => ({
                    id: n.id,
                    type: n.type || 'system',
                    from: n.from_username || '',
                    message: n.message || '',
                    read: n.is_read || false,
                    timestamp: n.created_at,
                }))
                setNotifications(formatted)
            }
        }

        fetchNotifs()

        // Realtime subscription for new notifications
        const channel = supabase
            .channel(`notifications_${user.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    const n = payload.new
                    useNotificationStore.getState().push({
                        id: n.id,
                        type: n.type || 'system',
                        from: n.from_username || '',
                        message: n.message || '',
                    })
                }
            )
            .subscribe()

        return () => {
            cancelled = true
            supabase.removeChannel(channel)
        }
    }, [user?.id])

    // Close on outside click
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Mark as read in Supabase when panel opens
    const handleOpen = async () => {
        setOpen(v => !v)
        if (!open && unreadCount > 0 && user?.id) {
            markAllRead()
            // Batch update in Supabase — column is `is_read`
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id)
                .eq('is_read', false)
                .catch(() => { })  // Graceful if table missing
        }
    }

    const handleDismiss = async (id) => {
        dismiss(id)
        await supabase.from('notifications').delete().eq('id', id).catch(() => { })
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                className="nav-icon-btn"
                onClick={handleOpen}
                title="Notifications"
                style={{ position: 'relative', color: unreadCount > 0 ? 'var(--flicker)' : 'var(--fog)' }}
            >
                <Bell size={17} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute', top: -2, right: -4,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'var(--blood-reel)',
                        color: '#fff', fontSize: '0.55rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-ui)', fontWeight: 'bold',
                        boxShadow: '0 2px 8px rgba(162,36,36,0.6)',
                        animation: 'nav-log-pulse 2s ease-in-out infinite'
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        style={{
                            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                            width: 320, maxHeight: 400, overflow: 'auto',
                            background: 'rgba(18,14,9,0.98)',
                            border: '1px solid var(--ash)',
                            borderRadius: 'var(--radius-card)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(139,105,20,0.1)',
                            zIndex: 9999,
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.75rem 1rem',
                            borderBottom: '1px solid var(--ash)',
                        }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>
                                NOTIFICATIONS
                            </span>
                            {notifications.length > 0 && (
                                <button
                                    onClick={async () => {
                                        markAllRead()
                                        if (user?.id) {
                                            await supabase.from('notifications').update({ is_read: true })
                                                .eq('user_id', user.id).eq('is_read', false).catch(() => {})
                                        }
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fog)', fontSize: '0.55rem', fontFamily: 'var(--font-ui)', letterSpacing: '0.1em' }}
                                >
                                    <Check size={12} /> MARK ALL
                                </button>
                            )}
                        </div>

                        {/* List */}
                        {notifications.length === 0 ? (
                            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-sub)', fontSize: '0.85rem' }}>
                                No notifications yet.
                                <div style={{ fontSize: '0.7rem', marginTop: '0.5rem', opacity: 0.5 }}>The projector booth is quiet.</div>
                            </div>
                        ) : (
                            notifications.slice(0, 20).map(n => (
                                <div
                                    key={n.id}
                                    onClick={async () => {
                                        markRead(n.id)
                                        // Sync read status to DB
                                        supabase.from('notifications').update({ is_read: true }).eq('id', n.id).catch(() => {})
                                        // Deep link: navigate to relevant page
                                        if (n.type === 'follow' && n.from) {
                                            navigate(`/user/${n.from}`)
                                            setOpen(false)
                                        } else if (n.type === 'reaction') {
                                            navigate('/feed')
                                            setOpen(false)
                                        }
                                    }}
                                    style={{
                                        display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem',
                                        borderBottom: '1px solid rgba(139,105,20,0.06)',
                                        background: n.read ? 'transparent' : 'rgba(139,105,20,0.04)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(139,105,20,0.04)'}
                                >
                                    <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{NOTIF_ICONS[n.type] || '✦'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontFamily: 'var(--font-sub)', fontSize: '0.8rem',
                                            color: n.read ? 'var(--bone)' : 'var(--parchment)',
                                            lineHeight: 1.4,
                                        }}>
                                            {n.message}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', marginTop: '0.25rem', letterSpacing: '0.08em' }}>
                                            {timeAgo(n.timestamp)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDismiss(n.id) }}
                                        style={{ background: 'none', border: 'none', color: 'var(--ash)', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
