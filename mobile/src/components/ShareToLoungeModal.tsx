/**
 * ShareToLoungeModal — Share films/logs to lounge rooms.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';

interface ShareToLoungeProps {
    visible: boolean;
    onClose: () => void;
    filmTitle?: string;
    filmId?: string | number;
    posterPath?: string | null;
}

export default function ShareToLoungeModal({ visible, onClose, filmTitle, filmId }: ShareToLoungeProps) {
    const { user } = useAuthStore();
    const [lounges, setLounges] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedLounge, setSelectedLounge] = useState<string | null>(null);

    useEffect(() => {
        if (!visible || !user) return;
        setLoading(true);
        (async () => {
            const { data } = await supabase
                .from('lounge_members')
                .select('lounge_id, lounges(id, name)')
                .eq('user_id', user.id);
            setLounges((data || []).map((d: any) => d.lounges).filter(Boolean));
            setLoading(false);
        })();
    }, [visible, user]);

    const handleSend = async () => {
        if (!selectedLounge || !user) return;
        setSending(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const content = message.trim()
                ? `🎬 **${filmTitle}**\n${message}`
                : `🎬 Check out **${filmTitle}** — just shared from my archive.`;

            await supabase.from('lounge_messages').insert({
                lounge_id: selectedLounge,
                user_id: user.id,
                content,
                metadata: { type: 'film_share', film_id: filmId, film_title: filmTitle },
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onClose();
            setMessage(''); setSelectedLounge(null);
        } catch (e: any) {
            console.error('Share to lounge failed:', e);
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.card}>
                    <View style={s.header}>
                        <Text style={s.title}>Share to Lounge</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={s.closeText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={s.filmLabel}>SHARING: {filmTitle?.toUpperCase()}</Text>

                    {loading ? (
                        <ActivityIndicator color={colors.sepia} style={{ marginVertical: 24 }} />
                    ) : lounges.length === 0 ? (
                        <Text style={s.emptyText}>You haven't joined any lounges yet.</Text>
                    ) : (
                        <>
                            <Text style={s.selectLabel}>SELECT LOUNGE</Text>
                            <FlatList
                                data={lounges}
                                keyExtractor={(item) => item.id}
                                style={{ maxHeight: 160 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[s.loungeItem, selectedLounge === item.id && s.loungeActive]}
                                        onPress={() => { setSelectedLounge(item.id); Haptics.selectionAsync(); }}
                                    >
                                        <Text style={[s.loungeName, selectedLounge === item.id && { color: colors.sepia }]}>
                                            {item.name}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            />

                            <TextInput
                                style={s.messageInput}
                                placeholder="Add a message (optional)..."
                                placeholderTextColor={colors.fog}
                                value={message}
                                onChangeText={setMessage}
                                multiline
                            />

                            <TouchableOpacity
                                style={[s.sendBtn, (!selectedLounge || sending) && { opacity: 0.4 }]}
                                onPress={handleSend}
                                disabled={!selectedLounge || sending}
                            >
                                <Text style={s.sendText}>{sending ? 'SENDING...' : 'SHARE TO LOUNGE'}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    card: {
        backgroundColor: colors.ink, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        borderTopWidth: 2, borderTopColor: colors.sepia, padding: 24,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment },
    closeText: { fontSize: 18, color: colors.fog },
    filmLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 16 },
    selectLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 8 },
    loungeItem: { paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, marginBottom: 6 },
    loungeActive: { borderColor: colors.sepia, backgroundColor: 'rgba(139,105,20,0.1)' },
    loungeName: { fontFamily: fonts.sub, fontSize: 14, color: colors.bone },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', paddingVertical: 24 },
    messageInput: {
        backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.ash,
        color: colors.bone, fontFamily: fonts.body, fontSize: 13,
        paddingHorizontal: 12, paddingVertical: 10, minHeight: 60, borderRadius: 4,
        textAlignVertical: 'top', marginTop: 12,
    },
    sendBtn: { backgroundColor: colors.sepia, paddingVertical: 14, alignItems: 'center', borderRadius: 4, marginTop: 16 },
    sendText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.ink },
});
