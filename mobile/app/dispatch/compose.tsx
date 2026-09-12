import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Keyboard, InteractionManager, Alert, AppState, NativeSyntheticEvent, Platform, TextInputSelectionChangeEventData } from 'react-native';
// The preview mounts `EssayBody`, which carries the link guard and the render
// cap itself — so this screen no longer holds its own copy of either.
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bold, Italic, Type, Quote, Minus, Link2 } from 'lucide-react-native';
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import Animated, { useAnimatedStyle, useAnimatedKeyboard } from 'react-native-reanimated';

import { useAuthStore } from '@/src/stores/auth';
import { isAuteurPlusTier } from '@/src/utils/tier';
import { useClearance } from '@/src/hooks/useClearance';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
// isOverLimit / remainingChars shipped in the sanitiser with ZERO callers — this
// screen is the one that needed them.
import { isOverLimit, remainingChars, MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import PressableScale from '@/src/components/PressableScale';
import { ComposeBallotScreen, ComposeShortScreen, FilmPicker } from '@/src/components/dispatch/ComposeDesks';
import {
  SeriesPicker, freshPartFor, roman, type SeriesChoice,
} from '@/src/components/dispatch/SeriesPicker';
import { FORMS, PaperBack, PaperDoor, PaperPicker } from '@/src/components/dispatch/paper/PaperMore';
import { EssayHead } from '@/src/components/dispatch/paper/PaperEssay';
import { readTimeOf } from '@/src/components/dispatch/readTime';
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
/**
 * The writing room was the one Dispatch screen with no font-scaling props on any
 * of its text. React Native's default is `allowFontScaling` with NO ceiling, so
 * at accessibility sizes every label here grew without limit — the header's
 * three-across row and the counter row worst, because neither can reflow.
 */
import { scaledTextProps, deckLabelProps } from '@/src/constants/textScaling';
import { useDispatch } from '@/src/stores/dispatch';
import type { FilingKind } from '@/src/stores/dispatchTypes';

// A long essay must survive a background-kill. Drafts persist here, new-dossiers only.
/* The draft's key is NOT here any more. It used to be one member-less string,
   which is how one member's unpublished essay ended up waiting in the writing
   room for the next person to sign in on that phone. Whose a draft is, where it
   lives, and what happens to the ones written before the keys were split are all
   answered once, in `src/utils/memberDrafts.ts` — which owns every draft this
   app keeps, because the fault was never one key. It was that erasing them on
   logout was a LIST somebody had to remember, and four keys in a row were
   forgotten. They share a prefix now and logout sweeps the prefix. */

/**
 * How close to the fence before the counter appears.
 *
 * The limit is ~4,350 words. Showing a counter from the first sentence would
 * make a memory fence feel like an editorial one, so it stays out of the way
 * until the last ~870 words — enough warning to finish a thought and trim,
 * without hovering over anyone writing an ordinary piece.
 */
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

    /**
     * ── NOBODY IS SIGNED IN ──────────────────────────────────────────────────
     * Answered HERE, before the picker draws, rather than at each desk.
     *
     * The brass Concierge sits in the nav bar for everyone and its "File to the
     * Dispatch" row is not gated, so a signed-out reader reached this route,
     * was shown all five forms, tapped one — and the desk rendered NOTHING. Read
     * back off the tree, the whole screen was `[]`: no header, no back, no
     * sentence.
     *
     * Locking the rows instead would have been a lie. The picker's lock says
     * AUTEURS, which is a different reason and the wrong one; being told the
     * long form is for auteurs when the real answer is "you are not a member"
     * teaches somebody something untrue about what membership costs.
     *
     * So: the same sentence the feed already gives a signed-out reader, and the
     * way back, before any form is offered.
     */
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);
    useEffect(() => {
        if (user) return;
        reelToast.error('Filing is for members.');
        // The wait matters: this fires while the modal is still animating in,
        // and unguarded both pops land, costing two screens instead of one.
        InteractionManager.runAfterInteractions(() => {
            if (isMounted.current) router.back();
        });
    }, [user]);

    /**
     * ── THE DOOR ─────────────────────────────────────────────────────────────
     * Checked HERE, above the picker and above every desk, for the same reason
     * the AUTEURS gate is: a member who cannot file must never reach a desk to
     * find out at the end.
     *
     * And this one was worse than a locked desk. `posts_door` — two days a
     * member, five distinct films logged — has been enforced by the database all
     * along and NOTHING in the app referenced it. A new member wrote a take, or
     * an essay, pressed FILE and got `Transmission failed`. No reason, no
     * number, no way to find out; the likeliest next thing they did was write it
     * again.
     *
     * `useDoor` fails OPEN, so a read that times out lets them through to the
     * refusal the server was always going to give rather than locking them out
     * of their own app.
     */
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
    const auteur = isAuteurPlusTier(user);
    const insets = useSafeAreaInsets();
    // Read once, on mount. A draft cannot appear while this sheet is open — the
    // only thing that writes one is the room this sheet leads to.
    const hasDossierDraft = useMemo(
        () => readDraft(user?.id, 'dossier') !== null,
        [user?.id],
    );

    return (
        <View style={[p.screen, { justifyContent: 'flex-end' }]}>
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
            <View style={{ paddingBottom: insets.bottom }}>
                <PaperPicker
                    forms={FORMS.map((f) => ({
                        ...f,
                        locked: f.locked ? !auteur : false,
                        // The room keeps ONE unfinished dossier. Until this said
                        // so, beginning a second essay overwrote the first with
                        // no word — the limit was a surprise instead of a fact.
                        inProgress: f.kind === 'dossier' && hasDossierDraft,
                    }))}
                    onPick={(k) => router.setParams({ kind: k })}
                    // The rules, at the door every filing goes through. They
                    // were nine clauses on a page nothing opened.
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
            <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
            <PaperBack label="THE DISPATCH" onBack={() => router.back()} />
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: insets.bottom + 24 }}
                showsVerticalScrollIndicator={false}
            >
                <PaperDoor
                    films={door.films ?? 0}
                    filmsNeeded={door.filmsNeeded}
                    days={door.days ?? 0}
                    daysNeeded={door.daysNeeded}
                    // An Auteur can pay on day one and still be behind the door,
                    // so a member can reach this screen holding an unfinished
                    // essay. The door says the room is keeping it rather than
                    // leaving them to guess.
                    held={hasHeldWork}
                    // The one act that moves the count. It replaces this screen
                    // rather than stacking on it: a member who logs a film and
                    // presses back should land on the paper, not on the door
                    // they have just been let through.
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
    const canWrite = isAuteurPlusTier(user);
    /** Publishing the long form is the Auteur's act — asked from the registry. */
    const essay = useClearance('essays', '/dispatch/compose');

    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        // iOS only: Android's window resize handles the keyboard natively.
        paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
    }));

    const [title, setTitle] = useState(initialTitle || '');
    const [content, setContent] = useState(initialContent || '');
    const [isPublishing, setIsPublishing] = useState(false);
    const [isPreview, setIsPreview] = useState(false);

    /**
     * ── WHAT THE PIECE IS, AS OPPOSED TO HOW IT IS SET ───────────────────────
     * The reader has always drawn a dossier's film and its series — `EssayHead`
     * prints a film credit and a series line, and the feed prints "Part II of
     * …". The store has always accepted them: `FilingDraft` carries `film`,
     * `seriesId`, `seriesTitle` and `partNumber`, and the database holds a
     * series together with `series_whole`, which refuses a half-set one.
     *
     * Only this screen never set them. So an Auteur could write the long form
     * and had no way to say which film it was about.
     *
     * NO COVER. `EssayHead` also draws one, from `film.backdropPath` — but
     * `dispatch_posts` has a single image column, `subject_image`, and `toFilm`
     * maps it to the POSTER. There is nowhere for a backdrop to live, so a
     * cover control here would be a button that saves nothing. It needs a
     * column before it needs a picker.
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
    // The film and the series ride the same flush. Without these the background
    // write would save the words and drop the two things beside them — which is
    // the fault this pass exists to close, reintroduced at the one moment it
    // matters most.
    const filmRef = useRef(film); filmRef.current = film;
    const seriesRef = useRef(series); seriesRef.current = series;

    /**
     * What the room found when it opened, and whether the phone is refusing to
     * keep it.
     *
     * `restored` is an ISO time, `'unknown'` for a draft written before drafts
     * carried one, or `'unreadable'`. Null means an ordinary empty room, which
     * says nothing at all.
     */
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

    /**
     * `TUESDAY · 21:40`, from the app's own tables.
     *
     * NEVER `Intl` — it is not in Hermes and this app ships no polyfill, so a
     * `toLocaleString` here would work in every test and throw on a device.
     * Empty for a draft written before drafts carried a time, and the line then
     * simply does not name one rather than inventing a moment.
     */
    const restoredWhen = useMemo(() => {
        if (!restored || restored === 'unreadable' || restored === 'unknown') return '';
        const d = new Date(restored);
        if (Number.isNaN(d.getTime())) return '';
        return `${WEEKDAYS[d.getDay()]} · ${hourLabel(restored)}`;
    }, [restored]);

    // Mirrors the ref three sibling modals keep, for the guard just below.
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        if (!canWrite) {
            /**
             * A lapsed Auteur is turned away from a room that is still holding
             * four thousand of their words, and used to be told only that they
             * lacked the tier. The essay is theirs and it is not going anywhere;
             * saying so is the difference between a wall and a door.
             */
            const held = readDraft(user?.id, 'dossier') !== null;
            reelToast.error(held
                ? 'The essay is an Auteur’s. Your unfinished one is kept.'
                : 'The essay is an Auteur’s to file.');
            InteractionManager.runAfterInteractions(() => {
                // This fires while the screen is still animating in, so the wait is
                // long enough for the member to tap back themselves. Unguarded, both
                // pops land and they lose two screens instead of one.
                if (isMounted.current) router.back();
            });
        }
    }, [canWrite, user?.id]);

    /**
     * ── DRAFT RESTORE ────────────────────────────────────────────────────────
     * New dossiers only; an edit loads from the server.
     *
     * Everything about whose draft this is lives in `dispatchDrafts` — the key
     * used to carry no member at all, so an essay written by one member was
     * waiting in the writing room for the next person to sign in on that phone,
     * readable and filable under their name.
     *
     * `adoptLegacyDraft` runs first and once: a draft written before the keys
     * were split is claimed only if `last_user_id` proves nobody has signed out
     * since, and is deleted unread otherwise.
     */
    useEffect(() => {
        if (edit) return;
        adoptLegacyDrafts(user?.id);
        const held = readDraft<DossierDraft>(user?.id, 'dossier');
        const d = held?.data;
        if (!d) {
            // `readDraft` returns null for a draft it could not parse AND clears
            // it. The room must not simply open blank in that case: somebody
            // wrote something and it is gone, and saying nothing teaches them
            // the room forgets. `wasUnreadable` is only true when there WAS a
            // key — an ordinary empty room says nothing at all.
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
     * ── AN AMEND IS KEPT TOO, AND SEPARATELY ─────────────────────────────────
     * Every draft effect in this room began `if (edit) return`, so rewriting a
     * filed essay had NO protection at all: a phone call took the rewrite, and
     * a member who had spent an hour on it got the old version back with no
     * word about what had happened.
     *
     * Scoped to the FILING, never to the room. Sharing one slot with the new
     * essay would mean an amend quietly overwriting an unfinished dossier —
     * which is what the existing test "never touches the NEW-dossier draft"
     * exists to prevent, and it still holds.
     *
     * Several are kept, oldest evicted. One slot per member looks tidier and
     * eats the rewrite of essay A the moment you open essay B, which is the
     * fault all of this exists to close.
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
            // An amend always has words — it opened with them — so there is no
            // "empty means clear" branch here. It is cleared when the amend
            // lands, and by START CLEAN.
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

    /**
     * ── COUNTED ONCE A SECOND, NOT ONCE A KEYSTROKE ──────────────────────────
     * This split the WHOLE essay on whitespace inside a `useMemo` keyed on
     * `content` — so every letter typed scanned up to 25,000 characters, between
     * one keypress and the next, in the one room where typing has to feel like
     * nothing at all.
     *
     * The count is a fact about a paragraph, not about a letter. It settles a
     * beat after the typing stops, which is also when a member ever looks at it.
     * `useDeferredValue` hands React the stale number while the input stays
     * responsive; the debounce below is what stops the work happening at all.
     */
    const [counted, setCounted] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setCounted(content), 400);
        return () => clearTimeout(t);
    }, [content]);
    const stats = useMemo(() => {
        const words = counted.trim() ? counted.trim().split(/\s+/).length : 0;
        const readMin = Math.max(1, Math.ceil(words / 200));
        return { words, readMin };
    }, [counted]);

    /**
     * How close this essay is to the fence, and whether it may be filed.
     *
     * There was no signal at all. `sanitizeInput` cuts silently — the truncation
     * has no presence in its return type — so an essay over the limit was
     * shortened without a word, the publish reported success, and the draft was
     * deleted on the strength of that success. The writer lost the ending.
     *
     * `isOverLimit` and `remainingChars` already existed in the sanitiser,
     * tested, with ZERO callers. They are wired here.
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
            /**
             * A DOOR, NOT A TOAST.
             *
             * This said `Auteur tier required` and stopped — four words of
             * jargon at the end of writing an essay, naming a rank without
             * saying what it is or how to hold it, on the one screen where a
             * member has just spent an hour. The whole app's velvet rope
             * existed and this was the single place that shouted instead.
             *
             * The draft is already kept by the room's own autosave, so a member
             * who goes to read the ranks comes back to their words — which is
             * the difference between a wall and a door.
             */
            essay.open();
            return;
        }
        if (!title.trim() || !content.trim() || isPublishing) return;

        // Refuse BEFORE anything is written or deleted. This return happens
        // outside the try below, so the draft is never touched — the failure
        // mode moves from "your essay was silently shortened and your draft is
        // gone" to "this cannot be filed yet, and every word is still here".
        if (limit.over) {
            // "essay", not "dossier". `dossier` is the wire word — the kind
            // value in the database, the table names, the mutation types — and
            // it stays there. The word printed at a member is ESSAY, and this
            // toast was missed when the rest of the desk was renamed because it
            // is a sentence rather than a label.
            //
            // Written plainly rather than through `nameOf()`: that table yields
            // the label form (ESSAY, in capitals) for headers and card kinds,
            // which is not what belongs mid-sentence.
            reelToast.error(
                `This essay is ${groupDigits(Math.abs(limit.remaining))} characters over the limit. Trim it and file again — nothing has been lost.`
            );
            return;
        }

        Keyboard.dismiss();
        setIsPublishing(true);

        try {
            // The card's opening, as prose. `excerptFor` unwraps markdown rather
            // than deleting its characters wherever they appear: the old line
            // turned `a well-made film (see below)` into `a wellmade film see
            // below`, and turned a link into its own URL.
            const excerpt = excerptFor(content);

            if (edit) {
                await useDispatch.getState().amend(edit, {
                    title: title.trim(),
                    body: excerpt,
                    fullContent: content.trim(),
                });
                // The rewrite is the house's now, so the copy on the phone goes.
                clearDraft(user?.id, 'edit', edit);
                // And the backup, which exists only until the house has the words.
                void dropDraft(user?.id, 'edit', edit);
                reelToast.success('Essay updated');
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
                // The draft is deleted only after the write is accepted. It used
                // to be deleted on the strength of a success that a silent
                // truncation had already spoiled; now nothing is thrown away
                // until there is a row to throw it away for.
                if (filed) { clearDraft(user?.id, 'dossier'); void dropDraft(user?.id, 'dossier'); }
                reelToast.success(filed?.offline ? 'Filed. It goes out when the wire is back.' : 'Essay filed');
            }
            router.replace('/(tabs)/dispatch');

        } catch (err) {
            /**
             * ── AND IT SAYS THE WORDS ARE SAFE, BECAUSE THEY ARE ─────────────
             * The draft is deliberately kept when a filing is refused — there
             * is a test for it — and the member was told only "Transmission
             * failed". The one moment they most need to know their evening
             * survived was the one moment nothing said so.
             *
             * `saveFailed` is the exception and it is not a detail: if the
             * phone also refused the draft, promising the words are kept would
             * be a lie told at the worst possible moment.
             */
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
                        /**
                         * ── THE ONE PLACE A FAILED SAVE IS WORTH SAYING ──────
                         * There is no save indicator in this room and there is
                         * not going to be one: a mark that only ever confirms is
                         * decoration, and no app worth copying has one.
                         *
                         * But if the phone genuinely refused the write, silence
                         * here is how somebody walks away from four thousand
                         * words believing they are safe. So the warning lives at
                         * the exit — the only moment the loss becomes real — and
                         * nowhere else.
                         */
                        const lost = saveFailed && !edit;
                        Alert.alert(
                            lost ? 'This is not being kept' : 'Discard this essay?',
                            lost
                                ? 'Your phone is out of space, so nothing here has been saved. File it now, or free some room and come back.'
                                : 'What you have written will be lost.',
                            [
                                { text: lost ? 'Go back' : 'Keep writing', style: 'cancel' },
                                { text: 'Discard', style: 'destructive', onPress: () => {
                                    // Whichever one this room is holding. Discarding
                                    // an amend must not touch an unfinished new
                                    // essay sitting in the other slot.
                                    // The backup goes with it: a discarded
                                    // essay must not reappear on the next phone.
                                    if (edit) { clearDraft(user?.id, 'edit', edit); void dropDraft(user?.id, 'edit', edit); }
                                    else { clearDraft(user?.id, 'dossier'); void dropDraft(user?.id, 'dossier'); }
                                    router.back();
                                } },
                            ],
                        );
                    } else {
                        router.back();
                    }
                }} hitSlop={{top:10,bottom:10,left:10,right:10}} haptic
                    accessibilityRole="button"
                    accessibilityLabel="Cancel, and leave the writing room">
                    {/* The header is three across and cannot reflow, so its
                        labels take the deck cap: one line, and shrink-to-fit
                        rather than push a neighbour off the row. */}
                    <Text style={styles.cancelBtn} {...deckLabelProps}>CANCEL</Text>
                </PressableScale>
                <Text style={styles.headerTitle} {...deckLabelProps}>THE WRITING ROOM</Text>
                <PressableScale
                    onPress={() => {
                        setIsPreview(!isPreview);
                    }}
                    haptic="medium"
                    accessibilityRole="button"
                    // The label says what the press DOES, and the state says
                    // where you are. A control announced only as "Preview" gives
                    // a reader no way to know it is already showing one.
                    accessibilityState={{ selected: isPreview }}
                    accessibilityLabel={isPreview ? 'Back to editing' : 'Preview the essay'}
                >
                    <Text style={styles.previewBtn} {...deckLabelProps}>{isPreview ? 'EDIT' : 'PREVIEW'}</Text>
                </PressableScale>
            </View>

            {isPreview ? (
                <CinematicScrollView style={styles.workspace} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                    {/* ── THIS IS THE READER, NOT A PICTURE OF IT ──────────────
                        The preview used to set an essay in Courier 15/24 in
                        `bone`, with its own heading sizes, while the page it
                        would appear on sets it in Spectral 16.5/28 in
                        `parchment`, opens it with a raised initial, and prints
                        a section break as an ornament. Two different documents.
                        A member could not learn anything here about how their
                        writing would actually read.

                        `EssayBody` is the component the Dispatch itself mounts,
                        so the answer can no longer drift: there is one essay
                        typography and this is it.

                        ── AND IT IS CAPPED NOW, WHICH THE OLD NOTE REFUSED ────
                        That note said capping the preview would be "the app
                        fighting its user". It was written about truncation, but
                        the cap is not a style rule — it is the guard against two
                        markdown rules that are QUADRATIC, and the preview runs
                        the same renderer the reader does. Uncapped, a very long
                        draft could stall the composer exactly as it would stall
                        the page.

                        Nothing publishable is affected: `filingEssay` and
                        `dossierContent` are both 25,000, and sanitizeInput says
                        that is "not by accident". A draft ALREADY over the limit
                        now shows an ellipsis at the point the composer already
                        refuses to file past — which tells a member where the
                        limit bites rather than hiding it. */}
                    <Text style={styles.previewEyebrow} {...scaledTextProps}>AS THE HOUSE WILL SET IT</Text>
                    {/* ── AND THE HEAD IS THE READER'S TOO ────────────────────
                        The note above is about the BODY, and the body was the
                        half that got fixed. The head stayed a hand-rolled
                        eyebrow and a `previewTitle` — so a preview promising
                        "as the house will set it" set the title in a style the
                        house does not use, printed no DOSSIER label, no byline,
                        no read time, no series line, and no COVER.

                        The cover is the one that decides it. A member picks a
                        film, the essay gets a 176pt band of its backdrop at the
                        top of the page, and until now there was nowhere to see
                        that before filing. Now the preview IS the head. */}
                    {title || film ? (
                        <EssayHead
                            title={title}
                            series={series ? `Part ${roman(series.part)} of ${series.title}` : undefined}
                            author={{
                                name: user?.username ?? '',
                                memberNo: user?.member_no ?? 0,
                                // Their real rank, so an Auteur previewing their
                                // own essay sees their own mark — the same
                                // resolution the byline uses everywhere else.
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
                            // No handlers: there is nothing to open from a
                            // preview, and a control that leads nowhere is worse
                            // than none.
                        />
                    ) : null}
                    {content ? (
                        <EssayBody text={content} />
                    ) : (
                        <View style={styles.emptyPreview}>
                            {/* The form's name, and none of the flourish. The
                                room already says THE WRITING ROOM above and
                                DOSSIER on the button below; "your cinematic
                                essay" is a third word for the same thing, in a
                                register nothing else here uses. */}
                            <Text style={styles.emptyPreviewText} {...scaledTextProps}>Your essay will appear here, as the house will set it.</Text>
                        </View>
                    )}
                </CinematicScrollView>
            ) : (
                <Animated.View style={[styles.kavFlex, animatedContainerStyle]}>
                    <CinematicScrollView style={styles.workspace} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomInset={insets.bottom}>
                        {/* ── WORDS THAT APPEARED WITHOUT YOU TYPING THEM ─────
                            This is not the room narrating its own plumbing —
                            there is no "saved" mark anywhere and there will not
                            be one. It explains writing that is on screen and was
                            not typed just now, which is the one thing a member
                            cannot work out for themselves.

                            It goes on the first keystroke, because typing IS
                            accepting it, and `START CLEAN` is here because
                            otherwise a member who wants a fresh essay has to
                            hand-delete four thousand characters. */}
                        {/* ── A NEWER ONE WAS WRITTEN SOMEWHERE ELSE ─────────
                            It asks; it never merges. And the question names
                            BOTH sides with a time and a length, because "a
                            newer version exists, replace?" is not a question
                            anybody can answer about their own writing. */}
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
                            // ── ONE NUMBER, NOT THREE ──────────────────────
                            // This was a literal 100 while `filingTitle` is 200
                            // and the column's `title_ceiling` is 200 too. So
                            // the box refused the second half of a headline the
                            // sanitiser and the database would both have taken —
                            // and `maxLength` simply stops accepting keystrokes,
                            // so the member got no message either. They would
                            // just find the title would not go any further.
                            //
                            // `MAX_LENGTHS` is where that number is decided, and
                            // it already agrees with the ceiling checked live.
                            maxLength={MAX_LENGTHS.filingTitle}
                            cursorColor={colors.sepia}
                            selectionColor="rgba(184,137,26,0.3)"
                            keyboardAppearance="dark"
                            accessibilityLabel="Essay headline"
                        />
                        {/* ── WHAT THE PIECE IS ────────────────────────────────
                            Above the writing, and separate from it. The rail at
                            the foot sets HOW the words read; these two say what
                            the dossier is about, which is a different question
                            and belongs with the title rather than with bold and
                            italic. */}
                        <View style={styles.slots}>
                            <PressableScale
                                style={styles.slot} onPress={() => setFilmOpen(true)} haptic="selection"
                                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
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
                                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
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
                            placeholderTextColor={colors.ash}
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
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('**', '**')} haptic="selection" accessibilityRole="button" accessibilityLabel="Bold">
                                <Bold size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>BOLD</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('*', '*')} haptic="selection" accessibilityRole="button" accessibilityLabel="Italic">
                                <Italic size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>ITALIC</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n## ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Heading">
                                <Type size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>HEADING</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n> ', '\n')} haptic="selection" accessibilityRole="button" accessibilityLabel="Block quote">
                                <Quote size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>QUOTE</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('\n---\n', '')} haptic="selection" accessibilityRole="button" accessibilityLabel="Horizontal rule">
                                <Minus size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>BREAK</Text>
                            </PressableScale>
                            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} style={styles.toolBtn} onPress={() => insertFormatting('[', '](url)')} haptic="selection" accessibilityRole="button" accessibilityLabel="Insert link">
                                <Link2 size={15} color={colors.parchment} />
                                <Text style={styles.toolWord} {...scaledTextProps}>LINK</Text>
                            </PressableScale>
                        </ScrollView>
                    </View>

                    <BlurView intensity={90} tint="dark" style={styles.footer}>
                        <View style={styles.stats}>
                            {/* The counter row is the other one that cannot
                                reflow: three items sharing a fixed strip. The
                                values nested inside inherit the cap. */}
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
                            // Disabled is ANNOUNCED, not merely applied. Without
                            // it the control reads as available and answers a
                            // press with nothing, which is the exact experience
                            // this whole audit exists to prevent.
                            accessibilityState={{ disabled: !title || !content || isPublishing, busy: isPublishing }}
                            accessibilityLabel={
                                isPublishing ? 'Filing the essay'
                                    : !title || !content ? 'File the essay. Not ready yet — it needs a title and a body'
                                        : edit ? 'Re-file the essay' : 'File the essay'
                            }
                        >
                            {/* Keeps its own shrink-to-fit — 'FILE THE ESSAY'
                                is the longest label on the screen — and gains
                                the ceiling it never had. */}
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
                        // The essay's cover, which the head has been drawing
                        // from nothing since it was written.
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

const styles = StyleSheet.create({
    container: {
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
        fontSize: 9,
        color: colors.fog,
        letterSpacing: 1.5,
        includeFontPadding: false,
    },
    headerTitle: {
        fontFamily: fonts.sub,
        fontSize: 9,
        letterSpacing: 3,
        color: colors.sepia,
        includeFontPadding: false,
    },
    previewBtn: {
        fontFamily: fonts.sub,
        fontSize: 9,
        color: colors.parchment,
        letterSpacing: 1.5,
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
        backgroundColor: 'rgba(10,7,3,0.9)',
        paddingVertical: 8,
    },
    toolsScroll: {
        paddingHorizontal: 16,
        gap: 6,
    },
    toolBtn: {
        // A column now — the mark, and its NAME under it. Six unlabelled icons
        // meant a member had to already know what markdown was to use a rail
        // that exists so they would not have to.
        alignItems: 'center',
        gap: 3,
        paddingVertical: 6,
        // ── THE CHROME PAID FOR THE TYPE ──────────────────────────────────────
        // The names used to be 6.5pt, and the reason was arithmetic rather than
        // taste: six buttons at 10pt padding, 52pt minimum and 8pt gaps cost
        // 388pt of a 390pt phone, so 6.5 was the largest size at which all six
        // tools still fit one screen. It bought that at the price of a label a
        // member with ordinary eyesight cannot read, and one they could not
        // enlarge — see `toolWord`.
        //
        // Measured against the real rail: padding 8, minimum 48 and 6pt gaps
        // cost 365pt at 8.5pt names. All six still fit, with 25pt to spare
        // instead of 2, and the names are a third larger. The rhythm survives —
        // five buttons land on the 48 minimum, HEADING sets its own 60.
        paddingHorizontal: 8,
        backgroundColor: 'rgba(184,137,26,0.1)',
        borderRadius: 4,
        minWidth: 48,
    },
    toolWord: {
        fontFamily: fonts.sub,
        // 8.5pt is the house's label size — the same one the slot values, the
        // stamps and every rail label on the page are set in. The rail was the
        // one place that went below it.
        fontSize: 8.5,
        letterSpacing: 1.2,
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
        fontSize: 8,
        letterSpacing: 2,
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
        color: colors.crimson,
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
        fontSize: 9,
        letterSpacing: 2,
        color: colors.ink,
        includeFontPadding: false,
    },

    // Preview
    previewEyebrow: {
        fontFamily: fonts.sub,
        fontSize: 9,
        letterSpacing: 3,
        color: colors.sepia,
        marginBottom: 16,
        textAlign: 'center',
        includeFontPadding: false,
    },
    previewTitle: {
        // The reader's own head — `PaperEssay.title`, 26/34 in parchment. It was
        // 30pt here, which is a fourth size for one thing on one screen.
        fontFamily: fonts.display,
        fontSize: 26,
        lineHeight: 34,
        color: colors.parchment,
        marginBottom: 20,
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
     * ── THE PREVIEW'S MEASURE IS THE PAGE'S MEASURE ──────────────────────────
     * This was `padding: 20`, and two things followed from the four points.
     *
     * The essay set to a 350pt column here and a 315pt column on the page, so
     * every line broke somewhere else — on the one screen whose entire promise
     * is "as the house will set it".
     *
     * And the COVER bled wrong. `EssayHead` draws it with `marginHorizontal:
     * -24`, which reaches exactly the edge of the sheet's own 24pt gutter; in a
     * 20pt one it reached four points PAST the container on each side.
     *
     * Derived, not typed: the sheet's own margin, rail and padding, so the
     * preview follows the page if any of the three is ever re-cut.
     */
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
        flexShrink: 1, fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
        color: colors.sepia, includeFontPadding: false,
    },
    /** Crimson, because this one is a loss rather than a courtesy. */
    restoredLost: { color: colors.crimsonInk },
    restoredAct: {
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
        color: colors.parchment, includeFontPadding: false,
    },
    /**
     * The two-sided question. A BOX rather than a line, because unlike the
     * restore notice this one is a decision and must not be mistaken for
     * something that will go away by itself.
     *
     * Column, not a row: two labelled facts and two acts cannot share a line at
     * the accessibility size without one of them being crushed, and this is the
     * one place in the room where a member is choosing between two versions of
     * their own work.
     */
    elsewhereBox: {
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.30)', borderRadius: 2,
        paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
    },
    elsewhereHead: {
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
        color: colors.parchment, marginBottom: 8, includeFontPadding: false,
    },
    elsewhereLine: {
        fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.4,
        color: colors.sepia, marginTop: 2, includeFontPadding: false,
    },
    elsewhereActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
    elsewhereTake: {
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
        color: colors.parchment, includeFontPadding: false,
    },
    /** Equal weight. A choice where one act is louder is not a choice. */
    elsewhereKeep: {
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
        color: colors.parchment, includeFontPadding: false,
    },
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
    /**
     * FILM and SERIES name the two things a member sets before writing, and they
     * were 7pt and frozen. The column they sit in is a fixed width, so the size
     * and the width move together: SERIES wants 41pt at 8.5 and 47pt at the 1.2
     * ceiling `actionLabelProps` puts on it, both inside 54. `adjustsFontSizeToFit`
     * in that same prop is the floor under the arithmetic — a longer word in a
     * future language shrinks rather than spilling into the value beside it.
     */
    slotLabel: {
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.8, color: colors.sepia,
        width: 54, includeFontPadding: false,
    },
    /** Unset reads as an invitation; set reads as a fact. */
    slotValue: {
        fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog,
        includeFontPadding: false, flex: 1, minWidth: 0,
    },
    slotValueSet: { color: colors.parchment },
});

