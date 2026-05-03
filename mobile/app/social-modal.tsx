import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, InteractionManager } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { X, User, Users } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { EmptyState } from '@/src/components/EmptyStates';
import reelToast from '@/src/utils/reelToast';

interface SocialProfile {
    id: string;
    username: string;
    avatar_url?: string;
    role?: string;
}

export default function SocialModal() {
    const { userId, type } = useLocalSearchParams<{ userId: string, type: 'followers' | 'following' }>();
    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<SocialProfile[]>([]);

    // FIX #7: Defer back-navigation to avoid animation conflict on mount
    useEffect(() => {
        if (!userId || (type !== 'followers' && type !== 'following')) {
            InteractionManager.runAfterInteractions(() => router.back());
            return;
        }

        const fetchSocial = async () => {
            setLoading(true);
            try {
                let ids: string[] = [];
                if (type === 'followers') {
                    const { data } = await supabase
                        .from('interactions')
                        .select('user_id')
                        .eq('target_user_id', userId)
                        .eq('type', 'follow')
                        .limit(100);
                    ids = (data || []).map(r => r.user_id);
                } else {
                    const { data } = await supabase
                        .from('interactions')
                        .select('target_user_id')
                        .eq('user_id', userId)
                        .eq('type', 'follow')
                        .limit(100);
                    ids = (data || []).map(r => r.target_user_id);
                }

                if (ids.length > 0) {
                    const { data: profs } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url, role')
                        .in('id', ids);
                    setProfiles(profs || []);
                }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (err) {
                reelToast.error('The telegraph to the archive is disrupted.');
            } finally {
                setLoading(false);
            }
        };

        fetchSocial();
    }, [userId, type]);

    // FIX #1: Include router in deps to prevent stale closure
    const handleProfilePress = useCallback((username: string) => {
        router.dismiss();
        InteractionManager.runAfterInteractions(() => {
            router.push(`/user/${username}` as any);
        });
    }, [router]);

    // FIX #2: Stable renderItem reference to prevent FlashList cell reconciliation
    const renderSocialItem = useCallback(({ item, index }: { item: SocialProfile; index: number }) => (
        <Animated.View entering={FadeInUp.duration(300).delay(Math.min(index * 40, 400))}>
            <PressableScale onPress={() => handleProfilePress(item.username)} accessibilityRole="button" accessibilityLabel={`View ${item.username}'s profile`}>
                <View style={styles.userRow}>
                    {item.avatar_url && item.avatar_url.startsWith('http') ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                        <View style={styles.avatarPlaceholder}><User size={20} color={colors.parchment} /></View>
                    )}
                    <View style={styles.userInfo}>
                        <Text style={styles.username}>@{item.username.toUpperCase()}</Text>
                        <Text style={styles.role}>{(item.role ?? 'member').toUpperCase()}</Text>
                    </View>
                </View>
            </PressableScale>
        </Animated.View>
    ), [handleProfilePress]);

    return (
        <BlurView intensity={90} tint="dark" style={styles.container}>
            {/* Drag handle */}
            <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>

            <View style={styles.header}>
                <View style={{ width: 40 }} />
                <Text style={styles.title}>{type === 'followers' ? 'FOLLOWERS' : 'FOLLOWING'}</Text>
                <PressableScale onPress={() => router.back()} style={styles.closeBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" pressedScale={0.92} accessibilityRole="button" accessibilityLabel="Close social modal">
                    <X size={20} color={colors.parchment} />
                </PressableScale>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.sepia} />
                </View>
            ) : profiles.length === 0 ? (
                <View style={styles.center}>
                    <EmptyState
                        icon={<Users size={28} color={colors.sepia} strokeWidth={1} />}
                        title="The Circle Is Empty"
                        subtitle={type === 'followers' ? 'No one follows this member yet.' : 'This member hasn\'t followed anyone yet.'}
                    />
                </View>
            ) : (
                <FlashList 
                    data={profiles}
                    estimatedItemSize={68}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={renderSocialItem}
                />
            )}
        </BlurView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.ink },
    dragHandleWrap: { alignItems: 'center', paddingTop: 10 },
    dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.2)',
    },
    title: { fontFamily: fonts.uiMedium, fontSize: 12, letterSpacing: 4, color: colors.sepia },
    closeBtn: { width: 40, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    userRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(139,105,20,0.15)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    },
    userInfo: { marginLeft: 14, flex: 1 },
    username: { fontFamily: fonts.sub, fontSize: 15, color: colors.parchment, marginBottom: 2 },
    role: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
});
