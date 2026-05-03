/**
 * ShareToLoungeModal — Share films/logs to lounge rooms.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Animated, { FadeIn } from 'react-native-reanimated';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import reelToast from '@/src/utils/reelToast';

interface ShareToLoungeProps {
    visible: boolean;
    onClose: () => void;
    filmTitle?: string;
    filmId?: string | number;
    posterPath?: string | null;
}

interface LoungeMemberRow {
    lounge_id: string;
    lounges: { id: string; name: string } | null;
}

export default function ShareToLoungeModal({ visible, onClose, filmTitle, filmId }: ShareToLoungeProps) {
    const { user } = useAuthStore();
    const [lounges, setLounges] = useState<{ id: string; name: string }[]>([]);
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
            setLounges((data as unknown as LoungeMemberRow[] ?? []).map(d => d.lounges).filter((l): l is { id: string; name: string } => l !== null));
            setLoading(false);
        })();
    }, [visible, user]);

    const handleSend = async () => {
        if (!selectedLounge || !user) return;
        setSending(true);

        try {
            const content = message.trim()
                ? `🎬 **${filmTitle}**\n${message}`
                : `🎬 Check out **${filmTitle}** — just shared from my archive.`;

            // FIX #5: Use top-level columns matching the lounge store schema
            // (was using nested `metadata` JSON that no renderer reads)
            await supabase.from('lounge_messages').insert({
                lounge_id: selectedLounge,
                user_id: user.id,
                content,
                type: 'film_share',
                film_id: filmId ? Number(filmId) : null,
                film_title: filmTitle ?? null,
                film_poster: posterPath ?? null,
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Signal failed to transmit. Try again.';
            reelToast.error(msg);
            return; // Don't close modal on error
        } finally {
            setSending(false);
        }

        onClose();
        setMessage(''); setSelectedLounge(null);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.card}>
                    <View style={s.header}>
                        <Text style={s.title}>Share to Lounge</Text>
                        <PressableScale onPress={() => { onClose(); }} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic="selection" pressedScale={0.92}>
                            <Text style={s.closeText}>✕</Text>
                        </PressableScale>
                    </View>

                    <Text style={s.filmLabel}>SHARING: {filmTitle?.toUpperCase()}</Text>

                    {loading ? (
                        <ActivityIndicator color={colors.sepia} style={s.loadingIndicator} />
                    ) : lounges.length === 0 ? (
                        <Text style={s.emptyText}>You haven&apos;t joined any lounges yet.</Text>
                    ) : (
                        <>
                            <Text style={s.selectLabel}>SELECT LOUNGE</Text>
                            <FlashList
                                data={lounges}
                                estimatedItemSize={52}
                                keyExtractor={(item) => item.id}
                                style={s.loungeList}
                                renderItem={({ item }) => (
                                    <PressableScale
                                        style={[s.loungeItem, selectedLounge === item.id && s.loungeActive]}
                                        onPress={() => { setSelectedLounge(item.id); }}
                                        haptic="selection"
                                        pressedScale={0.98}
                                    >
                                        <Text style={[s.loungeName, selectedLounge === item.id && s.loungeNameActive]}>
                                            {item.name}
                                        </Text>
                                    </PressableScale>
                                )}
                            />

                            <TextInput
                                style={s.messageInput}
                                placeholder="Add a message (optional)..."
                                placeholderTextColor={colors.fog}
                                value={message}
                                onChangeText={setMessage}
                                multiline
                                maxLength={500}
                                keyboardAppearance="dark"
                                accessibilityLabel="Share message"
                                selectionColor={'rgba(218,165,32,0.3)'}
                            />

                            <PressableScale
                                style={[s.sendBtn, (!selectedLounge || sending) && s.sendBtnDisabled]}
                                onPress={handleSend}
                                disabled={!selectedLounge || sending}
                                haptic="medium"
                                pressedScale={0.95}
                            >
                                <Text style={s.sendText}>{sending ? 'SENDING...' : 'SHARE TO LOUNGE'}</Text>
                            </PressableScale>
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
    loungeNameActive: { color: colors.sepia },
    loungeList: { maxHeight: 160 },
    loadingIndicator: { marginVertical: 24 },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', paddingVertical: 24 },
    messageInput: {
        backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.ash,
        color: colors.bone, fontFamily: fonts.body, fontSize: 13,
        paddingHorizontal: 12, paddingVertical: 10, minHeight: 60, borderRadius: 4,
        textAlignVertical: 'top', marginTop: 12,
    },
    sendBtn: { backgroundColor: colors.sepia, paddingVertical: 14, alignItems: 'center', borderRadius: 4, marginTop: 16 },
    sendBtnDisabled: { opacity: 0.4 },
    sendText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.ink },
});
