import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get, set as idbSet, del } from 'idb-keyval'
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

// ── idb-keyval storage engine — matches the FilmStore's persistence layer ──
// Prevents main-thread blocking on large payloads (unlike localStorage)
const idbStorage = createJSONStorage<NotificationState>(() => ({
    getItem: async (name: string) => {
        const val = await get(name)
        return val ?? null
    },
    setItem: async (name: string, value: string) => {
        await idbSet(name, value)
    },
    removeItem: async (name: string) => {
        await del(name)
    },
}))

// ── NOTIFICATION STORE — in-app notifications ──
// Migrated from localStorage (v2) to idb-keyval (v3) for consistency
// with the rest of the ReelHouse persistence architecture.
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
                        } as Notification,
                        ...state.notifications,
                    ].slice(0, 50), // Cap at 50 — prevents unbounded storage growth
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
            version: 3,
            storage: idbStorage,
            // v3: migrated from localStorage to idb-keyval for architectural consistency
            migrate: () => ({ notifications: [], deletedIds: [] } as any),
        }
    )
)
