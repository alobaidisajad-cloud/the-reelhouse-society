import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useState, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts } from '@/src/theme/theme';

interface DispatchLogItem {
    id: string;
    film_title: string;
    review: string | null;
    created_at: string;
    profiles?: { username: string; avatar_url?: string } | { username: string; avatar_url?: string }[];
}

export function DispatchFeed() {
    const [logs, setLogs] = useState<DispatchLogItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('logs')
                .select('id, film_title, review, created_at, profiles!logs_user_id_fkey(username, avatar_url)')
                .order('created_at', { ascending: false })
                .limit(20);
            if (data) setLogs(data as DispatchLogItem[]);
            setLoading(false);
        })();
    }, []);

    if (loading) return <ActivityIndicator size="large" color={colors.sepia} />;

    return (
        <FlashList
            data={logs}
            keyExtractor={l => l.id.toString()}
            estimatedItemSize={100}
            renderItem={({ item }) => {
                const username = Array.isArray(item.profiles) ? item.profiles[0]?.username : item.profiles?.username;
                return (
                    <View style={s.card}>
                        <Text style={s.username}>@{username ?? 'archivist'}</Text>
                        <Text style={s.title}>{item.film_title}</Text>
                        {item.review && <Text style={s.review}>{item.review}</Text>}
                    </View>
                );
            }}
        />
    );
}

const s = StyleSheet.create({
    card: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.ash },
    username: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia },
    title: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment },
    review: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, marginTop: 8 }
});
