import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Check, Trash2 } from 'lucide-react'
import { useNotificationStore, useAuthStore } from '../store'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { Portal } from './UI'
import { useViewport } from '../hooks/useViewport'

const NOTIF_ICONS: Record<string, string> = {
    follow: '◆',
    reaction: '✧',
    endorse: '✦',
    system: '§',
    annotate: '¶',
    achievement: '◈',
}

const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d`
    return `${Math.floor(days / 30)}mo`
}

interface NotificationBellProps {
    isOpen?: boolean
    onOpenChange?: (open: boolean) => void
}

// ─── Singleton guard: only one realtime channel across all mounts ───
let _globalChannel: any = null
let _globalUserId: string | null = null

export default function NotificationBell({ isOpen, onOpenChange }: NotificationBellProps = {}) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = isOpen !== undefined ? isOpen : internalOpen
    const setOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
        const resolve = (prev: boolean) => typeof val === 'function' ? val(prev) : val
        if (onOpenChange) onOpenChange(resolve(open))
        else setInternalOpen(val)
    }, [onOpenChange, open])

    const ref = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()
    const user = useAuthStore(s => s.user)
    const notifications = useNotificationStore(s => s.notifications)
    const setNotifications = useNotificationStore(s => s.setNotifications)
    const markAllRead = useNotificationStore(s => s.markAllRead)
    const dismiss = useNotificationStore(s => s.dismiss)
    const markRead = useNotificationStore(s => s.markRead)
    const unreadCount = notifications.filter(n => !n.read).length
    const { isTouch } = useViewport()

    // ══════════════════════════════════════
    //  FETCH + REALTIME (singleton channel)
    // ══════════════════════════════════════
    useEffect(() => {
        if (!user?.id || !isSupabaseConfigured) return
        let cancelled = false

        // Fetch existing notifications from DB
        const fetchNotifs = async () => {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50)

            if (!error && data && !cancelled) {
                const formatted = data.map((n: any) => ({
                    id: n.id,
                    type: n.type || 'system',
                    from: n.from_username || '',
                    message: n.message || '',
                    read: !!n.read,
                    timestamp: n.created_at,
                }))
                setNotifications(formatted)
            }
        }

        fetchNotifs()

        // Only create ONE global channel — tear down if userId changed
        if (_globalUserId !== user.id) {
            if (_globalChannel) {
                supabase.removeChannel(_globalChannel)
                _globalChannel = null
            }
            _globalUserId = user.id

            _globalChannel = supabase
                .channel(`notif_bell_${user.id}`)
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                    (payload: any) => {
                        const n = payload.new
                        useNotificationStore.getState().push({
                            id: n.id,
                            type: n.type || 'system',
                            from: n.from_username || '',
                            message: n.message || '',
                            read: false,
                            timestamp: n.created_at,
                        })
                    }
                )
                .subscribe()
        }

        return () => { cancelled = true }
    }, [user?.id])

    // Close on outside click (desktop only)
    useEffect(() => {
        if (isTouch) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [isTouch, setOpen])

    // ══════════════════════════════════════
    //  MARK ALL READ — zustand + Supabase
    // ══════════════════════════════════════
    const handleMarkAllRead = useCallback(async () => {
        markAllRead()
        if (user?.id) {
            await supabase
                .from('notifications')
                .update({ read: true })
                .eq('user_id', user.id)
                .eq('read', false)
        }
    }, [user?.id, markAllRead])

    // Mark as read when panel opens (if there are unread)
    const handleOpen = useCallback(async () => {
        setOpen(v => !v)
        // If we're opening and there are unreads, mark them read
        if (!open && unreadCount > 0) {
            handleMarkAllRead()
        }
    }, [open, unreadCount, handleMarkAllRead, setOpen])

    // ══════════════════════════════════════
    //  INDIVIDUAL ACTIONS
    // ══════════════════════════════════════
    const handleNotifClick = useCallback(async (n: any) => {
        // Mark single as read in zustand + DB
        if (!n.read) {
            markRead(n.id)
            supabase.from('notifications').update({ read: true }).eq('id', n.id).then(({ error }) => {
                if (error) console.error('Failed to mark read in DB:', error)
            })
        }
        // Navigate based on type
        if (n.type === 'follow' && n.from) {
            navigate(`/user/${n.from}`)
        } else if (n.type === 'reaction' || n.type === 'endorse') {
            navigate('/feed')
        }
        setOpen(false)
    }, [navigate, markRead, setOpen])

    const handleDismiss = useCallback(async (id: string) => {
        dismiss(id)
        supabase.from('notifications').delete().eq('id', id).then(({ error }) => {
            if (error) console.error('Failed to dismiss in DB:', error)
        })
    }, [dismiss])

    // ══════════════════════════════════════
    //  NOTIFICATION LIST (shared between layouts)
    // ══════════════════════════════════════
    const renderNotifList = () => {
        if (notifications.length === 0) {
            return (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem', opacity: 0.3 }}>◬</div>
                    <div style={{ color: 'var(--fog)', fontFamily: 'var(--font-sub)', fontSize: '0.85rem' }}>
                        No transmissions yet.
                    </div>
                    <div style={{ fontSize: '0.7rem', marginTop: '0.4rem', color: 'var(--ash)', fontFamily: 'var(--font-ui)', letterSpacing: '0.1em' }}>
                        The projector booth is quiet.
                    </div>
                </div>
            )
        }

        return notifications.slice(0, 30).map(n => (
            <div
                key={n.id}
                onClick={() => handleNotifClick(n)}
                style={{
                    display: 'flex', gap: '0.75rem', padding: '0.85rem 1rem',
                    borderBottom: '1px solid rgba(139,105,20,0.06)',
                    background: n.read ? 'transparent' : 'rgba(139,105,20,0.04)',
                    borderLeft: n.read ? '2px solid transparent' : '2px solid var(--sepia)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,105,20,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(139,105,20,0.04)'}
            >
                <span style={{ fontSize: '1.1rem', lineHeight: 1, minWidth: 20, textAlign: 'center', color: 'var(--sepia)' }}>
                    {NOTIF_ICONS[n.type] || '✦'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontFamily: 'var(--font-sub)', fontSize: '0.8rem',
                        color: n.read ? 'var(--fog)' : 'var(--parchment)',
                        lineHeight: 1.4,
                    }}>
                        {n.message}
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                        color: 'var(--ash)', marginTop: '0.25rem', letterSpacing: '0.08em',
                    }}>
                        {timeAgo(n.timestamp)}
                    </div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); handleDismiss(n.id) }}
                    aria-label="Dismiss notification"
                    style={{ background: 'none', border: 'none', color: 'var(--ash)', cursor: 'pointer', padding: '0.25rem', flexShrink: 0, borderRadius: '3px', transition: 'color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--blood-reel)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--ash)')}
                >
                    <X size={12} />
                </button>
            </div>
        ))
    }

    // ══════════════════════════════════════
    //  RENDER — Desktop dropdown vs Mobile full-screen
    // ══════════════════════════════════════

    // Header bar (shared)
    const renderHeader = (showClose?: boolean) => (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: isTouch ? '1.25rem 1.25rem' : '0.75rem 1rem',
            borderBottom: '1px solid rgba(139,105,20,0.1)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Bell size={isTouch ? 16 : 14} style={{ color: 'var(--sepia)' }} />
                <span style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: isTouch ? '0.55rem' : '0.6rem',
                    letterSpacing: '0.2em', color: 'var(--parchment)',
                }}>
                    TRANSMISSIONS
                </span>
                {unreadCount > 0 && (
                    <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.1em',
                        background: 'var(--sepia)', color: 'var(--ink)',
                        padding: '0.1rem 0.4rem', borderRadius: '1px',
                    }}>
                        {unreadCount}
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {notifications.some(n => !n.read) && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleMarkAllRead() }}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: '0.3rem',
                            fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em',
                        }}
                    >
                        <Check size={11} /> MARK ALL
                    </button>
                )}
                {showClose && (
                    <button
                        onClick={() => setOpen(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fog)', padding: '0.25rem' }}
                        aria-label="Close notifications"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
    )

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            {/* Bell icon */}
            <button
                className="nav-icon-btn"
                onClick={handleOpen}
                title="Notifications"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
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
                        animation: 'nav-log-pulse 2s ease-in-out infinite',
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* ── PANEL ── */}
            <AnimatePresence>
                {open && (
                    isTouch ? (
                        /* ═══ MOBILE: Full-screen slide-in panel ═══ */
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setOpen(false)}
                                style={{
                                    position: 'fixed', inset: 0, zIndex: 99998,
                                    background: 'rgba(5,3,1,0.7)',
                                }}
                            />
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'tween', ease: 'easeInOut', duration: 0.25 }}
                                style={{
                                    position: 'fixed', top: 0, right: 0, bottom: 0,
                                    width: '100vw', zIndex: 99999,
                                    background: 'var(--ink)',
                                    borderLeft: '1px solid rgba(139,105,20,0.15)',
                                    display: 'flex', flexDirection: 'column',
                                    boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
                                }}
                            >
                                {renderHeader(true)}
                                <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                    {renderNotifList()}
                                </div>
                            </motion.div>
                        </Portal>
                    ) : (
                        /* ═══ DESKTOP: Dropdown panel ═══ */
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            style={{
                                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                width: 340, maxHeight: 440, overflow: 'hidden',
                                background: 'rgba(18,14,9,0.98)',
                                border: '1px solid var(--ash)',
                                borderRadius: 'var(--radius-card)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(139,105,20,0.1)',
                                zIndex: 9999,
                                display: 'flex', flexDirection: 'column',
                            }}
                        >
                            {renderHeader(false)}
                            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
                                {renderNotifList()}
                            </div>
                        </motion.div>
                    )
                )}
            </AnimatePresence>
        </div>
    )
}
