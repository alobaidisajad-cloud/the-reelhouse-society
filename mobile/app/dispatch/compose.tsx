import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Keyboard, InteractionManager, Alert, AppState, NativeSyntheticEvent, Platform, TextInputSelectionChangeEventData } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
// The preview mounts `EssayBody`, which carries the link guard and the render cap.
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bold, Italic, Type, Quote, Minus, Link2 } from 'lucide-react-native';
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import Animated, { useAnimatedStyle, useAnimatedKeyboard } from 'react-native-reanimated';

import { useAuthStore } from '@/src/stores/auth';
import { useClearance } from '@/src/hooks/useClearance';
import { showTierDoor } from '@/src/utils/tierDoor';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
// The fence an essay is filed against (see `limit`).
import { isOverLimit, remainingChars, MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import PressableScale from '@/src/components/PressableScale';
import { ComposeBallotScreen, ComposeShortScreen, FilmPicker } from '@/src/components/dispatch/ComposeDesks';
import {
  SeriesPicker, freshPartFor, roman, type SeriesChoice,
} from '@/src/components/dispatch/SeriesPicker';
import { FORMS, PaperBack, PaperDoor, PaperPicker } from '@/src/components/dispatch/paper/PaperMore';
import { EssayHead } from '@/src/components/dispatch/paper/PaperEssay';
import { readMinutes, readTimeOf } from '@/src/components/dispatch/readTime';
import { WEEKDAYS, hourLabel } from '@/src/components/dispatch/dayLabel';
import { paperTierOf } from '@/src/stores/dispatchTypes';
import { formatDateMonthDay } from '@/src/utils/timeAgo';
import { useDoor } from '@/src/hooks/useDoor';
import {
  pullDraft, pushDraft, dropDraft, whichCopy, SYNC_EVERY_MS, type RemoteDraft,
} from '@/src/utils/draftSync';
import {
  adoptLegacyDrafts, clearDraft, readDraft, writeDraft, unreadableDraftFound,
  type DossierDraft,
} from '@/src/utils/memberDrafts';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import {
  groupDigits, DOC_MARGIN, DOC_PAD, DOC_RAIL, actionLabelProps,
} from '@/src/components/dispatch/paper/paperMetrics';
import { excerptFor } from '@/src/components/dispatch/excerpt';
// Every text here takes a ceiling: React Native's own default scales without one.
import { scaledTextProps, deckLabelProps } from '@/src/constants/textScaling';
import { useDispatch } from '@/src/stores/dispatch';
import type { FilingKind } from '@/src/stores/dispatchTypes';
import { EDGE_LIT } from '@/src/theme/light';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { nav } from '@/src/utils/typedRouter';

// A long essay survives a background-kill. Whose each draft is: src/utils/memberDrafts.ts.

/** The counter shows only in the last ~870 words: from the first, a fence would feel editorial. */
const LIMIT_WARNING_CHARS = 5000;

/**
 * `TUESDAY · 21:40`, from the app's own tables.
 *
 * NEVER `Intl` — it is not in Hermes and this app ships no polyfill, so a
 * `toLocaleString` would work in every test and throw on a device.
 */
const whenOf = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${WEEKDAYS[d.getDay()]} · ${hourLabel(iso)}`;
};

/** How long each side is, which is half of what makes the choice answerable. */
const wordsOf = (text?: string): string => {
    const n = (text ?? '').trim() ? (text ?? '').trim().split(/\s+/).length : 0;
    return `${groupDigits(n)} ${n === 1 ? 'WORD' : 'WORDS'}`;
};

/**
 * ── THE DESK YOU ARE SENT TO ─────────────────────────────────────────────────
 * One route, five desks. `?kind=` decides which; with no kind the picker asks.
 *
 * ── WHY ONE ROUTE AND NOT FIVE ──────────────────────────────────────────────
 * The picker and the desk are one act — choose a form, fill it in — and putting
 * them on two routes means the back gesture from a desk returns to a picker the
 * member has already answered, which they then have to dismiss twice. Setting a
 * param keeps it one screen with one way out, and the desk's own BACK clears the
 * kind rather than leaving the modal, so a member who picked WIRE by mistake is
 * one tap from picking again.
 *
 * The AUTEURS gate is checked HERE, once, rather than in each desk: a ballot and
 * a dossier need the tier, a take, a seeking and a wire do not, and a member who
 * cannot file one must never reach its desk to find out at the end.
 */
export default function ComposeScreen() {
    const params = useLocalSearchParams<{ kind?: string; edit?: string }>();
    const user = useAuthStore((s) => s.user);
    const kind = (params.kind ?? (params.edit ? 'dossier' : '')) as FilingKind | '';

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);
    // Signed out: said here, before any form. The Concierge offers "File to the Dispatch" to
    // everyone, and a desk has nothing to draw for a reader who is not a member.
    useEffect(() => {
        if (user) return;
        reelToast.error('Filing is for members.');
        // The wait matters: this fires while the modal is still animating in,
        // and unguarded both pops land, costing two screens instead of one.
        InteractionManager.runAfterInteractions(() => {
            if (isMounted.current) nav.back();
        });
    }, [user]);

    // The door (`posts_door`: two days a member, five films) is checked above every desk. useDoor
    // fails OPEN: a read that times out meets the server's refusal, never a lockout.
    const door = useDoor();
    if (user && !door.loading && !door.open) return <TheDoor door={door} />;

    // An unrecognised kind in a link is not a crash and not a blank screen; it
    // is somebody arriving without having chosen, which is what the picker is.
    const known = (['take', 'seeking', 'wire', 'ballot', 'dossier'] as const)
        .includes(kind as FilingKind);

    if (!known) return <KindPicker />;
    if (kind === 'dossier') return <ComposeDossierScreen />;
    if (kind === 'ballot') return <ComposeBallotScreen />;
    return <ComposeShortScreen kind={kind as 'take' | 'seeking' | 'wire'} />;
}

/**
 * WHAT ARE YOU FILING? — the five forms, with the two AUTEURS ones locked for
 * anyone who cannot file them.
 *
 * The lock is shown rather than the row hidden. A member should know the house
 * has a long form and a ballot before they can use them; a menu that silently
 * grows when you pay is a menu that told you nothing about what you were buying.
 */
function KindPicker() {
    const user = useAuthStore((s) => s.user);
    // Each locked form ropes its OWN feature, so the Society page is told which was reached for.
    const essays = useClearance('essays', '/dispatch/compose');
    const ballots = useClearance('ballots', '/dispatch/compose');
    const holds = (k: string) => (k === 'ballot' ? ballots.held : essays.held);
    const insets = useSafeAreaInsets();
    // Read once, on mount. A draft cannot appear while this sheet is open — the
    // only thing that writes one is the room this sheet leads to.
    const hasDossierDraft = useMemo(
        () => readDraft(user?.id, 'dossier') !== null,
        [user?.id],
    );

    return (
        <View style={[p.screen, { justifyContent: 'flex-end' }]}>
            <RoomLight room="dispatch" />
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
            <View style={{ paddingBottom: insets.bottom }}>
                <PaperPicker
                    forms={FORMS.map((f) => ({
                        ...f,
                        locked: f.locked ? !holds(f.kind) : false,
                        // The room keeps ONE unfinished essay; the picker says so.
                        inProgress: f.kind === 'dossier' && hasDossierDraft,
                    }))}
                    onPick={(k) => router.setParams({ kind: k })}
                    onLocked={(k) => (k === 'ballot' ? ballots.open() : essays.open())}
                    lockedStanding={essays.standing}
                    // The house rules, at the door every filing goes through.
                    onRules={() => (router.push as (h: string) => void)('/dispatch/rules')}
                />
            </View>
        </View>
    );
}

/**
 * THE DOOR — the two things the house asks before it takes a filing.
 *
 * Not a wall to argue with: it states exactly what remains, draws both
 * conditions as rules that FILL so "three of five" is a length before it is a
 * number, and offers the one act that moves the count. A button that merely
 * dismissed this would be a button that changed nothing.
 */
function TheDoor({ door }: { door: ReturnType<typeof useDoor> }) {
    const insets = useSafeAreaInsets();
    const user = useAuthStore((s) => s.user);
    const hasHeldWork = useMemo(
        () => readDraft(user?.id, 'dossier') !== null,
        [user?.id],
    );
    return (
        <View style={p.screen}>
            <RoomLight room="dispatch" />
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
            <PaperBack label="THE DISPATCH" onBack={() => nav.back()} />
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: insets.bottom + 24 }}
                showsVerticalScrollIndicator={false}
            >
                <PaperDoor
                    films={door.films ?? 0}
                    filmsNeeded={door.filmsNeeded}
                    days={door.days ?? 0}
                    daysNeeded={door.daysNeeded}
                    // An Auteur can be behind the door holding an essay: the door says it is kept.
                    held={hasHeldWork}
                    // Replaces the door, so back from logging a film lands on the paper.
                    onLog={() => (router.replace as (h: string) => void)('/log-modal')}
                />
            </ScrollView>
        </View>
    );
}

function ComposeDossierScreen() {
    const { edit, initialTitle, initialContent } = useLocalSearchParams<{ edit?: string, initialTitle?: string, initialContent?: string }>();
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    /** Publishing the long form is the Auteur's act — asked from the registry. */
    const essay = useClearance('essays', '/dispatch/compose');
    // The registry's one answer, not a second tier check beside it.
    const canWrite = essay.held;

    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        // iOS only: on Android the root ends at the keyboard (KeyboardRoom).
        paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
    }));

    const [title, setTitle] = useState(initialTitle || '');
    const [content, setContent] = useState(initialContent || '');
    const [isPublishing, setIsPublishing] = useState(false);
    const [isPreview, setIsPreview] = useState(false);

    /**
     * The essay's film and series, as `EssayHead` and the feed draw them. The film carries two
     * pictures: the poster (`subject_image`) and the cover (`subject_backdrop`). A series is
     * held whole by `series_whole`, which refuses a half-set one.
     */
    const [film, setFilm] = useState<{
        id: number; title: string; sub: string | null;
        image: string | null;
        /** The cover. Two pictures of one film — see `FilingDraft.film`. */
        backdrop: string | null;
    } | null>(null);
    const [filmOpen, setFilmOpen] = useState(false);
    const [series, setSeries] = useState<SeriesChoice | null>(null);
    const [seriesOpen, setSeriesOpen] = useState(false);

    // Live caret tracking — the toolbar wraps the selection AT the cursor.
    const [selection, setSelection] = useState({ start: (initialContent || '').length, end: (initialContent || '').length });
    // Drives the caret for exactly one render after a toolbar edit, then releases.
    const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(null);

    const inputRef = useRef<TextInput>(null);

    // Refs mirror state so the AppState flush reads the latest without re-subscribing.
    const titleRef = useRef(title); titleRef.current = title;
    const contentRef = useRef(content); contentRef.current = content;
    // The film and series ride the same flush: a background write must not save the words
    // and drop the two things beside them.
    const filmRef = useRef(film); filmRef.current = film;
    const seriesRef = useRef(series); seriesRef.current = series;

    /** What the room opened with: an ISO time, 'unknown' (no time kept), 'unreadable', or null. */
    const [restored, setRestored] = useState<string | null>(null);
    const [saveFailed, setSaveFailed] = useState(false);
    /** The house is holding something newer, written somewhere else. */
    const [elsewhere, setElsewhere] = useState<RemoteDraft<DossierDraft> | null>(null);

    /** One way to put a draft into the room, so the two sources cannot drift. */
    const applyDraft = useCallback((d: DossierDraft) => {
        setTitle(d.title ?? '');
        setContent(d.content ?? '');
        setSelection({ start: (d.content ?? '').length, end: (d.content ?? '').length });
        setFilm(d.film ?? null);
        setSeries(d.series ?? null);
        if (d.series) {
            // Asked fresh, exactly as a local restore does — a part number is a
            // fact about when the series was picked, and this one was picked on
            // another phone, possibly days ago.
            void freshPartFor(user?.id, d.series.id).then((part) => {
                if (part != null) setSeries((s) => (s && s.id === d.series!.id ? { ...s, part } : s));
            });
        }
    }, [user?.id]);

    // Empty for a draft kept with no time: the line names none rather than inventing one.
    const restoredWhen = useMemo(
        () => (!restored || restored === 'unreadable' || restored === 'unknown' ? '' : whenOf(restored)),
        [restored],
    );

    // Guards the delayed back() below against a screen already gone.
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        if (!canWrite) {
            // A lapsed Auteur is told their unfinished essay is kept: a door, not a wall.
            const held = readDraft(user?.id, 'dossier') !== null;
            reelToast.error(held
                ? 'The essay is an Auteur’s. Your unfinished one is kept.'
                : 'The essay is an Auteur’s to file.');
            InteractionManager.runAfterInteractions(() => {
                // Waits out the entry animation; unguarded, two pops would land.
                if (isMounted.current) nav.back();
            });
        }
    }, [canWrite, user?.id]);

    /**
     * Draft restore — new essays only; an amend loads from the server. Whose draft this is
     * lives in memberDrafts.ts: `adoptLegacyDrafts` claims a draft that carries no member only
     * if this member was the phone's last (`last_user_id`), and deletes it unread otherwise.
     */
    useEffect(() => {
        if (edit) return;
        adoptLegacyDrafts(user?.id);
        const held = readDraft<DossierDraft>(user?.id, 'dossier');
        const d = held?.data;
        if (!d) {
            // readDraft clears a draft it cannot parse; the room says so, or it seems to forget.
            // True only when there WAS one — an empty room says nothing.
            if (unreadableDraftFound(user?.id, 'dossier')) setRestored('unreadable');
            return;
        }

        if (d.title) setTitle(d.title);
        if (d.content) {
            setContent(d.content);
            setSelection({ start: d.content.length, end: d.content.length });
        }
        // The whole piece, not half of it. A film — with its cover — and a
        // series are as much the member's work as the words, and a draft that
        // returns the sentences and loses the rest is a draft you learn to
        // distrust.
        if (d.film) setFilm(d.film);
        if (d.series) {
            setSeries(d.series);
            /**
             * And the PART is asked fresh rather than trusted. It was computed
             * when the series was picked; if they filed Part II from elsewhere
             * since, this draft still says II and would file a second one.
             */
            void freshPartFor(user?.id, d.series.id).then((part) => {
                if (part != null) setSeries((s) => (s && s.id === d.series!.id ? { ...s, part } : s));
            });
        }
        setRestored(held?.savedAt ?? 'unknown');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    /**
     * ── AND THE COPY THAT IS NOT ON THIS PHONE ───────────────────────────────
     * The local draft above is what the room opens with, always. This asks the
     * house whether it is holding something the member touched more recently —
     * on a phone they have since lost, or before a reinstall.
     *
     * It ASKS rather than merges. A merge rule for prose is a rule for silently
     * producing text nobody wrote, and nothing is overwritten until the member
     * chooses. That is also what makes this verifiable without a second handset.
     */
    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        (async () => {
            const remote = await pullDraft<DossierDraft>(
                user.id, edit ? 'edit' : 'dossier', edit ?? '',
            );
            if (cancelled || !remote) return;
            const local = readDraft<DossierDraft>(user.id, edit ? 'edit' : 'dossier', edit ?? '');
            const verdict = whichCopy(local?.savedAt, remote.savedAt);
            if (verdict === 'remote') {
                // Nothing here to lose — a new phone, or an install that has
                // never held this essay. Take it and say where it came from.
                applyDraft(remote.data);
                setRestored(remote.savedAt);
            } else if (verdict === 'ask') {
                setElsewhere(remote);
            }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, edit]);

    /**
     * ── THE BACKUP, EVERY TWO MINUTES ────────────────────────────────────────
     * Not a debounce on typing. Measured against the real ceiling — 25,000
     * characters — a ten-second push is about nine megabytes an hour of
     * somebody's mobile data, for a file that only matters if their phone dies.
     *
     * Two minutes, plus the background flush below, plus when the room closes.
     * Worst case a member loses two minutes, and only if the handset is
     * destroyed inside that window.
     */
    useEffect(() => {
        if (!user?.id) return;
        const backUp = () => {
            const t = titleRef.current, c = contentRef.current;
            if (!t.trim() && !c.trim()) return;
            void pushDraft(
                user.id, edit ? 'edit' : 'dossier',
                { title: t, content: c, film: filmRef.current, series: seriesRef.current },
                new Date().toISOString(), edit ?? '',
            );
        };
        const every = setInterval(backUp, SYNC_EVERY_MS);
        const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') backUp(); });
        return () => { clearInterval(every); sub.remove(); backUp(); };
    }, [user?.id, edit]);

    /**
     * An amend is kept too, in a slot per FILING: the new essay's slot would let an amend
     * overwrite an unfinished one, and one slot per member would lose essay A's amend the
     * moment essay B opened. Several are kept, oldest evicted.
     */
    useEffect(() => {
        if (!edit || !user?.id) return;
        const held = readDraft<{ title?: string; content?: string }>(user.id, 'edit', edit);
        if (!held?.data) return;
        if (held.data.title) setTitle(held.data.title);
        if (held.data.content) setContent(held.data.content);
        setRestored(held.savedAt ?? 'unknown');
     
    }, [edit, user?.id]);

    useEffect(() => {
        if (!edit || !user?.id) return;
        const t = setTimeout(() => {
            // An amend opens with words: cleared on landing or by START CLEAN, never by emptiness.
            setSaveFailed(!writeDraft(user.id, 'edit', { title, content }, edit));
        }, 1000);
        return () => clearTimeout(t);
    }, [title, content, edit, user?.id]);

    useEffect(() => {
        if (!edit || !user?.id) return;
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') {
                writeDraft(user.id, 'edit', {
                    title: titleRef.current, content: contentRef.current,
                }, edit);
            }
        });
        return () => sub.remove();
    }, [edit, user?.id]);

    // ── Draft auto-save (debounced) ──
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (edit) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            if (title.trim() || content.trim()) {
                setSaveFailed(!writeDraft(user?.id, 'dossier', { title, content, film, series }));
            } else {
                clearDraft(user?.id, 'dossier');
            }
        }, 1000);
        return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    }, [title, content, film, series, edit, user?.id]);

    // ── Background flush — guarantees a long essay survives an immediate OS kill ──
    useEffect(() => {
        if (edit) return;
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') {
                const t = titleRef.current, c = contentRef.current;
                if (t.trim() || c.trim()) {
                    setSaveFailed(!writeDraft(user?.id, 'dossier', {
                        title: t, content: c, film: filmRef.current, series: seriesRef.current,
                    }));
                }
            }
        });
        return () => sub.remove();
    }, [edit, user?.id]);

    // Counted 400ms after typing stops, not per keystroke: splitting 25,000 characters on
    // every letter would lag the one room where typing must feel like nothing.
    const [counted, setCounted] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setCounted(content), 400);
        return () => clearTimeout(t);
    }, [content]);
    const stats = useMemo(() => {
        const words = counted.trim() ? counted.trim().split(/\s+/).length : 0;
        // The reader's own figure, so the room and the published page never disagree.
        return { words, readMin: readMinutes(words) };
    }, [counted]);

    /**
     * How close the essay is to the fence, and whether it may be filed. sanitizeInput cuts
     * silently, so an essay over the limit would lose its ending while the filing reported
     * success and the draft was deleted; it is refused here instead.
     */
    const limit = useMemo(() => {
        const trimmed = content.trim();
        const remaining = remainingChars(trimmed, 'filingEssay');
        return {
            over: isOverLimit(trimmed, 'filingEssay'),
            remaining,
            // Quiet until it could plausibly matter — a counter on a 400-word
            // piece is noise, and this fence is meant never to be felt.
            show: remaining <= LIMIT_WARNING_CHARS,
            max: MAX_LENGTHS.filingEssay,
        };
    }, [content]);

    // Wrap the selection (or insert at the cursor) — never dumps at the document end.
    const insertFormatting = (before: string, after: string) => {
        const { start, end } = selection;
        const selected = content.slice(start, end);
        const next = content.slice(0, start) + before + selected + after + content.slice(end);
        setContent(next);
        // Selection present → caret after the wrap; empty → caret between the markers.
        const caret = selected.length > 0
            ? start + before.length + selected.length + after.length
            : start + before.length;
        setForcedSelection({ start: caret, end: caret });
        inputRef.current?.focus();
    };

    const handleSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        setSelection(e.nativeEvent.selection);
        // Release programmatic control the render after a toolbar edit applied.
        if (forcedSelection) setForcedSelection(null);
    };

    const handlePublish = async () => {
        if (!canWrite) {
            // A door, not a toast: the ranks, explained, and autosave keeps the words meanwhile.
            essay.open();
            return;
        }
        if (!title.trim() || !content.trim() || isPublishing) return;

        // Refuse BEFORE anything is written or deleted. This return happens
        // outside the try below, so the draft is never touched — the failure
        // mode moves from "your essay was silently shortened and your draft is
        // gone" to "this cannot be filed yet, and every word is still here".
        if (limit.over) {
            // "essay", the word a member reads (dossier is the database's), written plainly:
            // nameOf() gives the label form, in capitals.
            reelToast.error(
                `This essay is ${groupDigits(Math.abs(limit.remaining))} characters over the limit. Trim it and file again — nothing has been lost.`
            );
            return;
        }

        Keyboard.dismiss();
        setIsPublishing(true);

        try {
            // The card's opening as prose: excerptFor unwraps markdown, not deleting characters.
            const excerpt = excerptFor(content);

            if (edit) {
                const amended = await useDispatch.getState().amend(edit, {
                    title: title.trim(),
                    body: excerpt,
                    fullContent: content.trim(),
                });
                // The amended words are the house's now (or the queue's, which holds them whole),
                // so the phone's copy goes, and the backup, which exists only until then.
                clearDraft(user?.id, 'edit', edit);
                void dropDraft(user?.id, 'edit', edit);
                reelToast.success(amended?.offline ? 'Amended. It goes out when the wire is back.' : 'Essay updated');
            } else {
                const filed = await useDispatch.getState().file({
                    kind: 'dossier',
                    title: title.trim(),
                    // For a dossier the BODY is the excerpt — one column, two
                    // meanings, and the database enforces the tighter 500 on it.
                    body: excerpt,
                    fullContent: content.trim(),
                    // The film and the series, which the reader has always drawn
                    // and the store has always accepted. `series_whole` refuses a
                    // half-set series, so these three travel together or not at
                    // all — which is why they come from one piece of state.
                    film,
                    seriesId: series?.id ?? null,
                    seriesTitle: series?.title ?? null,
                    partNumber: series?.part ?? null,
                });
                // Deleted only once the write is accepted: nothing goes before there is a row.
                if (filed) { clearDraft(user?.id, 'dossier'); void dropDraft(user?.id, 'dossier'); }
                reelToast.success(filed?.offline ? 'Filed. It goes out when the wire is back.' : 'Essay filed');
            }
            router.replace('/(tabs)/dispatch');

        } catch (err) {
            // A refused filing keeps the draft and SAYS so — unless the phone also refused the
            // draft (saveFailed): then the words are not safe, and that outranks the door.
            if (!saveFailed && showTierDoor(err, {
                returnTo: '/dispatch/compose?kind=dossier',
                also: 'Your words are kept.',
            })) return;
            reelToast.error(saveFailed
                ? 'It did not go, and your phone is out of space. Do not close this.'
                : 'It did not go. Your words are kept.');
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />

            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <PressableScale onPress={() => {
                    if (title.trim() || content.trim()) {
                        // No save mark anywhere; a refused save is said here, at the exit.
                        const lost = saveFailed && !edit;
                        Alert.alert(
                            lost ? 'This is not being kept' : 'Discard this essay?',
                            lost
                                ? 'Your phone is out of space, so nothing here has been saved. File it now, or free some room and come back.'
                                : 'What you have written will be lost.',
                            [
                                { text: lost ? 'Go back' : 'Keep writing', style: 'cancel' },
                                { text: 'Discard', style: 'destructive', onPress: () => {
                                    // This room's copy only, and its backup too,
                                    // or it reappears on the next phone.
                                    if (edit) { clearDraft(user?.id, 'edit', edit); void dropDraft(user?.id, 'edit', edit); }
                                    else { clearDraft(user?.id, 'dossier'); void dropDraft(user?.id, 'dossier'); }
                                    nav.back();
                                } },
                            ],
                        );
                    } else {
                        nav.back();
                    }
                }} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic
                    accessibilityRole="button"
                    accessibilityLabel="Cancel, and leave the writing room">
                    {/* Three across, no reflow: the deck cap, one line, shrink to fit. */}
                    <Text style={styles.cancelBtn} {...deckLabelProps}>CANCEL</Text>
                </PressableScale>
                <Text style={styles.headerTitle} {...deckLabelProps}>THE WRITING ROOM</Text>
                <PressableScale
                    onPress={() => {
                        setIsPreview(!isPreview);
                    }}
                    haptic="medium"
                    accessibilityRole="button"
                    // The label says what a press does; the state says where you are.
                    accessibilityState={{ selected: isPreview }}
                    accessibilityLabel={isPreview ? 'Back to editing' : 'Preview the essay'}
                >
                    <Text style={styles.previewBtn} {...deckLabelProps}>{isPreview ? 'EDIT' : 'PREVIEW'}</Text>
                </PressableScale>
            </View>

            {isPreview ? (
                <CinematicScrollView style={styles.workspace} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                    <Text style={styles.previewEyebrow} {...scaledTextProps}>AS THE HOUSE WILL SET IT</Text>
                    {/* The reader's own head, cover and all, so the preview is the page. */}
                    {title || film ? (
                        <EssayHead
                            title={title}
                            series={series ? `Part ${roman(series.part)} of ${series.title}` : undefined}
                            author={{
                                name: user?.username ?? '',
                                memberNo: user?.member_no ?? 0,
                                // Their real rank, resolved as every byline does.
                                tier: paperTierOf(user),
                                avatar: user?.avatar_url ?? null,
                            }}
                            readTime={readTimeOf(content)}
                            filed={formatDateMonthDay(new Date().toISOString()).toUpperCase()}
                            film={film ? {
                                title: film.title,
                                director: film.sub,
                                posterPath: film.image,
                                backdropPath: film.backdrop,
                            } : null}
                            // No handlers: nothing opens from a preview.
                        />
                    ) : null}
                    {/* The reader's own renderer and cap (the cap guards two quadratic markdown
                        rules): a draft over the limit shows where the limit bites. */}
                    {content ? (
                        <EssayBody text={content} />
                    ) : (
                        <View style={styles.emptyPreview}>
                            {/* The form's own name, not a third word for it. */}
                            <Text style={styles.emptyPreviewText} {...scaledTextProps}>Your essay will appear here, as the house will set it.</Text>
                        </View>
                    )}
                </CinematicScrollView>
            ) : (
                <Animated.View style={[styles.kavFlex, animatedContainerStyle]}>
                    <CinematicScrollView style={styles.workspace} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                        {/* It asks, never merges: both sides with a time and a length. */}
                        {elsewhere ? (
                            <View style={styles.elsewhereBox}>
                                <Text style={styles.elsewhereHead} {...scaledTextProps}>
                                    A NEWER ONE WAS WRITTEN ELSEWHERE
                                </Text>
                                <Text style={styles.elsewhereLine} {...scaledTextProps}>
                                    {`ELSEWHERE · ${whenOf(elsewhere.savedAt)} · ${wordsOf(elsewhere.data.content)}`}
                                </Text>
                                <Text style={styles.elsewhereLine} {...scaledTextProps}>
                                    {`HERE · ${restored ? whenOf(restored) : 'JUST NOW'} · ${wordsOf(content)}`}
                                </Text>
                                <View style={styles.elsewhereActs}>
                                    <PressableScale
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection"
                                        onPress={() => {
                                            applyDraft(elsewhere.data);
                                            setRestored(elsewhere.savedAt);
                                            setElsewhere(null);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Take the one written elsewhere"
                                    >
                                        <Text style={styles.elsewhereTake} {...scaledTextProps}>TAKE THAT ONE</Text>
                                    </PressableScale>
                                    <PressableScale
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection"
                                        onPress={() => setElsewhere(null)}
                                        accessibilityRole="button"
                                        accessibilityLabel="Keep the one on this phone"
                                    >
                                        <Text style={styles.elsewhereKeep} {...scaledTextProps}>KEEP THIS ONE</Text>
                                    </PressableScale>
                                </View>
                            </View>
                        ) : null}
                        {/* Explains words on screen that were not typed just now (there is no save
                            mark); typing accepts them, START CLEAN clears them. */}
                        {restored ? (
                            <View
                                style={styles.restoredRow}
                                accessible
                                accessibilityRole="summary"
                                accessibilityLabel={
                                    restored === 'unreadable'
                                        ? 'What was here could not be read. The room has cleared it.'
                                        : `Taken up where you left it${restoredWhen ? `, ${restoredWhen}` : ''}.`
                                }
                            >
                                <Text
                                    style={[styles.restoredText, restored === 'unreadable' && styles.restoredLost]}
                                    {...scaledTextProps}
                                >
                                    {restored === 'unreadable'
                                        ? 'WHAT WAS HERE COULD NOT BE READ'
                                        : `TAKEN UP WHERE YOU LEFT IT${restoredWhen ? ` · ${restoredWhen}` : ''}`}
                                </Text>
                                {restored !== 'unreadable' ? (
                                    <PressableScale
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        haptic="selection"
                                        onPress={() => {
                                            setTitle(''); setContent(''); setFilm(null); setSeries(null);
                                            setRestored(null);
                                            if (edit) { clearDraft(user?.id, 'edit', edit); void dropDraft(user?.id, 'edit', edit); }
                                            else { clearDraft(user?.id, 'dossier'); void dropDraft(user?.id, 'dossier'); }
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Start clean, and discard what was here"
                                    >
                                        <Text style={styles.restoredAct} {...scaledTextProps}>START CLEAN</Text>
                                    </PressableScale>
                                ) : null}
                            </View>
                        ) : null}
                        <TextInput
                            style={styles.titleInput}
                            placeholder="A title for this essay"
                            placeholderTextColor={colors.fog}
                            value={title}
                            onChangeText={(t) => { setTitle(t); setRestored(null); }}
                            // The sanitiser's number, which the column's title_ceiling also holds.
                            maxLength={MAX_LENGTHS.filingTitle}
                            // Wraps and grows (one 30pt line holds ~20 of 200 characters), so a
                            // headline is never written blind. Return still ends it.
                            multiline
                            scrollEnabled={false}
                            submitBehavior="blurAndSubmit"
                            returnKeyType="done"
                            textAlignVertical="top"
                            cursorColor={colors.sepia}
                            selectionColor="rgba(184,137,26,0.3)"
                            keyboardAppearance="dark"
                            accessibilityLabel="Essay headline"
                        />
                        {/* What it is about, by the title; the rail below sets how it reads. */}
                        <View style={styles.slots}>
                            <PressableScale
                                style={styles.slot} onPress={() => setFilmOpen(true)} haptic="selection"
                                // The two slots touch: neither reaches into the other.
                                hitSlop={{ top: 6, bottom: 0, left: 0, right: 0 }}
                                accessibilityRole="button"
                                accessibilityLabel={film ? `The film is ${film.title}. Change it.` : 'Name the film this is about'}
                            >
                                <Text style={styles.slotLabel} {...actionLabelProps}>FILM</Text>
                                <Text style={[styles.slotValue, film && styles.slotValueSet]} numberOfLines={1} {...scaledTextProps}>
                                    {film ? [film.title, film.sub].filter(Boolean).join(' · ') : 'Name the film this is about'}
                                </Text>
                            </PressableScale>
                            <PressableScale
                                style={styles.slot} onPress={() => setSeriesOpen(true)} haptic="selection"
                                hitSlop={{ top: 0, bottom: 6, left: 0, right: 0 }}
                                accessibilityRole="button"
                                accessibilityLabel={series ? `Part ${series.part} of ${series.title}. Change it.` : 'Make this part of a series'}
                            >
                                <Text style={styles.slotLabel} {...actionLabelProps}>SERIES</Text>
                                <Text style={[styles.slotValue, series && styles.slotValueSet]} numberOfLines={1} {...scaledTextProps}>
                                    {series ? `${series.title.toUpperCase()} · ${roman(series.part)}` : 'Part of a series?'}
                                </Text>
                            </PressableScale>
                        </View>

                        <TextInput
                            ref={inputRef}
                            style={styles.contentInput}
                            placeholder="Begin. The house is listening."
                            placeholderTextColor={colors.fog}
                            value={content}
                            onChangeText={(t) => { setContent(t); setRestored(null); }}
                            onSelectionChange={handleSelectionChange}
                            selection={forcedSelection ?? undefined}
                            multiline
                            textAlignVertical="top"
                            cursorColor={colors.sepia}
                            selectionColor="rgba(184,137,26,0.3)"
                            keyboardAppearance="dark"
                            accessibilityLabel="Essay content body"
                        />
                    </CinematicScrollView>

                    <View style={styles.toolbar}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll} keyboardShouldPersistTaps="handled">
                            <PressableScale hitSlop={TOOL_SLOP} style={styles.toolBtn} onPress={() => insertFormatting('**', '**')} haptic="selection" accessibilityRole="button" accessibilityLabel="Bold">
                                <Bold size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>BOLD</Text>
                            </PressableScale>
                            <PressableScale hitSlop={TOOL_SLOP} style={styles.toolBtn} onPress={() => insertFormatting('*', '*')} haptic="selection" accessibilityRole="button" accessibilityLabel="Italic">
                                <Italic size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>ITALIC</Text>
                            </PressableScale>
                            <PressableScale hitSlop={TOOL_SLOP} style={styles.toolBtn} onPress={() => insertFormatting('\n## ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Heading">
                                <Type size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>HEADING</Text>
                            </PressableScale>
                            <PressableScale hitSlop={TOOL_SLOP} style={styles.toolBtn} onPress={() => insertFormatting('\n> ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Block quote">
                                <Quote size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>QUOTE</Text>
                            </PressableScale>
                            <PressableScale hitSlop={TOOL_SLOP} style={styles.toolBtn} onPress={() => insertFormatting('\n---\n', '')} haptic="selection" accessibilityRole="button" accessibilityLabel="Horizontal rule">
                                <Minus size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>BREAK</Text>
                            </PressableScale>
                            <PressableScale hitSlop={TOOL_SLOP} style={styles.toolBtn} onPress={() => insertFormatting('[', '](url)')} haptic="selection" accessibilityRole="button" accessibilityLabel="Insert link">
                                <Link2 size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>LINK</Text>
                            </PressableScale>
                        </ScrollView>
                    </View>

                    <BlurView intensity={90} tint="dark" style={styles.footer}>
                        <View style={styles.stats}>
                            {/* A fixed strip of three: the deck cap, inherited by the values. */}
                            <Text style={styles.statText} {...deckLabelProps}>WORDS <Text style={styles.statVal}>{stats.words}</Text></Text>
                            <Text style={styles.statText} {...deckLabelProps}>READ TIME <Text style={styles.statVal}>~{stats.readMin}m</Text></Text>
                            {limit.show ? (
                                <Text style={[styles.statText, limit.over && styles.statOver]} {...deckLabelProps}>
                                    {limit.over ? 'OVER BY ' : 'LEFT '}
                                    <Text style={[styles.statVal, limit.over && styles.statOver]}>
                                        {groupDigits(Math.abs(limit.remaining))}
                                    </Text>
                                </Text>
                            ) : null}
                        </View>
                        <PressableScale
                            style={[styles.publishBtn, (!title || !content || isPublishing) && styles.publishBtnDisabled]}
                            disabled={!title || !content || isPublishing}
                            onPress={handlePublish}
                            haptic="medium"
                            accessibilityRole="button"
                            // Disabled is announced, or a press answers with nothing.
                            accessibilityState={{ disabled: !title || !content || isPublishing, busy: isPublishing }}
                            accessibilityLabel={
                                isPublishing ? 'Filing the essay'
                                    : !title || !content ? 'File the essay. Not ready yet — it needs a title and a body'
                                        : edit ? 'Re-file the essay' : 'File the essay'
                            }
                        >
                            {/* The screen's longest label: shrink-to-fit, under the ceiling. */}
                            <Text style={styles.publishBtnText} {...scaledTextProps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{isPublishing ? 'FILING…' : (edit ? 'RE-FILE ESSAY' : 'FILE THE ESSAY')}</Text>
                        </PressableScale>
                    </BlurView>
                </Animated.View>
            )}

            {/* Both sheets are mounted OUTSIDE the preview/edit branch, so
                neither is torn down and rebuilt when a member flips to the
                preview and back. They draw nothing until opened. */}
            <FilmPicker
                visible={filmOpen}
                bottomInset={insets.bottom}
                onClose={() => setFilmOpen(false)}
                onPick={(f, id) => {
                    // The id comes from the finder by POSITION, which is the one
                    // way to get the right film when two share a title and year.
                    setFilm({
                        id,
                        title: f.title,
                        sub: [f.year, f.director].filter(Boolean).join(' · ') || null,
                        image: f.posterPath ?? null,
                        // The essay's cover (subject_backdrop).
                        backdrop: f.backdropPath ?? null,
                    });
                    setFilmOpen(false);
                }}
            />
            <SeriesPicker
                visible={seriesOpen}
                chosen={series}
                bottomInset={insets.bottom}
                onClose={() => setSeriesOpen(false)}
                onSet={(choice) => { setSeries(choice); setSeriesOpen(false); }}
                onClear={() => { setSeries(null); setSeriesOpen(false); }}
            />
        </View>
    );
}

// Each tool reaches half the gap toward its neighbour, never more, or the later one
// takes the earlier one's taps.
const TOOL_GAP = 6;
const TOOL_SLOP = { top: 15, bottom: 15, left: TOOL_GAP / 2, right: TOOL_GAP / 2 };

const styles = StyleSheet.create({
    container: { ...EDGE_LIT,
        flex: 1,
        backgroundColor: colors.soot,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.sepiaBorder,
        backgroundColor: colors.ink,
    },
    cancelBtn: {
        fontFamily: fonts.sub,
        fontSize: 10,
        color: colors.fog,
        letterSpacing: 1.2,
        includeFontPadding: false,
    },
    headerTitle: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 2.4,
        color: colors.sepia,
        includeFontPadding: false,
    },
    previewBtn: {
        fontFamily: fonts.sub,
        fontSize: 10,
        color: colors.parchment,
        letterSpacing: 1.2,
        includeFontPadding: false,
    },
    workspace: {
        flex: 1,
    },
    titleInput: {
        fontFamily: fonts.sub,
        fontSize: 30,
        color: colors.parchment,
        padding: 24,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(184,137,26,0.1)',
    },
    contentInput: {
        fontFamily: fonts.body,
        fontSize: 16,
        color: colors.bone,
        padding: 24,
        paddingTop: 24,
        lineHeight: 24,
        minHeight: 400,
    },
    toolbar: {
        borderTopWidth: 1,
        borderTopColor: colors.sepiaBorder,
        backgroundColor: colors.ink,
        paddingVertical: 8,
    },
    toolsScroll: {
        paddingHorizontal: 16,
        gap: TOOL_GAP,
    },
    toolBtn: {
        // A column: the mark and its name, so no one needs to know markdown.
        alignItems: 'center',
        gap: 3,
        paddingVertical: 6,
        // Padding 8, minimum 48, 6pt gaps: all six fit a 390pt phone (379pt) with names at the
        // 10pt floor. At larger text the rail scrolls, which is why it is a scroller.
        paddingHorizontal: 8,
        backgroundColor: 'rgba(184,137,26,0.1)',
        borderRadius: 4,
        minWidth: 48,
    },
    toolWord: {
        fontFamily: fonts.sub,
        // The house's type floor (theTypeFloor.test.ts).
        fontSize: 10,
        letterSpacing: 0.9,
        color: colors.bone,
        includeFontPadding: false,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderTopColor: colors.sepiaBorder,
    },
    stats: {
        flex: 1,
    },
    statText: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 1.3,
        color: colors.fog,
        marginBottom: 4,
        includeFontPadding: false,
    },
    statVal: {
        color: colors.sepia,
    },
    // The one state where the essay cannot be filed. Same strip, same weight —
    // a colour change, not an alarm.
    statOver: {
        color: colors.crimsonInk,
    },
    publishBtn: {
        backgroundColor: colors.sepia,
        paddingVertical: 12,
        paddingHorizontal: 22,
        borderRadius: 4,
    },
    publishBtnDisabled: {
        backgroundColor: colors.ash,
    },
    publishBtnText: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 1.6,
        color: colors.ink,
        includeFontPadding: false,
    },

    // Preview
    previewEyebrow: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 2.4,
        color: colors.sepia,
        marginBottom: 16,
        textAlign: 'center',
        includeFontPadding: false,
    },
    emptyPreview: {
        paddingVertical: 100,
        alignItems: 'center',
    },
    emptyPreviewText: {
        fontFamily: fonts.bodyItalic,
        fontSize: 14,
        color: colors.fog,
    },
    kavFlex: { flex: 1 },
    /**
     * The line that explains words you did not just type. Quiet — it is not an
     * alert and it is not chrome the room keeps; it leaves on the first
     * keystroke. `space-between` so START CLEAN sits at the measure's edge,
     * where every other trailing act in this app sits.
     */
    restoredRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 14, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)',
    },
    restoredText: {
        flexShrink: 1, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
        color: colors.sepia, includeFontPadding: false,
    },
    /** Crimson, because this one is a loss rather than a courtesy. */
    restoredLost: { color: colors.crimsonInk },
    restoredAct: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
        color: colors.parchment, includeFontPadding: false,
    },
    /**
     * A box, not a line: a decision, not a notice that goes by itself. A column, so two
     * facts and two acts are not crushed at the largest text.
     */
    elsewhereBox: {
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.30)', borderRadius: 2,
        paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
    },
    elsewhereHead: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
        color: colors.parchment, marginBottom: 8, includeFontPadding: false,
    },
    elsewhereLine: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8,
        color: colors.sepia, marginTop: 2, includeFontPadding: false,
    },
    elsewhereActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
    elsewhereTake: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
        color: colors.parchment, includeFontPadding: false,
    },
    /** Equal weight. A choice where one act is louder is not a choice. */
    elsewhereKeep: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
        color: colors.parchment, includeFontPadding: false,
    },
    /** The page's own measure, so lines break as they will there and the cover's -24 bleed
     *  meets the sheet's edge exactly. */
    previewContent: {
        paddingHorizontal: DOC_MARGIN + DOC_RAIL + DOC_PAD,
        paddingVertical: 20,
    },

    /** What the piece IS — above the writing, below the title. */
    slots: {
        borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.16)',
        borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)',
        paddingVertical: 4, marginBottom: 14,
    },
    slot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
    /** A fixed 54pt column: actionLabelProps' shrink-to-fit keeps a longer word inside it. */
    slotLabel: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.sepia,
        width: 54, includeFontPadding: false,
    },
    /** Unset reads as an invitation; set reads as a fact. */
    slotValue: {
        fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog,
        includeFontPadding: false, flex: 1, minWidth: 0,
    },
    slotValueSet: { color: colors.parchment },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
