import { create } from 'zustand'
import { del } from 'idb-keyval'
import { Notification } from '../types'

export interface NotificationState {
    notifications: Notification[]
    push: (notif: Partial<Notification>) => void
    setNotifications: (notifs: Notification[]) => void
    markRead: (id: string) => void
    markAllRead: () => void
    dismiss: (id: string) => void
    clearAll: () => void
    unreadCount: () => number
}

// ── NOTIFICATION STORE — in-app notifications, in memory only ──
// The bell reads the house's record when it mounts and every time it opens, so a
// copy kept in the browser only ever showed old notices — and, on a shared
// computer, the last member's notices to the next. It is no longer kept, and the
// copy earlier versions saved is erased whenever the website loads.
del('reelhouse-notifications').catch(() => { /* nothing was saved */ })

export const useNotificationStore = create<NotificationState>()((set, get) => ({
    notifications: [],

    push: (notif) => set((state) => {
        const newId = notif.id || ('n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
        // Dedup guard — prevent realtime INSERT from re-adding an already-fetched notification
        if (notif.id && state.notifications.some(n => n.id === notif.id)) {
            return state
        }
        return {
            notifications: [
                {
                    id: newId,
                    read: false,
                    timestamp: new Date().toISOString(),
                    ...notif,
                } as Notification,
                ...state.notifications,
            ].slice(0, 50), // Cap at 50 — the bell shows the newest
        }
    }),

    setNotifications: (notifs) => set({ notifications: notifs.slice(0, 50) }),

    markRead: (id) => set((state) => ({
        notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
        ),
    })),

    markAllRead: () => set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

    dismiss: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
    })),

    clearAll: () => set({ notifications: [] }),

    unreadCount: () => get().notifications.filter((n) => !n.read).length,
}))
