import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';

export interface AppNotification {
    id: string;
    user_id: string;
    type: string;
    message: string;
    from_username?: string;
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
}

// ── NOTIFICATION STORE ──
export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    loading: false,
    _unreadCount: 0,

    fetchNotifications: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        set({ loading: true });
        const { data, error } = await supabase
            .from('notifications')
            .select('id, user_id, type, from_username, message, read, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (!error && data) {
            set({ notifications: data, _unreadCount: data.filter(n => !n.read).length });
        }
        set({ loading: false });
    },

    markRead: async (id: string) => {
        // Optimistic update
        set((state) => {
            const wasUnread = state.notifications.some(n => n.id === id && !n.read);
            return {
                notifications: state.notifications.map((n) =>
                    n.id === id ? { ...n, read: true } : n
                ),
                _unreadCount: wasUnread ? state._unreadCount - 1 : state._unreadCount,
            };
        });
        
        // Background DB sync
        await supabase.from('notifications').update({ read: true }).eq('id', id);
    },

    markAllRead: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            _unreadCount: 0,
        }));

        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    },

    dismiss: async (id: string) => {
        set((state) => {
            const wasDismissedUnread = state.notifications.some(n => n.id === id && !n.read);
            return {
                notifications: state.notifications.filter((n) => n.id !== id),
                _unreadCount: wasDismissedUnread ? state._unreadCount - 1 : state._unreadCount,
            };
        });

        await supabase.from('notifications').delete().eq('id', id);
    },

    unreadCount: () => get()._unreadCount,

    setupRealtime: () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        // Dedup channels by wiping existing first
        supabase.removeChannel(supabase.channel('global_notifications'));

        const channel = supabase
            .channel('global_notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    const raw = payload.new as Record<string, unknown>;
                    // Defensive: validate required fields before injecting
                    if (!raw || typeof raw.id !== 'string' || typeof raw.message !== 'string') return;
                    const newNotif: AppNotification = {
                      id: raw.id as string,
                      user_id: raw.user_id as string,
                      type: (raw.type as string) ?? 'system',
                      message: raw.message as string,
                      from_username: raw.from_username as string | undefined,
                      read: (raw.read as boolean) ?? false,
                      created_at: (raw.created_at as string) ?? new Date().toISOString(),
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

        return () => {
            supabase.removeChannel(channel);
        };
    }
}));
