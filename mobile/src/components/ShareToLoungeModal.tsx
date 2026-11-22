/**
 * ShareToLoungeModal — a film, log, stack or filing, shared into a salon.
 */
import { FlashList } from '@shopify/flash-list';
import { InColumn } from '@/src/components/layout/InColumn';
import { NOT_ANCHORED } from '@/src/components/layout/CinematicFlashList';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/src/components/text';
import Animated from 'react-native-reanimated';
import { useModalKeyboardPadding, useSheetFootWhileTyping } from '@/src/hooks/useModalKeyboardPadding';
import { overlayTop, useSheetBottom } from '@/src/components/layout/navMetrics';

import PressableScale from '@/src/components/PressableScale';
import { useAuthStore } from '@/src/stores/auth';
import { canPostIn, LoungeRoom, useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';

import reelToast from '@/src/utils/reelToast';
import { captureError } from '@/src/lib/sentry';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { useStruck } from '@/src/components/StruckWords';
import { clipToSentence } from '@/src/components/dispatch/paper/paperText';
import { ToastHost } from '@/src/components/ToastHost';
import { TryAgainLine } from '@/src/components/TryAgain';
import { putBackWords, useKeptWords } from '@/src/hooks/useKeptWords';

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
    /** Which of the five forms it is, so the lounge card labels it correctly. */
    dossierKind?: string;
}

/** Half the rows' 6pt gap: no tap reaches the next salon, and a wrong room cannot be undone. */
const LOUNGE_SLOP = { top: 3, bottom: 3, left: 15, right: 15 } as const;

/**
 * The card's title, within `lounge_messages.film_title`'s 300-character CHECK: a take
 * runs to 2,000, and past 300 the insert is refused. Cut at a sentence, or a word when
 * there is none, because it is somebody's writing. Every share comes through here.
 */
export const cardTitle = (raw?: string | null): string | null => {
    const whole = (raw ?? '').trim();
    if (!whole) return null;
    if (whole.length <= MAX_LENGTHS.loungeShareTitle) return whole;
    const cut = clipToSentence(whole, MAX_LENGTHS.loungeShareTitle);
    // A cut at a sentence ends on its stop; one at a word already carries its ellipsis.
    return cut.clipped && !cut.text.endsWith('…') ? `${cut.text}…` : cut.text;
};

const LoungeItem = React.memo(({ item, isSelected, onSelect }: { item: LoungeRoom, isSelected: boolean, onSelect: (id: string) => void }) => {
  // The room's name, each slur struck for a reader who asked (StruckWords).
  const struck = useStruck();
  return (
    <PressableScale
        style={[s.loungeItem, isSelected && s.loungeActive]}
        hitSlop={LOUNGE_SLOP}
        onPress={() => onSelect(item.id)}
        disabled={isSelected}
        haptic="selection"
        pressedScale={0.98}
        // Selected, not "dimmed": `disabled` alone would be read as unavailable.
        accessibilityState={{ selected: isSelected }}
    >
        <Text style={[s.loungeName, isSelected && s.loungeNameActive]}>
            {struck(item.name)}
        </Text>
    </PressableScale>
  );
});
LoungeItem.displayName = 'LoungeItem';

/**
 * The sheet, mounted only while open or closing. It lives in every feed card's
 * action bar, so the store subscriptions belong to the open sheet alone: a closed
 * one in each card answers nothing.
 */
export default function ShareToLoungeModal(props: ShareToLoungeProps) {
    const { visible } = props;
    // Kept a moment after closing, for the slide down; unmounted after, to free it.
    const [closing, setClosing] = useState(false);
    if (visible && !closing) setClosing(true);
    useEffect(() => {
        if (visible) return;
        const timer = setTimeout(() => setClosing(false), 350);
        return () => clearTimeout(timer);
    }, [visible]);

    if (!visible && !closing) return null;
    // Keyed by what is shared: a card recycled for another item opens a fresh sheet.
    const sharing = [props.filmId, props.logId, props.listId, props.dossierId].join('|');
    return <ShareSheet key={sharing} {...props} />;
}

function ShareSheet({
    visible, onClose, filmTitle, filmId, posterPath, logId, ownerUsername,
    listId, listTitle, listFilmCount, listCurator, listTopPosters,
    dossierId, dossierTitle, dossierAuthor, dossierKind
}: ShareToLoungeProps) {
    const signedIn = useAuthStore((s) => !!s.user);
    const allLounges = useLoungeStore(s => s.lounges);
    // Fetching until the salons have answered once: the sheet opens before its read begins.
    const isFetching = useLoungeStore(s => s.loungesLoading || !s.loungesRead);
    const loungesFailed = useLoungeStore(s => s.loungesFailed);
    // Only the salons the house lets this member speak in: a pending or muted seat is refused.
    const lounges = allLounges.filter(canPostIn);
    // The message is kept per piece shared as it is written: a sheet closed opens on it again. Let
    // go once sent; put back if the house refused it.
    const me = useAuthStore((s) => s.user?.id);
    const sharing = [filmId, logId, listId, dossierId].join('|');
    const [message, setMessage, letGoMessage] = useKeptWords(me, 'share', sharing);
    // What is shared, as the sheet names it: each slur struck for a reader who asked. Only the
    // words drawn here: what is sent to the room goes as it was written.
    const struck = useStruck();
    const [sending, setSending] = useState(false);
    const [selectedLounge, setSelectedLounge] = useState<string | null>(null);

    useEffect(() => {
        if (!visible || !signedIn) return;
        // Silently: the salons already held stay on screen while they are asked again.
        void useLoungeStore.getState().fetchLounges();
    }, [visible, signedIn]);

    const handleSend = async () => {
        if (!selectedLounge || !signedIn) return;
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
                film_title: cardTitle(dossierTitle),
                // `kind` labels the card (a TAKE, not a DOSSIER); key and type stay `dossier`.
                metadata: { dossier_id: dossierId, author_username: dossierAuthor, kind: dossierKind ?? null },
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
                film_title: cardTitle(filmTitle),
                film_poster: posterPath ?? null,
                metadata
            };
        }

        const content = message.trim() || '';
        letGoMessage();

        // Sent without waiting. sendMessage says every refusal itself; its one silent `false`
        // is a double-tap into the same room, which the per-room throttle keeps quiet. A message
        // refused is put back for the next opening on this piece.
        useLoungeStore.getState().sendMessage(
            selectedLounge,
            content,
            shareType,
            payload
        ).then((sent) => {
            if (sent === false) putBackWords(me, 'share', sharing, content);
        }, (e: unknown) => {
            // Only a crash reaches here: reported, and the member hears the house, not code.
            captureError(e, { where: 'shareToLounge.send', shareType });
            putBackWords(me, 'share', sharing, content);
            reelToast.error('Signal failed to transmit. Try again.');
        });

        onClose();
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

    // A Modal window never resizes for the keyboard on either platform: the sheet rises itself.
    const animatedSheetStyle = useModalKeyboardPadding();
    // Its last control clears the home indicator, as every bottom sheet's does.
    const sheetFoot = useSheetBottom();
    // …and on iOS gives that room to the sheet's words while the keys cover the indicator.
    const foot = useSheetFootWhileTyping(sheetFoot);
    // And it stops below the status bar, as CreateLoungeSheet does: a card taller than the room
    // above the keys gives up the room from its body, which scrolls, never from its top. It rose
    // whole past the status bar and off the screen, taking its title and its X (round 14).
    const sheetTop = overlayTop(useSafeAreaInsets().top);
    // While the message is typed, the body keeps it and SHARE TO LOUNGE in view as the keys
    // take the room; the salons are above, a scroll away.
    const body = useRef<ScrollView>(null);
    const [writing, setWriting] = useState(false);

    return (
        <Modal statusBarTranslucent visible={visible} transparent animationType="slide" onRequestClose={onClose}>
          <InColumn scrim={{ color: 'rgba(0,0,0,0.85)' }}>
            <Animated.View style={[s.overlay, { paddingTop: sheetTop }, animatedSheetStyle]} accessibilityViewIsModal={true} onAccessibilityEscape={onClose}>
                <Animated.View style={[s.card, foot]}>
                    <View style={s.header}>
                        <Text style={s.title}>Share to Lounge</Text>
                        <PressableScale touch="wayOut" onPress={() => { onClose(); }} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic="selection" pressedScale={0.92}
                            accessibilityRole="button" accessibilityLabel="Close">
                            <Text style={s.closeText}>✕</Text>
                        </PressableScale>
                    </View>

                    <ScrollView
                        ref={body}
                        testID="share-body"
                        style={s.body}
                        bounces={false}
                        showsVerticalScrollIndicator={false}
                        // A salon or SHARE pressed while the message is typed acts on the first press.
                        keyboardShouldPersistTaps="handled"
                        onLayout={() => { if (writing) body.current?.scrollToEnd({ animated: false }); }}
                    >
                    {dossierId ? (
                        <Text style={s.filmLabel} numberOfLines={1}>SHARING ESSAY: {struck(dossierTitle)?.toUpperCase()}</Text>
                    ) : listId ? (
                        <Text style={s.filmLabel} numberOfLines={1}>SHARING STACK: {struck(listTitle)?.toUpperCase()}</Text>
                    ) : (
                        <Text style={s.filmLabel} numberOfLines={1}>SHARING: {filmTitle?.toUpperCase()}</Text>
                    )}

                    {(isFetching && lounges.length === 0) ? (
                        <ActivityIndicator color={colors.sepia} style={s.loadingIndicator} accessibilityLabel="Reading the salons" />
                    ) : lounges.length === 0 && loungesFailed ? (
                        // Not "you have joined none": the salons could not be asked.
                        <View style={s.unreachable}>
                            <Text style={s.emptyText}>The salons could not be reached.</Text>
                            <TryAgainLine onPress={() => { void useLoungeStore.getState().fetchLounges(); }} what="ask for the salons" />
                        </View>
                    ) : lounges.length === 0 ? (
                        <Text style={s.emptyText}>No seat yet. Take a seat in a salon in the Lounge, and you can carry this to it.</Text>
                    ) : (
                        <>
                            <Text style={s.selectLabel}>SELECT A SALON</Text>
                            <FlashList
                                maintainVisibleContentPosition={NOT_ANCHORED}
                                data={lounges}
                                estimatedItemSize={52}
                                keyExtractor={(item) => item.id}
                                style={s.loungeList}
                                extraData={selectedLounge}
                                renderItem={renderLoungeItem as any}
                                showsVerticalScrollIndicator={false}
                                keyboardDismissMode="on-drag"
                                // A salon chosen while the message is typed is chosen on the first press.
                                keyboardShouldPersistTaps="handled"
                                // Scrolls inside the body's scroll: Android hands it the drag.
                                nestedScrollEnabled
                            />

                            <TextInput
                                style={s.messageInput}
                                placeholder="Add a message (optional)..."
                                placeholderTextColor={colors.fog}
                                value={message}
                                onChangeText={setMessage}
                                multiline
                                maxLength={MAX_LENGTHS.loungeMessage}
                                keyboardAppearance="dark"
                                accessibilityLabel="Share message"
                                selectionColor={colors.selection}
                                onFocus={() => setWriting(true)}
                                onBlur={() => setWriting(false)}
                            />

                            <PressableScale
                                style={[s.sendBtn, !selectedLounge && UNREADY.plate]}
                                onPress={handleSend}
                                disabled={!selectedLounge || sending}
                                haptic="medium"
                                pressedScale={0.95}
                            >
                                <Text style={[s.sendText, !selectedLounge && UNREADY.words]}>{sending ? 'SENDING...' : 'SHARE TO LOUNGE'}</Text>
                            </PressableScale>
                        </>
                    )}
                    </ScrollView>
                </Animated.View>
                <ToastHost />
            </Animated.View>
          </InColumn>
        </Modal>
    );
}

const s = StyleSheet.create({
    // Its ground is the scrim InColumn draws across the window.
    overlay: { flex: 1, justifyContent: 'flex-end' },
    // Shrinks to the room between the status bar and the keys; its body gives up what it must.
    card: {
        flexShrink: 1,
        backgroundColor: colors.ink, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        borderTopWidth: 2, borderTopColor: colors.sepia, padding: 24,
    },
    // As tall as its words while they fit; past that, it scrolls (the header stays).
    body: { flexGrow: 0, flexShrink: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment },
    closeText: { fontSize: 18, color: colors.fog },
    filmLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, marginBottom: 16 },
    selectLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fog, marginBottom: 8 },
    // 48 by its own box, 6 from the next: a salon is a row a finger picks.
    loungeItem: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, marginBottom: 6 },
    loungeActive: { borderColor: colors.sepia, backgroundColor: colors.sepiaFaint },
    loungeName: { fontFamily: fonts.sub, fontSize: 14, color: colors.bone },
    loungeNameActive: { color: colors.sepia },
    loungeList: { maxHeight: 160 },
    loadingIndicator: { marginVertical: 24 },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', paddingVertical: 24 },
    unreachable: { alignItems: 'center', paddingBottom: 16 },
    messageInput: {
        backgroundColor: colors.well, borderWidth: 1, borderColor: colors.ash,
        borderBottomColor: colors.fieldEdge,
        color: colors.bone, fontFamily: fonts.body, fontSize: 13,
        paddingHorizontal: 12, paddingVertical: 10, minHeight: 60, borderRadius: 4,
        textAlignVertical: 'top', marginTop: 12,
    },
    sendBtn: { backgroundColor: colors.sepia, borderWidth: 1, borderColor: 'transparent', paddingVertical: 14, alignItems: 'center', borderRadius: 4, marginTop: 16 },
    sendText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.ink },
});
