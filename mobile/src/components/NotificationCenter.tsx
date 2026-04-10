/**
 * NotificationCenter — Full notification panel with grouped notifications.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, Image } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';

interface Notification {
    id: string;
    type: string;
    message: string;
    metadata?: any;
    created_at: string;
    read: boolean;
}

export default function NotificationCenter() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
        setNotifications(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchNotifications();
        setRefreshing(false);
    };

    const markAllRead = async () => {
        if (!user) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const handlePress = (n: Notification) => {
        Haptics.selectionAsync();
        // Mark as read
        if (!n.read) {
            supabase.from('notifications').update({ read: true }).eq('id', n.id);
            setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
        }
        // Navigate based on type
        if (n.metadata?.film_id) router.push(`/film/${n.metadata.film_id}`);
        else if (n.metadata?.user_id) router.push(`/user/${n.metadata.username || n.metadata.user_id}`);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'endorse': return '♥';
            case 'follow': return '◎';
            case 'comment': return '✎';
            case 'mention': return '@';
            case 'achievement': return '★';
            default: return '✦';
        }
    };

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h`;
        return `${Math.floor(hours / 24)}d`;
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <View style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>Notifications</Text>
                {unreadCount > 0 && (
                    <TouchableOpacity onPress={markAllRead} activeOpacity={0.7}>
                        <Text style={s.markAllText}>MARK ALL READ ({unreadCount})</Text>
                    </TouchableOpacity>
                )}
            </View>

            <FlatList
                data={notifications}
                keyExtractor={item => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[s.notifRow, !item.read && s.notifUnread]}
                        onPress={() => handlePress(item)}
                        activeOpacity={0.7}
                    >
                        <View style={[s.iconCircle, !item.read && { backgroundColor: 'rgba(139,105,20,0.2)' }]}>
                            <Text style={s.icon}>{getIcon(item.type)}</Text>
                        </View>
                        <View style={s.notifContent}>
                            <Text style={s.notifMessage} numberOfLines={2}>{item.message}</Text>
                            <Text style={s.notifTime}>{timeAgo(item.created_at)}</Text>
                        </View>
                        {!item.read && <View style={s.unreadDot} />}
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    !loading ? (
                        <View style={s.emptyWrap}>
                            <Text style={s.emptyGlyph}>◎</Text>
                            <Text style={s.emptyText}>No notifications yet</Text>
                            <Text style={s.emptySubtext}>Activity from the Society will appear here.</Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.ink },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.ash },
    title: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment },
    markAllText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.sepia },
    notifRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
    notifUnread: { backgroundColor: 'rgba(139,105,20,0.04)' },
    iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
    icon: { fontSize: 16, color: colors.sepia },
    notifContent: { flex: 1 },
    notifMessage: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 18 },
    notifTime: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, marginTop: 2 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sepia },
    emptyWrap: { padding: 48, alignItems: 'center' },
    emptyGlyph: { fontSize: 40, color: colors.sepia, opacity: 0.3, marginBottom: 12 },
    emptyText: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 4 },
    emptySubtext: { fontFamily: fonts.body, fontSize: 13, color: colors.fog },
});
