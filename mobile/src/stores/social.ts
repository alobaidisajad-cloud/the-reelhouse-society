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
    unreadCount: () => number;
    setupRealtime: () => void | (() => void);
}

// ── NOTIFICATION STORE ──
export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    loading: false,

    fetchNotifications: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        
        set({ loading: true });
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (!error && data) {
            set({ notifications: data });
        }
        set({ loading: false });
    },

    markRead: async (id: string) => {
        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, read: true } : n
            ),
        }));
        
        // Background DB sync
        await supabase.from('notifications').update({ read: true }).eq('id', id);
    },

    markAllRead: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;

        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));

        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    },

    dismiss: async (id: string) => {
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
        }));

        await supabase.from('notifications').delete().eq('id', id);
    },

    unreadCount: () => get().notifications.filter((n) => !n.read).length,

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
                    const newNotif = payload.new as AppNotification;
                    set((state) => {
                        // Prevent duplicate injects
                        if (state.notifications.some(n => n.id === newNotif.id)) return state;
                        return { notifications: [newNotif, ...state.notifications].slice(0, 50) };
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
}));
