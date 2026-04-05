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
    deletedIds: string[]
}

// ── NOTIFICATION STORE — in-app notifications ──
export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
            notifications: [],
            deletedIds: [],

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
                        } as unknown as Notification,
                        ...state.notifications,
                    ].slice(0, 50), // Cap at 50 — prevents unbounded localStorage growth
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
                deletedIds: [...state.deletedIds, id].slice(-100), // Keep list bounded
            })),

            clearAll: () => set({ notifications: [], deletedIds: [] }),

            unreadCount: () => get().notifications.filter((n) => !n.read).length,
        }),
        { 
            name: 'reelhouse-notifications',
            version: 2,
            // v2: flush stale localStorage after column-name fixes — DB is now source of truth
            migrate: () => ({ notifications: [] }),
        }
    )
)
