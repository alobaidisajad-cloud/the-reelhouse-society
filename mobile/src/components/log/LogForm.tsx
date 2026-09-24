import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, ScrollView, Alert } from 'react-native';
import VaultNote from '@/src/components/log/VaultNote';
import reelToast from '@/src/utils/reelToast';

import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { colors } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import NitrateCalendar from '@/src/components/NitrateCalendar';
import EditorialDesk from '@/src/components/log/EditorialDesk';
import AuteurToolkit from '@/src/components/log/AuteurToolkit';
import LogVerdict from '@/src/components/log/LogVerdict';
import LogIndexEntry from '@/src/components/log/LogIndexEntry';
import LogClearanceGate from '@/src/components/log/LogClearanceGate';
import { useClearance } from '@/src/hooks/useClearance';
import { Brackets, FieldLabel } from '@/src/components/log/LogFormBody';
import { X, Eye, History, Trash2, Check, ListOrdered, Feather, Sparkles } from 'lucide-react-native';
import { PHYSICAL_OPTIONS, ABANDONED_REASONS, getLocalDateString } from '@/src/hooks/useLogFlow';
import { hasPhysicalFormat } from '@/src/components/log/logRecord';
import { stripHTML, isRTLText } from '@/src/utils/text';
import { dateParts, formatDate, formatLongCalendarDate } from '@/src/utils/timeAgo';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { st } from './LogModalStyles';
import type { useLogFlow } from '@/src/hooks/useLogFlow';
import { useSocialStore } from '@/src/stores/followStore';

import type { User } from '@/src/types';

interface LogFormProps {
    flow: ReturnType<typeof useLogFlow>;
    user: User | null; // From useAuthStore
}

/**
 * THE RECORD, UNSEALED.
 *
 * This page had nine bordered containers stacked on a void and twelve fields
 * permanently unfolded — which is what "cramped" actually was. It reads as one
 * document now:
 *
 *   THE DOCKET      the film, marked with registration brackets, not boxed
 *   THE VERDICT     how you watched it and what you thought
 *   THE MANUSCRIPT  the one box on the page, because it is the sheet you
 *                   write on; the Editorial Desk continues its foot
 *   THE FILING      a catalogue index — one ruled line per entry, stating what
 *                   it holds and opening in place
 *
 * Every tool is shown to every rank. One a member cannot open carries the app's
 * brass key and names the rank; opening it shows the real instrument, inert,
 * with the clearance gate beneath. The refusal that used to interrupt the act
 * four times now appears once, inside a panel they chose to open.
 *
 * No state, logic, validation or save path changed — this is presentation.
 */
export default function LogForm({ flow, user }: LogFormProps) {
    const router = useRouter();
    const following = useSocialStore(s => s.following);
    const {
        film,
        status, rating, review, isSpoiler, abandonedReason, date, watchedWith, privateNotes, physicalMedia,
        autopsy, altPoster, editorialHeader, dropCap, pullQuote, autopsyOpen, calendarOpen, showDeleteConfirm, submitting,
        setStatus, setRating, setReview, setIsSpoiler, setAbandonedReason,
        setDate, setWatchedWith, setPrivateNotes, setPhysicalMedia,
        setCalendarOpen, setShowDeleteConfirm,
        setDropCap, setPullQuote, setEditorialHeader,
        setAutopsyOpen, setAutopsy, setAltPoster,
        isRewatchMode, previousLog,
        noteReady, noteUnreachable, removeVaultNote,
        availablePosters, availableBackdrops,
        isEditing,
        handleDelete,
        discardDraft,
        hasUnsavedChanges,
        toggleList,
        lists
    } = flow;

    const yesterday = useMemo(() => getLocalDateString(-1), []);
    const todayStr = useMemo(() => getLocalDateString(0), []);
    const deskName = (user?.username || 'you').toUpperCase();

    /**
     * ── FOUR ROPES, ONE WAY TO HOLD THEM ────────────────────────────────────
     * These four were the app's most-met ropes — logging is the core act — and
     * the only ones outside `useClearance`. Each pushed a bare '/membership', so
     * the Society page could not say what the member reached for, the funnel
     * never saw a single tap from here, and a lapsed member was pitched as a
     * stranger in the room where they have filed the longest.
     *
     * Dismissing this modal before travelling (the Concierge's law) is now done
     * by `openSociety`, which knows this screen is presented.
     *
     * WHERE TO COME BACK TO depends on what is open. A new log keeps a draft, so
     * the form itself is the way back. An EDIT keeps none — returning an editing
     * member to /log-modal would hand them an empty form — so its way back is
     * the log they were editing.
     */
    const returnTo = flow.editLogId ? `/log/${flow.editLogId}` : '/log-modal';
    const desk = useClearance('editorial-desk', returnTo);
    const breakdown = useClearance('breakdown-engine', returnTo);
    const shelf = useClearance('physical-archive', returnTo);
    const vault = useClearance('the-vault', returnTo);
    /**
     * Curatorial Control was the one tool that stayed a VANISH: the poster was
     * `disabled` for anyone below the Auteur — no label, no door, a tap that did
     * nothing on a feature the Society page sells by name. It now behaves like
     * the other four: the panel opens, the instrument is shown inert, and one
     * rope beneath it says what it is and who opens it.
     */
    const curation = useClearance('curatorial-control', returnTo);

    /**
     * An instrument shown but not usable is inert to touch AND silent to a
     * screen reader — the same pair the shared `Locked` applies. pointerEvents
     * alone left VoiceOver landing on a "Private notes" field nobody could type
     * into, with the rope that explains it further down the list.
     */
    const inert = (held: boolean) => held ? {} : {
        pointerEvents: 'none' as const,
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
    };

    /**
     * An entry opens itself when it ALREADY HOLDS SOMETHING.
     *
     * A fresh log opens calm — most films are never autopsied and most records
     * carry no private note. But editing last year's entry, or restoring a
     * draft, must never make a member hunt for their own words. Computed once,
     * from what arrived.
     */
    const [deskOpen, setDeskOpen] = useState(() => !!(dropCap || pullQuote || editorialHeader));
    const [filedOpen, setFiledOpen] = useState(() => !!watchedWith);
    const [physicalOpen, setPhysicalOpen] = useState(() => hasPhysicalFormat(physicalMedia));
    // Opened once the Vault answers with something in it — the note arrives
    // after the form is already on screen, so this cannot be decided at mount.
    const [vaultOpen, setVaultOpen] = useState(() => !!privateNotes);
    const vaultOpenedForNote = useRef(false);
    useEffect(() => {
        if (privateNotes && !vaultOpenedForNote.current) {
            vaultOpenedForNote.current = true;
            setVaultOpen(true);
        }
    }, [privateNotes]);
    const [stacksOpen, setStacksOpen] = useState(false);
    const [posterOpen, setPosterOpen] = useState(false);

    const scoredAxes = useMemo(
        () => Object.entries(autopsy ?? {}).filter(([k, v]) => k !== '_v' && typeof v === 'number').length,
        [autopsy],
    );
    // The autopsy's open state lives in the flow (it predates this layout), so
    // the same "already holds something" rule is applied to it once on arrival.
    useEffect(() => {
        if (scoredAxes > 0) setAutopsyOpen(true);
        // On arrival only — reopening it every render would make it uncloseable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!film) return null;

    const filmTitle = film.title ?? film.name ?? 'Untitled';

    return (
        <View style={{ flex: 1 }}>
            {/* ══ THE DOCKET ══ the file being opened */}
            <View style={st.bracketed}>
                <Brackets />
                <View style={st.filmHeader}>
                    {film.poster_path && (
                        <PressableScale
                            onPress={() => {
                                // Its pictures are fetched up front only for the
                                // rank; anyone else gets them on opening it.
                                if (!curation.held) flow.loadImages();
                                setPosterOpen(o => !o);
                            }}
                            hitSlop={null}
                            pressedScale={0.97}
                            haptic="selection"
                            accessibilityRole="button"
                            accessibilityState={{ expanded: posterOpen }}
                            accessibilityLabel={curation.held
                                ? 'Choose an alternate poster'
                                : 'Curatorial Control. Choose an alternate poster. Opens with The Auteur.'}
                        >
                            <Image source={{ uri: tmdb.poster(altPoster ?? film.poster_path, 'w342') }} style={st.poster} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                            {altPoster && <View style={st.altBadge}><Text style={st.altBadgeText}>ALT</Text></View>}
                        </PressableScale>
                    )}
                    <View style={st.filmInfoCol}>
                        <Text style={st.filmTitle} {...displayTextProps} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.8}>{filmTitle}</Text>
                        {film.release_date ? (
                            <Text style={st.filmYear}>{film.release_date.slice(0, 4)}</Text>
                        ) : null}
                    </View>
                </View>
            </View>

            {/* Curatorial Control — the Auteur's, exercised on the record's own
                face rather than buried inside the autopsy where it had no business. */}
            {posterOpen && (
                <Animated.View entering={FadeInDown.duration(200)} style={st.idxBody}>
                    <FieldLabel>CURATORIAL CONTROL</FieldLabel>
                    <View style={!curation.held && st.lockedPanel} {...inert(curation.held)}>
                    {availablePosters.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.flatListGapPad} keyboardShouldPersistTaps="handled">
                            <PressableScale hitSlop={null} onPress={() => { setAltPoster(null); }} style={[st.pThumb, altPoster === null && st.pThumbActive]} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityState={{ selected: altPoster === null }} accessibilityLabel="Use the default poster">
                                <Text style={[st.pDefault, altPoster === null && st.pDefaultActive]}>DEFAULT</Text>
                            </PressableScale>
                            {availablePosters.map(p => (
                                <PressableScale key={p.file_path} hitSlop={null} onPress={() => { setAltPoster(p.file_path); }} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityState={{ selected: altPoster === p.file_path }} accessibilityLabel="Select this alternate poster">
                                    <Image source={{ uri: tmdb.poster(p.file_path, 'w92') }} style={[st.pImg, altPoster === p.file_path && st.pImgActive, altPoster && altPoster !== p.file_path && st.pImgFaded]} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                                </PressableScale>
                            ))}
                        </ScrollView>
                    ) : flow.imagesLoaded ? (
                        // Said only once TMDB has actually answered — never while
                        // the request is still out, and never after it failed.
                        <Text style={st.noData}>No alternative posters found on TMDB.</Text>
                    ) : null}
                    </View>
                    {!curation.held && <LogClearanceGate rank={curation.rank} standing={curation.standing} names="Curatorial Control" onPress={curation.open} />}
                </Animated.View>
            )}

            {/* Your previous take — read the old verdict before passing a new one. */}
            {isRewatchMode && previousLog && (
                <Animated.View entering={FadeInDown.delay(100).duration(400)} style={st.prevTakeBox}>
                    <View style={st.prevTakeHeader}>
                        <History size={11} color={colors.sepia} />
                        <Text style={st.prevTakeLabel}>YOUR PREVIOUS TAKE</Text>
                        {(previousLog.viewCount || 1) > 1 && (
                            <View style={st.prevTakeCountBadge}>
                                <Text style={st.prevTakeCountText}>VIEWING {previousLog.viewCount || 1}</Text>
                            </View>
                        )}
                    </View>
                    {previousLog.rating > 0 && (
                        <View style={st.prevTakeRatingRow}>
                            <ReelRating rating={previousLog.rating} size={13} />
                            <Text style={st.prevTakeRatingNum}>
                                {previousLog.rating % 1 === 0 ? previousLog.rating : previousLog.rating.toFixed(1)}/5
                            </Text>
                        </View>
                    )}
                    {previousLog.review ? (
                        // stripHTML, not a fourth private copy of it — the one that
                        // lived here ate a member's own angle brackets.
                        <Text style={[st.prevTakeReview, isRTLText(previousLog.review) && st.rtlText]} {...scaledTextProps} numberOfLines={6}>
                            &ldquo;{stripHTML(previousLog.review)}&rdquo;
                        </Text>
                    ) : null}
                    {!!dateParts(previousLog.watchedDate) && (
                        <Text style={st.prevTakeDate}>LOGGED {formatDate(previousLog.watchedDate)}</Text>
                    )}
                </Animated.View>
            )}

            {/* ══ THE SHEET ══ the document rises off the film, on the app's
                blessed upward lift — the same construction as the record's own
                content card. Negative rails so it spans the full width inside a
                scroll that is already inset by 20. */}
            <View style={st.sheet}>
            {/* ══ THE VERDICT ══ */}
            <SectionDivider label="THE VERDICT" />
            <View style={st.statusRow}>
                {(['watched', 'rewatched', 'abandoned'] as const).map(s => (
                    <PressableScale key={s} style={[st.statusBtn, status === s && st.statusActive]} onPress={() => { setStatus(s); }} hitSlop={null} accessibilityRole="button" accessibilityState={{ selected: status === s }} accessibilityLabel={s} haptic="selection">
                        {s === 'watched' && <Eye size={14} color={status === s ? colors.ink : colors.fog} />}
                        {s === 'rewatched' && <History size={14} color={status === s ? colors.ink : colors.fog} />}
                        {s === 'abandoned' && <X size={14} color={status === s ? colors.ink : colors.fog} />}
                        <Text style={[st.statusText, status === s && st.statusTextActive]}>{s.toUpperCase()}</Text>
                    </PressableScale>
                ))}
            </View>

            {status === 'abandoned' ? (
                <View style={st.sec}>
                    <LogVerdict status={status} rating={rating} />
                    <View style={st.tagRow}>
                        {ABANDONED_REASONS.map((r: string) => (
                            <PressableScale key={r} style={st.hit48} onPress={() => { setAbandonedReason(r); }} hitSlop={null} accessibilityRole="button" accessibilityState={{ selected: abandonedReason === r }} accessibilityLabel={r} haptic="selection">
                                <View style={[st.tag, abandonedReason === r && st.tagActive]}>
                                    <Text style={[st.tagText, abandonedReason === r && st.tagTextActive]}>{r}</Text>
                                </View>
                            </PressableScale>
                        ))}
                    </View>
                </View>
            ) : (
                <View style={st.sec}>
                    <LogVerdict status={status} rating={rating} />
                    <View style={st.ratingBody}>
                        <ReelRating rating={rating} size={44} onChange={(v: number) => { setRating(v === rating ? 0 : v); if (Number.isInteger(v)) { TactileEngine.mutate(); } else { TactileEngine.navigate(); } }} />
                    </View>
                </View>
            )}

            {/* ══ THE MANUSCRIPT ══ the one box on the page */}
            <SectionDivider label="THE MANUSCRIPT" />
            <View style={st.manuscriptFrame}>
                <View style={st.manuscriptHeader}>
                    <Feather size={10} color={colors.sepia} strokeWidth={1.5} />
                    {/* The frame no longer repeats the movement it sits under, so
                        this fits at a size that can actually be read — it was 6.5pt,
                        the smallest text in the app, shrinking further to 6.3. */}
                    <Text style={st.manuscriptHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        FROM THE DESK OF @{deskName}
                    </Text>
                </View>
                <TextInput testID="review-input" style={[st.reviewInput, isRTLText(review) && st.rtlText]} placeholder="Write your thoughts as if typing on a manuscript..." placeholderTextColor={colors.fog} value={review} onChangeText={setReview} multiline maxLength={2000} textAlignVertical="top" {...scaledTextProps} selectionColor={'rgba(220,166,58,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} keyboardAppearance="dark" accessibilityLabel="Write your film review" />
                <View style={st.reviewFooter}>
                    <PressableScale style={st.spoilerRow} onPress={() => { setIsSpoiler(!isSpoiler); }} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ selected: isSpoiler }} accessibilityLabel="Contains spoilers">
                        <View style={[st.cbox, isSpoiler && st.cboxOn]}>{isSpoiler && <Check size={10} color={colors.ink} />}</View>
                        <Text style={st.spoilerText}>CONTAINS SPOILERS</Text>
                    </PressableScale>
                    <Text style={[st.charCount, review.length > 1800 && st.charCountWarn]}>{review.length}/2000</Text>
                </View>
            </View>

            {/* The Editorial Desk continues that sheet — attached to its foot, no
                border between them, because decorating your writing is writing. */}
            {deskOpen ? (
                <View style={st.deskBody}>
                    <View style={[st.deskFootName, { marginBottom: 14 }]}>
                        <Sparkles size={10} color={colors.sepia} strokeWidth={1.5} />
                        <Text style={st.deskFootText}>THE EDITORIAL DESK</Text>
                    </View>
                    <View style={!desk.held && st.lockedPanel} {...inert(desk.held)}>
                        <EditorialDesk
                            dropCap={dropCap}
                            setDropCap={setDropCap}
                            pullQuote={pullQuote}
                            setPullQuote={setPullQuote}
                            editorialHeader={editorialHeader}
                            setEditorialHeader={setEditorialHeader}
                            availableBackdrops={availableBackdrops}
                        />
                    </View>
                    {!desk.held && <LogClearanceGate rank={desk.rank} standing={desk.standing} names="The Editorial Desk" onPress={desk.open} />}
                </View>
            ) : (
                <PressableScale style={st.deskFoot} onPress={() => { if (!desk.held) flow.loadImages(); setDeskOpen(true); }} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ expanded: false }} accessibilityLabel={desk.held ? 'The Editorial Desk' : 'The Editorial Desk. Opens with The Archivist.'}>
                    <View style={st.deskFootName}>
                        <Sparkles size={10} color={colors.sepia} strokeWidth={1.5} />
                        <Text style={st.deskFootText}>THE EDITORIAL DESK</Text>
                    </View>
                    <Text style={[st.deskFootValue, !desk.held && { color: colors.sepia }]} numberOfLines={1}>
                        {desk.held ? (dropCap || pullQuote || editorialHeader ? 'IN USE' : '—') : 'THE ARCHIVIST'}
                    </Text>
                </PressableScale>
            )}

            {/* ══ THE FILING ══ the record's own index */}
            <SectionDivider label="THE FILING" />
            <View style={st.idxWrap}>
                <LogIndexEntry
                    name="THE AUTOPSY"
                    origin="auteur"
                    value={scoredAxes > 0 ? `${scoredAxes} OF 6 SCORED` : ''}
                    lockedTo={breakdown.held ? undefined : 'THE AUTEUR'}
                    open={autopsyOpen}
                    onPress={() => { setAutopsyOpen(!autopsyOpen); }}
                >
                    <View style={st.idxBody}>
                        <View style={!breakdown.held && st.lockedPanel} {...inert(breakdown.held)}>
                            <AuteurToolkit
                                isAuteur={breakdown.held}
                                autopsy={autopsy}
                                setAutopsy={setAutopsy}
                            />
                        </View>
                        {!breakdown.held && <LogClearanceGate rank={breakdown.rank} standing={breakdown.standing} names="The Autopsy" onPress={breakdown.open} />}
                    </View>
                </LogIndexEntry>

                <LogIndexEntry
                    name="THE PHYSICAL ARCHIVE"
                    origin="archivist"
                    value={hasPhysicalFormat(physicalMedia) ? physicalMedia.toUpperCase() : ''}
                    lockedTo={shelf.held ? undefined : 'THE ARCHIVIST'}
                    open={physicalOpen}
                    onPress={() => { setPhysicalOpen(o => !o); }}
                >
                    <View style={st.idxBody}>
                        <View style={[st.tagRow, !shelf.held && st.lockedPanel]} {...inert(shelf.held)}>
                            {PHYSICAL_OPTIONS.map(opt => (
                                <PressableScale key={opt} style={st.hit48} onPress={() => { setPhysicalMedia(opt); }} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ selected: physicalMedia === opt }} accessibilityLabel={opt}>
                                    <View style={[st.tag, physicalMedia === opt && st.tagActive]}>
                                        <Text style={[st.tagText, physicalMedia === opt && st.tagTextActive]}>{opt}</Text>
                                    </View>
                                </PressableScale>
                            ))}
                        </View>
                        {!shelf.held && <LogClearanceGate rank={shelf.rank} standing={shelf.standing} names="The Physical Archive" onPress={shelf.open} />}
                    </View>
                </LogIndexEntry>

                {/* The Vault shows only THAT it holds something, never a preview —
                    it is the one field a member might not want legible over their
                    shoulder, and it is called The Vault for a reason. */}
                <LogIndexEntry
                    name="THE VAULT"
                    origin="archivist"
                    value={privateNotes ? ' ' : ''}
                    lockedTo={vault.held ? undefined : 'THE ARCHIVIST'}
                    open={vaultOpen}
                    onPress={() => { setVaultOpen(o => !o); }}
                >
                    <View style={st.idxBody}>
                        {/* A note belongs to the VIEWING it was written about, so
                            the field stays shut until this log's note is in hand.
                            Typing into a box that is about to be filled loses
                            writing; an empty box that is about to be filled and
                            then SAVED loses more. Until it opens, nothing here is
                            touched, and an untouched note is never sent. */}
                        {!noteReady ? (
                            <View style={st.vaultWaiting}>
                                <Text style={st.vaultWaitingText}>
                                    {noteUnreachable ? 'Opens when you\'re back online.' : 'Opening the Vault…'}
                                </Text>
                            </View>
                        ) : !vault.held && !!privateNotes ? (
                            // A member whose rank has ended, over a note they
                            // wrote. READING IS NEVER GATED: the note is drawn
                            // whole, at full strength, and read aloud — not
                            // faded and hidden inside a locked instrument, which
                            // is how this state first shipped. Taking it back is
                            // never gated either; only changing it is.
                            <View>
                                <VaultNote note={privateNotes} inPanel />
                                <View style={st.vaultKeptRow}>
                                    <Text style={st.vaultKeptText} {...scaledTextProps}>
                                        Yours to keep or remove.
                                    </Text>
                                    <PressableScale
                                        style={st.vaultKeptRemove}
                                        hitSlop={null}
                                        haptic="selection"
                                        accessibilityRole="button"
                                        accessibilityLabel="Remove this note"
                                        accessibilityHint="The viewing stays. The note is gone for good."
                                        onPress={() => {
                                            Alert.alert(
                                                'Remove this note?',
                                                'The viewing stays. The note is gone for good.',
                                                [
                                                    { text: 'Keep', style: 'cancel' },
                                                    {
                                                        text: 'Remove', style: 'destructive',
                                                        onPress: () => {
                                                            void (async () => {
                                                                try {
                                                                    const res = await removeVaultNote();
                                                                    if (res) reelToast(res.queuedOffline ? 'Note removed. Will sync when connected.' : 'Note removed.');
                                                                } catch {
                                                                    reelToast.error('The note could not be removed. Try again.');
                                                                }
                                                            })();
                                                        },
                                                    },
                                                ],
                                                { cancelable: true },
                                            );
                                        }}
                                    >
                                        <Trash2 size={14} color={colors.crimson} strokeWidth={1.5} />
                                        <Text style={st.vaultKeptRemoveText}>REMOVE NOTE</Text>
                                    </PressableScale>
                                </View>
                            </View>
                        ) : (
                            <View style={!vault.held && st.lockedPanel} {...inert(vault.held)}>
                                <TextInput style={[st.reviewInput, st.privateNotesInput, isRTLText(privateNotes) && st.rtlText]} placeholder="Notes for the cutting room floor…" placeholderTextColor={colors.fog} value={privateNotes} onChangeText={setPrivateNotes} multiline maxLength={1000} textAlignVertical="top" {...scaledTextProps} keyboardAppearance="dark" accessibilityLabel="Private notes" selectionColor={'rgba(220,166,58,0.3)'} />
                                {/* Said once, where the surprise would be: a
                                    rewatch begins a new viewing, and its note
                                    starts blank because the one before it is
                                    still with the viewing it was about. */}
                                {isRewatchMode && (
                                    <Text style={st.vaultHint} {...scaledTextProps}>
                                        This note belongs to this viewing. Notes from your earlier viewings stay with them.
                                    </Text>
                                )}
                            </View>
                        )}
                        {noteReady && !vault.held && <LogClearanceGate rank={vault.rank} standing={vault.standing} names="The Vault" onPress={vault.open} />}
                    </View>
                </LogIndexEntry>

                <LogIndexEntry
                    name="FILED"
                    value={`${formatDate(date)}${watchedWith ? ` · WITH ${watchedWith.toUpperCase()}` : ''}`}
                    open={filedOpen}
                    onPress={() => { setFiledOpen(o => !o); }}
                >
                    <View style={st.idxBody}>
                        <View style={st.quickDateRow}>
                            <PressableScale style={st.hit48} onPress={() => { setDate(todayStr); setCalendarOpen(false); }} hitSlop={null} accessibilityRole="button" accessibilityState={{ selected: date === todayStr }} accessibilityLabel="Watched today" haptic="selection">
                                <View style={[st.qDateBtn, date === todayStr && st.qDateActive]}>
                                    <Text style={[st.qDateText, date === todayStr && st.qDateTextActive]}>TODAY</Text>
                                </View>
                            </PressableScale>
                            <PressableScale style={st.hit48} onPress={() => { setDate(yesterday); setCalendarOpen(false); }} hitSlop={null} accessibilityRole="button" accessibilityState={{ selected: date === yesterday }} accessibilityLabel="Watched yesterday" haptic="selection">
                                <View style={[st.qDateBtn, date === yesterday && st.qDateActive]}>
                                    <Text style={[st.qDateText, date === yesterday && st.qDateTextActive]}>YESTERDAY</Text>
                                </View>
                            </PressableScale>
                        </View>
                        <PressableScale style={st.ruledRow} onPress={() => { setCalendarOpen(!calendarOpen); }} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ expanded: calendarOpen }} accessibilityLabel={`Watched on ${formatLongCalendarDate(date)}. Change the date.`}>
                            <Text style={st.ruledValue}>{formatLongCalendarDate(date)}</Text>
                            <Text style={st.ruledAction}>{calendarOpen ? 'CLOSE' : 'CHANGE'}</Text>
                        </PressableScale>
                        {calendarOpen && <View style={st.calendarWrap}><NitrateCalendar value={date} onChange={(v) => { setDate(v); setCalendarOpen(false); }} /></View>}

                        <View style={{ marginTop: 18 }}>
                            <FieldLabel>WATCHED WITH</FieldLabel>
                            <TextInput style={st.ruledField} placeholder="A name, a memory, or @username…" placeholderTextColor={colors.fog} value={watchedWith} onChangeText={setWatchedWith} maxLength={60} {...scaledTextProps} selectionColor={'rgba(220,166,58,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} autoCorrect={false} autoCapitalize="none" keyboardAppearance="dark" accessibilityLabel="Watched with companion" />
                            {(watchedWith || '').includes('@') && following && following.length > 0 && (() => {
                                const atMatch = watchedWith.match(/@([\w.]*)$/);
                                if (!atMatch) return null;
                                const partial = atMatch[1].toLowerCase();
                                const matches = following.filter((u: string) => u.toLowerCase().startsWith(partial)).slice(0, 4);
                                if (matches.length === 0) return null;
                                return (
                                    <Animated.View entering={FadeIn.duration(150)} style={st.autoSuggestWrap}>
                                        {matches.map((username: string) => (
                                            <PressableScale
                                                key={username}
                                                style={st.autoSuggestItem}
                                                onPress={() => { setWatchedWith(watchedWith.replace(/@[\w.]*$/, '@' + username + ' ')); }}
                                                hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }}
                                                haptic="selection"
                                                accessibilityRole="button"
                                                accessibilityLabel={`Watched with @${username}`}
                                            >
                                                <Text style={st.autoSuggestText}>@{username}</Text>
                                            </PressableScale>
                                        ))}
                                    </Animated.View>
                                );
                            })()}
                        </View>
                    </View>
                </LogIndexEntry>

                {lists.length > 0 && (() => {
                    const chosen = lists.filter((l: any) => l.films.some((f: any) => f.id === film.id)).length;
                    return (
                        <LogIndexEntry
                            name="STACKS"
                            value={chosen > 0 ? `${chosen} SELECTED` : ''}
                            open={stacksOpen}
                            onPress={() => { setStacksOpen(o => !o); }}
                        >
                            <View style={st.idxBody}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.flatListGapPad} keyboardShouldPersistTaps="handled">
                                    {lists.map((list: any) => {
                                        const isIn = list.films.some((f: any) => f.id === film.id);
                                        return (
                                            // The pressable carries the 48pt box; the chip inside it
                                            // keeps its own size. No halo is needed once the box is
                                            // real, and a halo would only have reached its neighbour.
                                            <PressableScale key={list.id} style={st.hit48} onPress={() => { toggleList(list.id); }} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ selected: isIn }} accessibilityLabel={list.title}>
                                                <View style={[st.listChip, isIn && st.listChipOn]}>
                                                    {isIn && <Check size={12} color={colors.ink} />}
                                                    {list.isPrivate && <ListOrdered size={10} color={isIn ? colors.ink : colors.fog} />}
                                                    {list.isRanked && <ListOrdered size={10} color={isIn ? colors.ink : colors.fog} />}
                                                    <Text style={[st.listChipText, isIn && st.listChipTextActive]} numberOfLines={1}>{list.title}</Text>
                                                </View>
                                            </PressableScale>
                                        );
                                    })}
                                    <View style={{ width: 20 }} />
                                </ScrollView>
                            </View>
                        </LogIndexEntry>
                    );
                })()}
            </View>

            </View>

            {/* Past the end of the record: the things you should have to reach for.
                Delete used to be the FIRST thing on this page when editing. */}
            <View style={st.tailRow}>
                {hasUnsavedChanges && (
                    <PressableScale style={st.discardBtn} onPress={() => { TactileEngine.warn(); discardDraft(); router.back(); }} disabled={submitting} hitSlop={null} haptic="heavy" accessibilityRole="button" accessibilityLabel="Discard this draft">
                        <Text style={[st.cancelText, { color: colors.fog }]}>DISCARD DRAFT</Text>
                    </PressableScale>
                )}
                {isEditing && !showDeleteConfirm && (
                    <PressableScale style={st.deleteBtn} onPress={() => { setShowDeleteConfirm(true); }} hitSlop={null} haptic="light" accessibilityRole="button" accessibilityLabel="Delete this entire log">
                        <Trash2 size={14} color={colors.crimson} />
                        <Text style={st.deleteBtnText}>DELETE THIS ENTIRE LOG</Text>
                    </PressableScale>
                )}
                {showDeleteConfirm && (
                    <View style={st.deleteConfirm}>
                        <Text style={st.deleteConfirmText}>DELETE THIS LOG? THIS CANNOT BE UNDONE.</Text>
                        <View style={st.deleteConfirmRow}>
                            <PressableScale style={st.deleteYes} onPress={() => { TactileEngine.destroy(); handleDelete(); }} hitSlop={null} accessibilityRole="button" accessibilityLabel="Confirm deletion"><Text style={st.deleteBtnLabel}>CONFIRM DELETE</Text></PressableScale>
                            <PressableScale style={st.deleteNo} onPress={() => { setShowDeleteConfirm(false); }} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel="Keep this log"><Text style={[st.deleteBtnLabel, st.cancelColor]}>CANCEL</Text></PressableScale>
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
}
