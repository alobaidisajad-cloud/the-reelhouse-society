/**
 * NotificationCenter — Full notification panel with grouped notifications.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import PressableScale from '@/src/components/PressableScale';
import { EmptyState } from '@/src/components/EmptyStates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Pure utility functions (module-level = zero GC pressure) ──
function getIcon(type: string): string {
    switch (type) {
        case 'endorse': return '♥';
        case 'follow': return '◎';
        case 'comment': return '✎';
        case 'mention': return '@';
        case 'achievement': return '★';
        default: return '✦';
    }
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

interface Notification {
    id: string;
    type: string;
    message: string;
    metadata?: {
        film_id?: number | string;
        user_id?: string;
        username?: string;
        [key: string]: unknown;
    } | null;
    created_at: string;
    read: boolean;
}

export default function NotificationCenter() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useAuthStore();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [followRequests, setFollowRequests] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        
        const fetchNotifs = supabase
            .from('notifications')
            .select('id, type, message, metadata, created_at, read')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
            
        const fetchRequests = supabase
            .from('interactions')
            .select('id, user_id, created_at, profiles!interactions_user_id_fkey(username, avatar_url)')
            .eq('target_user_id', user.id)
            .eq('type', 'follow_request')
            .order('created_at', { ascending: false });

        const [notifsRes, reqsRes] = await Promise.all([fetchNotifs, fetchRequests]);
        
        // Filter out follow_request from standard list because we render them separately above
        const standardNotifs = (notifsRes.data ?? []).filter((n: any) => n.type !== 'follow_request');
        setNotifications(standardNotifs);
        setFollowRequests(reqsRes.data ?? []);
        setLoading(false);
    }, [user]);

    const handleAcceptRequest = async (requesterId: string) => {
        await supabase.rpc('accept_follow_request', { requester_id: requesterId });
        setFollowRequests(prev => prev.filter(r => r.user_id !== requesterId));
    };

    const handleDeclineRequest = async (requesterId: string) => {
        await supabase.rpc('decline_follow_request', { requester_id: requesterId });
        setFollowRequests(prev => prev.filter(r => r.user_id !== requesterId));
    };

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchNotifications();
        setRefreshing(false);
    };

    const markAllRead = async () => {
        if (!user) return;
        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const handlePress = useCallback((n: Notification) => {
        Haptics.selectionAsync();
        // Await mark-as-read and rollback on failure
        if (!n.read) {
            // Optimistic update
            setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
            supabase.from('notifications').update({ read: true }).eq('id', n.id)
                .then(({ error }) => {
                    if (error) {
                        // Rollback on failure
                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: false } : x));
                    }
                });
        }
        // Navigate based on type
        if (n.metadata?.film_id) (router.push as any)(`/film/${n.metadata.film_id}` as any);
        else if (n.metadata?.user_id) (router.push as any)(`/user/${n.metadata.username ?? n.metadata.user_id}` as any);
    }, [router]);



    const renderItem = useCallback(({ item }: { item: Notification }) => (
        <PressableScale
            style={[s.notifRow, !item.read && s.notifUnread]}
            onPress={() => handlePress(item)}
        >
            <View style={[s.iconCircle, !item.read && s.iconCircleUnread]}>
                <Text style={s.icon}>{getIcon(item.type)}</Text>
            </View>
            <View style={s.notifContent}>
                <Text style={s.notifMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={s.notifTime}>{timeAgo(item.created_at)}</Text>
            </View>
            {!item.read && <View style={s.unreadDot} />}
        </PressableScale>
    ), [handlePress]);

    const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

    const listHeaderElement = useMemo(() => {
        if (followRequests.length === 0) return null;
        return (
            <View style={s.requestsContainer}>
                <Text style={s.requestsHeader}>FOLLOW REQUESTS</Text>
                {followRequests.map(req => {
                    const username = req.profiles?.username || 'Unknown';
                    return (
                        <View key={req.id} style={s.requestCard}>
                            <View style={s.requestRow}>
                                <View style={s.iconCircleUnread}>
                                    <Text style={s.icon}>◎</Text>
                                </View>
                                <View style={s.notifContent}>
                                    <Text style={s.notifMessage}>
                                        <Text style={s.username} onPress={() => (router.push as any)(`/user/${username}` as any)}>@{username}</Text> requested to follow you.
                                    </Text>
                                    <Text style={s.notifTime}>{timeAgo(req.created_at)}</Text>
                                </View>
                            </View>
                            <View style={s.requestActions}>
                                <PressableScale onPress={() => handleAcceptRequest(req.user_id)} style={s.btnAccept}>
                                    <Text style={s.btnAcceptText}>ACCEPT</Text>
                                </PressableScale>
                                <PressableScale onPress={() => handleDeclineRequest(req.user_id)} style={s.btnDecline}>
                                    <Text style={s.btnDeclineText}>DECLINE</Text>
                                </PressableScale>
                            </View>
                        </View>
                    );
                })}
            </View>
        );
    }, [followRequests, router]);

    return (
        <View style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>Notifications</Text>
                {unreadCount > 0 && (
                    <PressableScale onPress={markAllRead} haptic="light">
                        <Text style={s.markAllText}>MARK ALL READ ({unreadCount})</Text>
                    </PressableScale>
                )}
            </View>

            <FlashList
                data={notifications}
                keyExtractor={item => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}
                estimatedItemSize={72}
                renderItem={renderItem}
                ListHeaderComponent={listHeaderElement}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 40) }}
                ListEmptyComponent={
                    !loading ? (
                        // Use branded EmptyState with Buster for visual consistency
                        <EmptyState
                            useBuster
                            busterMood="neutral"
                            title="The Lobby Is Quiet"
                            subtitle="Activity from the Society will appear here."
                            compact
                        />
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
    iconCircleUnread: { backgroundColor: 'rgba(139,105,20,0.2)' },
    icon: { fontSize: 16, color: colors.sepia },
    notifContent: { flex: 1 },
    notifMessage: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 18 },
    notifTime: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, marginTop: 2 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sepia },
    
    // Follow Requests
    requestsContainer: { paddingBottom: 8 },
    requestsHeader: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.sepia, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    requestCard: { backgroundColor: 'rgba(139,105,20,0.06)', borderLeftWidth: 2, borderLeftColor: colors.sepia, marginHorizontal: 16, marginBottom: 8, borderRadius: 4, paddingVertical: 12 },
    requestRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12 },
    username: { color: colors.flicker, fontFamily: fonts.body, fontWeight: 'bold' },
    requestActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingLeft: 60, paddingRight: 12 },
    btnAccept: { backgroundColor: colors.sepia, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 2 },
    btnAcceptText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.ink },
    btnDecline: { borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 2 },
    btnDeclineText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia },
});
