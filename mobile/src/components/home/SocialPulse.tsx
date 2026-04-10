/**
 * SocialPulse — Real-time social activity feed for the home tab.
 * Shows recent activity from users the current user follows.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';

interface ActivityItem {
    id: string;
    user_id: string;
    username: string;
    avatar_url?: string;
    type: 'log' | 'review' | 'list' | 'follow' | 'endorse';
    film_title?: string;
    film_id?: number;
    poster_path?: string;
    rating?: number;
    created_at: string;
}

export function SocialPulse() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) { setLoading(false); return; }

        (async () => {
            // Fetch recent activity from followed users
            const { data: follows } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', user.id);

            const followingIds = (follows || []).map((f: any) => f.following_id);
            if (followingIds.length === 0) { setLoading(false); return; }

            const { data: logs } = await supabase
                .from('logs')
                .select('id, user_id, film_title, film_id, poster_path, rating, created_at, profiles!inner(username, avatar_url)')
                .in('user_id', followingIds)
                .order('created_at', { ascending: false })
                .limit(15);

            const items: ActivityItem[] = (logs || []).map((l: any) => ({
                id: l.id,
                user_id: l.user_id,
                username: l.profiles?.username || 'unknown',
                avatar_url: l.profiles?.avatar_url,
                type: 'log',
                film_title: l.film_title,
                film_id: l.film_id,
                poster_path: l.poster_path,
                rating: l.rating,
                created_at: l.created_at,
            }));

            setActivities(items);
            setLoading(false);
        })();
    }, [user]);

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    if (loading || activities.length === 0) return null;

    const renderReels = (rating: number) => {
        return '◉'.repeat(rating) + '◯'.repeat(5 - rating);
    };

    return (
        <Animated.View entering={FadeIn.duration(400)} style={s.container}>
            <Text style={s.sectionTitle}>✦ SOCIAL PULSE</Text>

            {activities.slice(0, 8).map((item, i) => (
                <Animated.View key={item.id} entering={FadeInDown.delay(i * 60).duration(300)}>
                    <TouchableOpacity
                        style={s.activityRow}
                        onPress={() => {
                            Haptics.selectionAsync();
                            if (item.film_id) router.push(`/film/${item.film_id}`);
                        }}
                        activeOpacity={0.7}
                    >
                        {/* Avatar */}
                        <View style={s.avatar}>
                            {item.avatar_url ? (
                                <Image source={{ uri: item.avatar_url }} style={s.avatarImg} />
                            ) : (
                                <Text style={s.avatarFallback}>{item.username[0]?.toUpperCase()}</Text>
                            )}
                        </View>

                        {/* Content */}
                        <View style={s.activityContent}>
                            <Text style={s.activityText} numberOfLines={2}>
                                <Text style={s.username}>@{item.username}</Text>
                                {' logged '}
                                <Text style={s.filmName}>{item.film_title}</Text>
                            </Text>
                            <View style={s.metaRow}>
                                {item.rating && <Text style={s.rating}>{renderReels(item.rating)}</Text>}
                                <Text style={s.timeText}>{timeAgo(item.created_at)}</Text>
                            </View>
                        </View>

                        {/* Mini poster */}
                        {item.poster_path && (
                            <Image
                                source={{ uri: `https://image.tmdb.org/t/p/w92${item.poster_path}` }}
                                style={s.miniPoster}
                            />
                        )}
                    </TouchableOpacity>
                </Animated.View>
            ))}
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: { paddingHorizontal: 16, paddingVertical: 16 },
    sectionTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginBottom: 16 },
    activityRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    },
    avatar: {
        width: 32, height: 32, borderRadius: 16, overflow: 'hidden',
        backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    avatarFallback: { fontFamily: fonts.uiBold, fontSize: 12, color: colors.sepia },
    activityContent: { flex: 1 },
    activityText: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, lineHeight: 16 },
    username: { fontFamily: fonts.uiBold, fontSize: 12, color: colors.parchment },
    filmName: { fontFamily: fonts.sub, fontSize: 12, color: colors.sepia },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
    rating: { fontFamily: fonts.display, fontSize: 10, color: colors.sepia },
    timeText: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog },
    miniPoster: { width: 30, height: 45, borderRadius: 2, resizeMode: 'cover', borderWidth: 1, borderColor: colors.ash },
});
