import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

// ── NOTIFICATION STORE — in-app notifications ──
export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
            notifications: [],

            push: (notif) => set((state) => ({
                notifications: [
                    {
                        id: notif.id || ('n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
                        read: false,
                        timestamp: new Date().toISOString(),
                        ...notif,
                    } as unknown as Notification,
                    ...state.notifications,
                ].slice(0, 50), // Cap at 50 — prevents unbounded localStorage growth
            })),

            setNotifications: (notifs) => set({ notifications: notifs }),

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
        }),
        { name: 'reelhouse-notifications' }
    )
)
