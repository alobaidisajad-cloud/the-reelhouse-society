/**
 * ShareToLoungeModal — Share films/logs to lounge rooms.
 */
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import PressableScale from '@/src/components/PressableScale';
import { useAuthStore } from '@/src/stores/auth';
import { LoungeRoom, useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';

import reelToast from '@/src/utils/reelToast';

interface ShareToLoungeProps {
    visible: boolean;
    onClose: () => void;
    filmTitle?: string;
    filmId?: string | number;
    posterPath?: string | null;
    logId?: string;
    ownerUsername?: string;
    listId?: string;
    listTitle?: string;
    listFilmCount?: number;
    listCurator?: string;
    listTopPosters?: string[];
    dossierId?: string;
    dossierTitle?: string;
    dossierAuthor?: string;
}

interface _LoungeMemberRow {
    lounge_id: string;
    lounges: LoungeRoom | null;
}

const LoungeItem = React.memo(({ item, isSelected, onSelect }: { item: LoungeRoom, isSelected: boolean, onSelect: (id: string) => void }) => (
    <PressableScale
        style={[s.loungeItem, isSelected && s.loungeActive]}
        onPress={() => onSelect(item.id)}
        disabled={isSelected}
        haptic="selection"
        pressedScale={0.98}
    >
        <Text style={[s.loungeName, isSelected && s.loungeNameActive]}>
            {item.name}
        </Text>
    </PressableScale>
));
LoungeItem.displayName = 'LoungeItem';

export default function ShareToLoungeModal({ 
    visible, onClose, filmTitle, filmId, posterPath, logId, ownerUsername,
    listId, listTitle, listFilmCount, listCurator, listTopPosters,
    dossierId, dossierTitle, dossierAuthor
}: ShareToLoungeProps) {
    const { user } = useAuthStore();
    const allLounges = useLoungeStore(s => s.lounges);
    const isFetching = useLoungeStore(s => s.loading);
    const lounges = allLounges.filter(l => l.is_member || l.unread_count !== undefined);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedLounge, setSelectedLounge] = useState<string | null>(null);
    const [shouldRender, setShouldRender] = useState(visible);

    // FIX 1: Delayed Unmount for Android OOM safety
    useEffect(() => {
        if (visible) {
            setShouldRender(true);
        } else {
            const timer = setTimeout(() => setShouldRender(false), 350);
            return () => clearTimeout(timer);
        }
    }, [visible]);

    // FIX 3: View Recycling Input Bleed fix
    useEffect(() => {
        setMessage('');
        setSelectedLounge(null);
        setSending(false);
    }, [filmId, logId, listId, dossierId]);

    useEffect(() => {
        if (!visible || !user) return;
        // Prevent UI blocking. Fetch silently if we already have lounges.
        useLoungeStore.getState().fetchLounges();
    }, [visible, user]);

    const handleSend = async () => {
        if (!selectedLounge || !user) return;
        setSending(true);

        let shareType: 'film_share' | 'log_share' | 'list_share' | 'dossier_share' = 'film_share';
        if (dossierId) shareType = 'dossier_share';
        else if (listId) shareType = 'list_share';
        else if (logId) shareType = 'log_share';

        let metadata: any = {};
        if (shareType === 'log_share' && logId) {
             metadata = { log_id: logId, owner_username: ownerUsername };
        }

        let payload: any = {};
        if (shareType === 'dossier_share') {
            // film_title is the lounge card's title column — it carries the
            // essay's headline; everything else rides the metadata jsonb.
            payload = {
                film_title: dossierTitle ?? null,
                metadata: { dossier_id: dossierId, author_username: dossierAuthor }
            };
        } else if (shareType === 'list_share') {
            payload = {
                listId: listId,
                title: listTitle,
                filmCount: listFilmCount,
                curator: listCurator,
                topPosters: listTopPosters || []
            };
        } else {
            payload = {
                film_id: filmId ? Number(filmId) : null,
                film_title: filmTitle ?? null,
                film_poster: posterPath ?? null,
                metadata
            };
        }

        const content = message.trim() || '';

        // Fire and forget
        useLoungeStore.getState().sendMessage(
            selectedLounge,
            content,
            shareType,
            payload
        ).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : 'Signal failed to transmit. Try again.';
            reelToast.error(msg);
        });

        onClose();
        // State wipe is deferred to unmount by the useEffect
    };

    const handleSelectLounge = useCallback((id: string) => {
        setSelectedLounge(id);
    }, []);

    const renderLoungeItem = useCallback(({ item, extraData: selectedId }: { item: LoungeRoom, extraData: any }) => (
        <LoungeItem
            item={item}
            isSelected={selectedId === item.id}
            onSelect={handleSelectLounge}
        />
    ), [handleSelectLounge]);

    // Keyboard-aware sheet — the message input and SHARE button rise with the
    // keyboard instead of hiding beneath it (same fix as PasswordRecoveryModal).
    const keyboard = useAnimatedKeyboard();
    const animatedSheetStyle = useAnimatedStyle(() => ({
        paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
    }));

    if (!shouldRender) return null;

    return (
        <Modal statusBarTranslucent visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Animated.View style={[s.overlay, animatedSheetStyle]} accessibilityViewIsModal={true}>
                <View style={s.card}>
                    <View style={s.header}>
                        <Text style={s.title}>Share to Lounge</Text>
                        <PressableScale onPress={() => { onClose(); }} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic="selection" pressedScale={0.92}>
                            <Text style={s.closeText}>✕</Text>
                        </PressableScale>
                    </View>

                    {dossierId ? (
                        <Text style={s.filmLabel} numberOfLines={1}>SHARING DOSSIER: {dossierTitle?.toUpperCase()}</Text>
                    ) : listId ? (
                        <Text style={s.filmLabel} numberOfLines={1}>SHARING STACK: {listTitle?.toUpperCase()}</Text>
                    ) : (
                        <Text style={s.filmLabel} numberOfLines={1}>SHARING: {filmTitle?.toUpperCase()}</Text>
                    )}

                    {(isFetching && lounges.length === 0) ? (
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
                                extraData={selectedLounge}
                                renderItem={renderLoungeItem as any}
                                showsVerticalScrollIndicator={false}
                                keyboardDismissMode="on-drag"
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
                                selectionColor={colors.selection}
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
            </Animated.View>
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
    filmLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 16 },
    selectLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 8 },
    loungeItem: { paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, marginBottom: 6 },
    loungeActive: { borderColor: colors.sepia, backgroundColor: colors.sepiaFaint },
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
    sendText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.ink },
});
