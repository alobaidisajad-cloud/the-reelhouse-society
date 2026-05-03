import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandMMKVStorage } from './mmkv-storage';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';
import { registerStoreReset } from './resetAllStores';

export interface AppNotification {
    id: string;
    user_id: string;
    type: string;
    message: string;
    from_username?: string;
    film_id?: number;
    poster_path?: string;
    read: boolean;
    created_at: string;
}

export interface NotificationState {
    notifications: AppNotification[];
    loading: boolean;
    fetchNotifications: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    dismiss: (id: string) => Promise<void>;
    /** Derived O(1) counter — updated on every mutation */
    _unreadCount: number;
    unreadCount: () => number;
    setupRealtime: () => void | (() => void);
    /** H-02 FIX: Store the cleanup function so logout can tear down the channel */
    _realtimeCleanup: (() => void) | null;
}

// ── NOTIFICATION STORE (H-01 FIX: Now persisted to MMKV) ──
export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
    notifications: [],
    loading: false,
    _unreadCount: 0,
    _realtimeCleanup: null,

    fetchNotifications: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        set({ loading: true });
        const { data, error } = await supabase
            .from('notifications')
            .select('id, user_id, type, from_username, message, read, created_at, film_id, poster_path')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (!error && data) {
            set({ notifications: data, _unreadCount: data.filter(n => !n.read).length });
        }
        set({ loading: false });
    },

    markRead: async (id: string) => {
        const previousState = get().notifications;
        const wasUnread = previousState.some(n => n.id === id && !n.read);

        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, read: true } : n
            ),
            _unreadCount: wasUnread ? state._unreadCount - 1 : state._unreadCount,
        }));
        
        try {
            // Background DB sync
            const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
            if (error) throw error;
        } catch (e) {
            if (__DEV__) console.warn(`[markRead] Failed for ${id}:`, e);
            // Rollback
            set({ notifications: previousState, _unreadCount: previousState.filter(n => !n.read).length });
        }
    },

    markAllRead: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        const previousState = get().notifications;

        // Optimistic Update
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            _unreadCount: 0,
        }));

        try {
            const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
            if (error) throw error;
        } catch (e) {
            if (__DEV__) console.warn(`[markAllRead] Failed:`, e);
            // Rollback
            set({ notifications: previousState, _unreadCount: previousState.filter(n => !n.read).length });
        }
    },

    dismiss: async (id: string) => {
        const previousState = get().notifications;
        const wasDismissedUnread = previousState.some(n => n.id === id && !n.read);

        // Optimistic Update
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
            _unreadCount: wasDismissedUnread ? state._unreadCount - 1 : state._unreadCount,
        }));

        try {
            const { error } = await supabase.from('notifications').delete().eq('id', id);
            if (error) throw error;
        } catch (e) {
            if (__DEV__) console.warn(`[dismiss] Failed for ${id}:`, e);
            // Rollback
            set({ notifications: previousState, _unreadCount: previousState.filter(n => !n.read).length });
        }
    },

    unreadCount: () => get()._unreadCount,

    setupRealtime: () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        // H-03 FIX: Strict Singleton Lock to prevent React StrictMode double-subscriptions
        if (get()._realtimeCleanup) return get()._realtimeCleanup!;

        // Dedup channels by wiping existing first
        supabase.removeChannel(supabase.channel('global_notifications'));

        const channel = supabase
            .channel('global_notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    interface RawNotifPayload {
                      id: string; user_id: string; type?: string; message: string;
                      from_username?: string; film_id?: number; poster_path?: string;
                      read?: boolean; created_at?: string;
                    }
                    const raw = payload.new as RawNotifPayload;
                    // Defensive: validate required fields before injecting
                    if (!raw || typeof raw.id !== 'string' || typeof raw.message !== 'string') return;
                    const newNotif: AppNotification = {
                      id: raw.id,
                      user_id: raw.user_id,
                      type: raw.type ?? 'system',
                      message: raw.message,
                      from_username: raw.from_username,
                      film_id: raw.film_id,
                      poster_path: raw.poster_path,
                      read: raw.read ?? false,
                      created_at: raw.created_at ?? new Date().toISOString(),
                    };
                    set((state) => {
                        // Prevent duplicate injects
                        if (state.notifications.some(n => n.id === newNotif.id)) return state;
                        const next = [newNotif, ...state.notifications].slice(0, 50);
                        return { notifications: next, _unreadCount: next.filter(n => !n.read).length };
                    });
                }
            )
            .subscribe();

        const cleanup = () => {
            supabase.removeChannel(channel);
            set({ _realtimeCleanup: null });
        };

        // H-02 FIX: Store cleanup so resetAllStores can call it
        set({ _realtimeCleanup: cleanup });

        return cleanup;
    }
        }),
        {
            name: 'reelhouse-notifications',
            storage: createJSONStorage(() => zustandMMKVStorage),
            // H-01 FIX: Only persist data fields, not functions or internal state
            partialize: (state) => ({
                notifications: state.notifications,
                _unreadCount: state._unreadCount,
            }),
        }
    )
);

// F-10 FIX: Register cleanup handler for centralized logout
// H-02 FIX: Also tear down realtime channel on logout
registerStoreReset(() => {
    const cleanup = useNotificationStore.getState()._realtimeCleanup;
    if (cleanup) cleanup();
    useNotificationStore.setState({ notifications: [], _unreadCount: 0, _realtimeCleanup: null });
});
