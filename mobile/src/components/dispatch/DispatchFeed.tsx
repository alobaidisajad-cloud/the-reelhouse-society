import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts } from '@/src/theme/theme';

export function DispatchFeed() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('logs')
                .select('*, profiles!logs_user_id_fkey(username, avatar_url)')
                .order('created_at', { ascending: false })
                .limit(20);
            if (data) setLogs(data);
            setLoading(false);
        })();
    }, []);

    if (loading) return <ActivityIndicator size="large" color={colors.sepia} />;

    return (
        <FlatList
            data={logs}
            keyExtractor={l => l.id.toString()}
            renderItem={({ item }) => (
                <View style={s.card}>
                    <Text style={s.username}>@{item.profiles?.username}</Text>
                    <Text style={s.title}>{item.film_title}</Text>
                    {item.review && <Text style={s.review}>{item.review}</Text>}
                </View>
            )}
        />
    );
}

const s = StyleSheet.create({
    card: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.ash },
    username: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia },
    title: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment },
    review: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, marginTop: 8 }
});
