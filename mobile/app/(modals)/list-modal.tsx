/**
 * CreateListModal — Full list creation flow.
 *
 * Pixel-perfect native port of web CreateListModal.tsx (199 lines).
 * Features:
 *  - Drag handle bar (touch)
 *  - Title + Description inputs
 *  - TMDB film search → add films inline
 *  - Privacy toggle (Globe/Lock)
 *  - Film list with remove
 *  - CREATE LIST / SAVE CHANGES submit
 *
 * Route: /list-modal?editId=xxx
 */
import { nav } from '@/src/utils/typedRouter';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    InteractionManager,
    Keyboard,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { cancelAnimation, FadeIn, ReduceMotion, useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import TactileEngine from '@/src/utils/TactileEngine';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { ToastOverlay } from '@/src/components/ToastOverlay';
import { displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { useBanCheck } from '@/src/hooks/useBanCheck';
import { tmdb } from '@/src/lib/tmdb';
import { useListStore } from '@/src/stores/films';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { Globe, GripVertical, List, ListOrdered, Lock, Plus, Search, X } from 'lucide-react-native';

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

/**
 * Height of the docked act, so the scroll can end above it.
 *
 * The bar was reserving 80pt against a real ~145 — it stood on top of the last
 * 65pt of the form, which is the whole RANKED / UNRANKED row. Declared here,
 * checked against the bar's own styles by a test, exactly as SEAL_BAR_HEIGHT is
 * on the composer: two places reserve this room and neither may guess it.
 *
 * Everything above the safe-area inset, which the callers add separately.
 */
export const CURATE_BAR_HEIGHT = 104;

// No hitSlop constants: every control on this page reaches 48 by its own
// geometry now. A halo lives inside React Native's touch dispatch and is
// invisible to both platforms' accessibility layers, so it buys reach and never
// compliance — and past the floor it only takes area from a neighbour.

interface ListFilm {
    id: number;
    title: string;
    poster_path?: string | null;
}

interface SearchResult {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    release_date?: string;
    media_type?: string;
}

 
const ListFilmItem = React.memo(({ item, index, drag, isActive, sealed, onRemove }: { item: ListFilm, index: number | undefined, drag: () => void, isActive: boolean, sealed: boolean, onRemove: (id: number) => void }) => {
    // Cache the index during active drag so the number never flashes to a hyphen.
    const lastIndex = React.useRef<number | undefined>(index);
    if (index !== undefined) {
        lastIndex.current = index;
    }
    const displayIndex = index !== undefined ? (index + 1).toString() : (lastIndex.current !== undefined ? (lastIndex.current + 1).toString() : '-');
    
    return (
        <ScaleDecorator>
            <PressableScale
                onLongPress={sealed ? undefined : drag}
                disabled={isActive}
                style={[
                    s.filmRow,
                    s.filmRowMargin,
                    isActive ? s.filmRowActive : undefined
                ]}
                // The row is ~58pt tall — already well over the floor — and these
                // rows are STACKED. PressableScale's default halo is 15pt on every
                // side, so each row's halo reached 15pt up into the row above it,
                // and a later sibling wins an overlap on both platforms. The
                // bottom of every film row was firing the row BELOW it.
                hitSlop={null}
                haptic="light"
                accessibilityRole={sealed ? 'text' : 'button'}
                accessibilityLabel={sealed ? item.title : `Reorder ${item.title}`}
            >
                {!sealed && <GripVertical size={16} color={isActive ? colors.sepia : colors.fog} style={s.gripOpacity} />}
                <View style={[s.rankWrap, isActive && s.rankWrapActive]}>
                    <Text 
                        style={[s.rankText, isActive && s.rankTextActive]} 
                        numberOfLines={1} 
                        adjustsFontSizeToFit 
                        minimumFontScale={0.3}
                    >
                        {displayIndex}
                    </Text>
                </View>
                {item.poster_path ? (
                    <Image source={{ uri: tmdb.poster(item.poster_path, 'w92') }} style={s.filmPoster} cachePolicy="memory-disk" transition={150} recyclingKey={item.poster_path} />
                ) : (
                    <View style={[s.filmPoster, s.filmPosterEmpty]} />
                )}
                <Text style={s.filmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{item.title}</Text>
                {!sealed && (
                    <PressableScale onPress={() => onRemove(item.id)} style={s.removeBtn} hitSlop={null} haptic="light" accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`}>
                        <X size={14} color={colors.crimson} />
                    </PressableScale>
                )}
            </PressableScale>
        </ScaleDecorator>
    );
});

 
const DropdownResultRow = React.memo(({ r, onAdd }: { r: SearchResult, onAdd: (r: SearchResult) => void }) => {
    // Same stacking trap as the film rows: a 62pt result, six of them in a
    // column, each claiming 15pt into its neighbour. Adding the wrong film is a
    // worse outcome than most misses on this page — it is silent.
    return (
        <PressableScale style={s.dropRow} onPress={() => onAdd(r)} hitSlop={null} accessibilityRole="button" accessibilityLabel={`Add ${r.title ?? r.name}`}>
            {r.poster_path ? (
                <Image source={{ uri: tmdb.poster(r.poster_path, 'w92') }} style={s.dropPoster} cachePolicy="memory-disk" transition={150} />
            ) : (
                <View style={[s.dropPoster, s.filmPosterEmpty]} />
            )}
            <View style={s.dropFlex}>
                <Text style={s.dropTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{r.title ?? r.name}</Text>
                <Text style={s.dropMeta}>{r.release_date?.slice(0, 4) ?? '—'}</Text>
            </View>
            <Plus size={16} color={colors.sepia} />
        </PressableScale>
    );
});

export default function ListModal() {

    const params = useLocalSearchParams<{ editId?: string }>();
    const lists = useListStore((s: any) => s.lists);
    const createList = useListStore((s: any) => s.createList);
    const updateList = useListStore((s: any) => s.updateList);
    const { checkBan } = useBanCheck();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    
    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
    }));

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Edit mode
    const editList = params.editId ? lists.find((l: any) => l.id === params.editId) || queryClient.getQueryData<any>(['stack', params.editId])?.list : null;

    const [title, setTitle] = useState(editList?.title || '');
    const [description, setDescription] = useState(editList?.description || '');
    const [isPrivate, setIsPrivate] = useState(editList?.isPrivate || false);
    const [isRanked, setIsRanked] = useState(editList?.isRanked || false);
    const [films, setFilms] = useState<ListFilm[]>(
        editList?.films?.map((f: { id: number; title?: string; poster_path?: string | null; poster?: string | null }) => ({ id: f.id, title: f.title ?? '', poster_path: f.poster_path ?? f.poster ?? null })) ?? []
    );
    const [saving, setSaving] = useState(false);

    /**
     * ── THE FORM FOLLOWS THE STACK, IT DOES NOT SNAPSHOT IT ──────────────────
     *
     * Every field above was seeded by a useState INITIALIZER, which runs once.
     * If the stack had not resolved by the time this sheet mounted — the store
     * still hydrating, the query cache cold — the form opened EMPTY and never
     * recovered. Combined with a header that says NEW STACK and a save path
     * that prunes, that is how a curator renames their own stack and loses
     * every film in it.
     *
     * Hydrated on first AVAILABILITY instead, once per stack, so a later
     * refetch can never overwrite what the member has since typed.
     */
    const hydratedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!params.editId || !editList) return;
        if (hydratedFor.current === params.editId) return;
        hydratedFor.current = params.editId;
        setTitle(editList.title ?? '');
        setDescription(editList.description ?? '');
        setIsPrivate(!!editList.isPrivate);
        setIsRanked(!!editList.isRanked);
        setFilms((editList.films ?? []).map((f: { id: number; title?: string; poster_path?: string | null; poster?: string | null }) =>
            ({ id: f.id, title: f.title ?? '', poster_path: f.poster_path ?? f.poster ?? null })));
    }, [params.editId, editList]);

    /**
     * ── "I DON'T KNOW" MUST NEVER LOOK LIKE "I EMPTIED IT" ───────────────────
     *
     * `films: []` is a real instruction. Both the direct write and the offline
     * replay read it as the curator having emptied the stack and delete every
     * list_item; `undefined` is skipped entirely. So the form may only send a
     * set it is CERTAIN of.
     *
     * The cached stack payload is capped at 500 items and carries the true
     * count beside it, so a stack larger than the cap can be recognised. Where
     * the count is unknown the store's own copy is used, which is fetched
     * unbounded — but the rule is the same either way: if what we hold does not
     * match what exists, the holdings are not ours to submit.
     */
    const trueFilmCount: number | undefined =
        params.editId ? queryClient.getQueryData<any>(['stack', params.editId])?.list?.filmCount : undefined;
    const holdingsAreComplete =
        !params.editId ? true
        : !editList ? false
        : trueFilmCount === undefined ? true
        : (editList.films?.length ?? 0) >= trueFilmCount;

    /** An editId that resolves to nothing must never quietly become a create. */
    const editTargetMissing = !!params.editId && !editList;

    /**
     * ── AND THE CONTROLS MUST AGREE WITH THE SAVE ────────────────────────────
     *
     * Omitting the holdings keeps them safe, but it left the ✕, the grip and the
     * search field all working on a set that would then be thrown away: every
     * removal appeared to take, and came back on the next open. A sheet that
     * cannot write the index must not offer to edit it.
     */
    const holdingsAreSealed = !!params.editId && !editTargetMissing && !holdingsAreComplete;

    /**
     * ── WHAT THE ACT SAYS ────────────────────────────────────────────────────
     *
     * The button dimmed itself and explained nothing, so a member with no title
     * saw a dead control and no reason. It states the want instead, and once the
     * want is met it carries the stack's own mark — which is also the only
     * confirmation that a film just added actually landed, since the list may be
     * far below the fold by then.
     */
    const canFile = !!title.trim() && !saving && !editTargetMissing;
    const fileLabel = saving ? 'FILING…' : (editList ? 'SAVE THE AMENDMENTS' : 'FILE THE STACK');
    const reelWord = films.length === 1 ? 'REEL' : 'REELS';
    const barLine = editTargetMissing ? 'THIS STACK COULD NOT BE OPENED'
        : !title.trim() ? 'A NAME FOR YOUR THESIS'
        : [
            `${films.length} ${reelWord}`,
            isRanked ? 'RANKED' : 'UNRANKED',
            isPrivate ? 'SEALED' : 'PUBLIC',
          ].join('  ·  ');

    // Search state
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    // Derived values for UI state

    // Nitrate Noir Breathing Ember Protocol
    const emberOpacity = useSharedValue(0.5);
    useEffect(() => {
        if (searching) {
            emberOpacity.value = withRepeat(
                withTiming(1, { duration: 600, reduceMotion: ReduceMotion.System }),
                -1,
                true
            );
        } else {
            cancelAnimation(emberOpacity);
            emberOpacity.value = withTiming(0.5, { duration: 300, reduceMotion: ReduceMotion.System });
        }
    }, [searching, emberOpacity]);

    const animatedIconProps = useAnimatedProps(() => ({
        color: searching ? colors.bloodReel : colors.fog,
    }));
    const animatedIconStyle = useAnimatedStyle(() => ({
        opacity: emberOpacity.value,
    }));

    // ── Search handler ──
    const handleSearch = useCallback((q: string) => setQuery(q), []);

    useEffect(() => {
        if (!query.trim()) { setResults([]); setSearching(false); return; }
        let active = true;
        setSearching(true);
        const timeoutId = setTimeout(async () => {
            try {
                const res = await tmdb.search(query, 1);
                if (!active) return;
                const filtered = (res.results || [])
                    .filter((r: SearchResult) => r.media_type !== 'person')
                    .filter((r: SearchResult) => !films.some(f => f.id === r.id))
                    .slice(0, 6) as SearchResult[];
                if (isMounted.current) setResults(filtered);
             
            } catch (err: unknown) { if (active && isMounted.current) setResults([]); }
            finally { if (active && isMounted.current) setSearching(false); }
        }, 400);
        return () => { active = false; clearTimeout(timeoutId); };
    }, [query, films]);

    /**
     * ── THE HOLDINGS ARE SPOKEN, NOT ONLY SHOWN ──────────────────────────────
     *
     * A film joins at the BOTTOM of an index that may be hundreds of rows long,
     * so the only sighted confirmation is the count on the docked bar. Someone
     * who cannot see that has none at all, and `accessibilityLiveRegion` is
     * Android-only — so it is announced outright or it is not announced on iOS.
     *
     * The announcement reads the CURRENT set from a ref rather than from inside
     * the updater. A state updater must be pure: React may run it more than
     * once, which would say the same sentence twice. The ref also keeps both
     * callbacks identity-stable, so adding a film cannot re-render five hundred
     * memoised rows.
     */
    const filmsRef = useRef(films);
    useEffect(() => { filmsRef.current = films; }, [films]);

    const addFilm = useCallback((f: SearchResult) => {
        const name = f.title ?? f.name ?? '';
        const already = filmsRef.current.some(film => film.id === f.id);
        setFilms(prev => (prev.some(film => film.id === f.id)
            ? prev
            : [...prev, { id: f.id, title: name, poster_path: f.poster_path }]));
        setQuery('');
        setResults([]);
        if (!already) {
            AccessibilityInfo.announceForAccessibility(`${name} added. ${filmsRef.current.length + 1} in the stack.`);
        }
        TactileEngine.selection();
    }, []);

    // ── Remove film from list ──
    const removeFilm = useCallback((filmId: number) => {
        const gone = filmsRef.current.find(f => f.id === filmId);
        setFilms(prev => prev.filter(f => f.id !== filmId));
        if (gone) {
            AccessibilityInfo.announceForAccessibility(`${gone.title} removed. ${filmsRef.current.length - 1} in the stack.`);
        }
        TactileEngine.mutate();
    }, []);

    // ── Save handler ──
    const handleSave = async () => {
        Keyboard.dismiss();
        // Before setSaving: an early return after it would strand the button
        // spinning, since setSaving(false) only runs in the catch. Covers BOTH
        // branches below — a silenced member may not create OR edit a stack.
        if (checkBan()) return;
        if (!title.trim()) {
            reelToast.error('Every stack requires a title. Name your thesis.');
            return;
        }
        // An editId that never resolved must not fall through to the create
        // branch below — that produces a SECOND stack while the member believes
        // they amended the first.
        if (editTargetMissing) {
            reelToast.error('That stack could not be opened for amendment. Go back and try again.');
            return;
        }
        setSaving(true);
        try {
            if (editList) {
                // Update existing list through store so list_items sync natively
                await updateList(editList.id, {
                    title: title.trim(),
                    description: description.trim(),
                    isPrivate,
                    isRanked,
                    // OMITTED, never empty. `films: []` instructs both the write
                    // and the offline replay to delete every item; `undefined`
                    // leaves the holdings untouched. When the set we hold is not
                    // the whole set, the note and terms are still worth saving —
                    // the holdings are simply not ours to rewrite.
                    ...(holdingsAreComplete
                        ? { films: films.map(f => ({ id: f.id, title: f.title, poster: f.poster_path ?? null })) }
                        : {}),
                });
                queryClient.removeQueries({ queryKey: ['stack', editList.id] });
            } else {
                // Create new list
                await createList({
                    title: title.trim(),
                    description: description.trim(),
                    isPrivate,
                    isRanked,
                    films: films.map(f => ({ id: f.id, title: f.title, poster: f.poster_path ?? null })),
                });
            }
            queryClient.invalidateQueries({ queryKey: ['stacks'] });
            TactileEngine.success();
            InteractionManager.runAfterInteractions(() => {
                // Guarded like the catch below and like both sibling modals. Work
                // handed to the InteractionManager still runs after this sheet is
                // gone, and an unguarded back() there pops whatever the member
                // navigated to instead.
                if (isMounted.current) nav.back();
            });
        } catch (err: unknown) {
            TactileEngine.error();
            const msg = err instanceof Error ? err.message : 'The stack could not be saved.';
            reelToast.error(msg);
            if (isMounted.current) setSaving(false);
        }
    };

    const renderFilmItem = useCallback(({ item, getIndex, drag, isActive }: RenderItemParams<ListFilm>) => {
        return (
            <ListFilmItem
                item={item}
                index={getIndex()}
                drag={drag}
                isActive={isActive}
                sealed={holdingsAreSealed}
                onRemove={removeFilm}
            />
        );
    }, [removeFilm, holdingsAreSealed]);

    const ListHeader = (
        <>
            {/* Drag Handle */}
            <View style={[s.handleWrap, { paddingTop: Math.max(insets.top + 10, 20) }]}>
                <View style={s.handle} />
            </View>

            {/* Header */}
            <View style={s.header}>
                {/* It said NEW STACK while you were amending one — beside a
                    button reading SAVE CHANGES, so the sheet contradicted itself
                    in two places at once. A member who believes they are
                    starting something new will fill in a form that is actually
                    about to rewrite something old.

                    It names the MODE, not the stack. Naming the stack here put
                    the same words twice within sixty points, since the plate
                    directly below holds that title in a larger face — and the
                    plate is the copy you can actually edit.

                    No shrink-to-fit: it is unreliable on Android, so the two
                    platforms disagreed about the same title. Two lines and an
                    ellipsis are honest at any width. */}
                <View style={s.headerTitleWrap}>
                    <Text style={s.headerTitle} numberOfLines={2} {...displayTextProps}>
                        {editList ? 'Amend a Stack' : 'Curate a Stack'}
                    </Text>
                </View>
                <PressableScale onPress={() => { nav.back(); }} style={s.closeBtn} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel="Close list modal">
                    <X size={16} color={colors.fog} />
                    <Text style={s.closeBtnText}>CLOSE</Text>
                </PressableScale>
            </View>

            {/* THE PLATE — the name, in the face the catalogue will set it in. */}
            <View style={s.sec}>
                <Text style={s.label}>TITLE</Text>
                <TextInput
                    style={s.plate}
                    // Wraps rather than shrinks: a hundred characters of Rye is
                    // five lines here, and a squeezed title is worse than a
                    // second one. adjustsFontSizeToFit would disagree across
                    // platforms anyway.
                    multiline
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Neon Noir Masterpieces"
                    placeholderTextColor={colors.fog}
                    autoFocus
                    maxLength={100}
                    selectionColor={'rgba(218,165,32,0.3)'}
                    cursorColor={colors.sepia}
                    disableFullscreenUI={true}
                    keyboardAppearance="dark"
                    accessibilityLabel="Stack title"
                    // 26pt is already display size; uncapped, an accessibility
                    // setting could take it past 70 and leave four words filling
                    // the sheet.
                    {...displayTextProps}
                />
            </View>

            {/* Film Search & Add */}
            <View style={[s.sec, { marginBottom: films.length > 0 ? 12 : 0 }]}>
                <Text style={s.label}>HOLDINGS</Text>

                {/* Held back only while the index cannot be written. Live
                    controls over holdings that will be discarded are worse than
                    no controls: every removal would appear to take and then
                    quietly return. */}
                {holdingsAreSealed ? (
                    // In the search field's own place, so the section reads the
                    // same either way: label, then the thing you may do here.
                    <View style={s.lockNote}>
                        <Text style={s.lockNoteText} {...scaledTextProps}>
                            THIS INDEX IS LARGER THAN THIS SHEET CAN HOLD{typeof trueFilmCount === 'number' ? ` — ${trueFilmCount} REELS` : ''}.{'\n'}
                            THE NAME, NOTE AND TERMS CAN BE AMENDED HERE; THE HOLDINGS ARE KEPT EXACTLY AS THEY STAND.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={s.searchWrap}>
                            <AnimatedSearchIcon
                                size={14}
                                animatedProps={animatedIconProps}
                                style={[s.searchIcon, animatedIconStyle]}
                            />
                            <TextInput
                                style={s.searchInput}
                                placeholder="Search films to add..."
                                placeholderTextColor={colors.fog}
                                value={query}
                                onChangeText={handleSearch}
                                returnKeyType="search"
                                selectionColor={'rgba(218,165,32,0.3)'}
                                cursorColor={colors.sepia}
                                disableFullscreenUI={true}
                                autoCorrect={false}
                                spellCheck={false}
                                autoCapitalize="words"
                                keyboardAppearance="dark"
                                accessibilityLabel="Search films to add to stack"
                            />
                        </View>

                        {/* Search results dropdown */}
                        {results.length > 0 && (
                            <Animated.View entering={FadeIn.duration(150)} style={s.dropdown}>
                                {results.map(r => (
                                    <DropdownResultRow key={r.id} r={r} onAdd={addFilm} />
                                ))}
                            </Animated.View>
                        )}
                    </>
                )}
            </View>

            {/* ── A caption about the index belongs ABOVE the index ───────────
                It was beneath it, so on a stack of any size you met the caption
                after scrolling past the thing it was describing.

                Said once there is an ORDER to speak of — a single reel has none
                — and never before. The order is written to rank_position for
                every stack, ranked or not: "unranked" means unnumbered, not
                unordered, and nothing here ever said so while the grip sat in
                the row in both modes. */}
            {!holdingsAreSealed && films.length > 1 && (
                <Text style={s.dragLine} {...scaledTextProps}>DRAG TO ORDER  ·  THE ORDER IS KEPT EITHER WAY</Text>
            )}
        </>
    );

    const ListFooter = (
        <>
            {/* Description */}
            <View style={s.sec}>
                {/* (OPTIONAL) spent three words on a signal the docked bar
                    already gives by never asking for it. */}
                <Text style={s.label}>NOTE</Text>
                <TextInput
                    style={[s.input, s.descInput]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="A brief curation note..."
                    placeholderTextColor={colors.fog}
                    multiline
                    textAlignVertical="top"
                    maxLength={1000}
                    selectionColor={'rgba(218,165,32,0.3)'}
                    cursorColor={colors.sepia}
                    disableFullscreenUI={true}
                    keyboardAppearance="dark"
                    accessibilityLabel="Stack description"
                />
                {description.length > 800 && (
                    <Text style={s.counter}>{description.length}/1000</Text>
                )}
            </View>

            {/* THE TERMS — visibility and format are one decision about how
                this stack is published, and they were two labelled blocks. */}
            <View style={s.sec}>
                <Text style={s.label}>TERMS</Text>
                <View style={s.toggleRow}>
                    <PressableScale
                        style={[s.toggleBtn, !isPrivate && s.toggleActive]}
                        onPress={() => { setIsPrivate(false); TactileEngine.selection(); }}
                        hitSlop={null}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set stack to public"
                    >
                        <Globe size={14} color={!isPrivate ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, !isPrivate && s.toggleTextActive]}>PUBLIC</Text>
                    </PressableScale>
                    <PressableScale
                        style={[s.toggleBtn, isPrivate && s.toggleActive]}
                        onPress={() => { setIsPrivate(true); TactileEngine.selection(); }}
                        hitSlop={null}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set stack to private"
                    >
                        <Lock size={14} color={isPrivate ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, isPrivate && s.toggleTextActive]}>PRIVATE</Text>
                    </PressableScale>
                </View>
            </View>

            {/* Ranking — available to every rank; a ranked stack is a thesis. */}
            <View style={s.secTight}>
                <View style={s.toggleRow}>
                    <PressableScale
                        style={[s.toggleBtn, !isRanked && s.toggleActive]}
                        onPress={() => { setIsRanked(false); TactileEngine.selection(); }}
                        hitSlop={null}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set stack to unranked"
                    >
                        <List size={14} color={!isRanked ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, !isRanked && s.toggleTextActive]}>UNRANKED</Text>
                    </PressableScale>
                    <PressableScale
                        style={[s.toggleBtn, isRanked && s.toggleActive]}
                        onPress={() => { 
                            setIsRanked(true); 
                            TactileEngine.selection(); 
                        }}
                        hitSlop={null}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set stack to ranked"
                    >
                        <ListOrdered size={14} color={isRanked ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, isRanked && s.toggleTextActive]}>RANKED</Text>
                    </PressableScale>
                </View>
            </View>

            {/* The act is not here any more. It sat at the foot of the scroll,
                so a stack of fifty films put fifty rows between the member and
                the button that finishes the job — and it dimmed itself without
                ever saying what it was waiting for. It is docked below. */}
        </>
    );

    return (
        <Animated.View style={[s.container, animatedContainerStyle]} accessibilityViewIsModal={true}>
            <ToastOverlay />
            <DraggableFlatList
                data={films}
                onDragBegin={() => TactileEngine.navigate()}
                onDragEnd={({ data }) => setFilms(data)}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderFilmItem}
                ListHeaderComponent={ListHeader}
                // No empty state. It spent about 120pt of the first screen
                // restating the placeholder directly above it — "Search films to
                // add..." followed by "Search for films above to add them to
                // your stack." The search field is its own instruction.
                ListEmptyComponent={null}
                ListFooterComponent={ListFooter}
                contentContainerStyle={{ paddingBottom: insets.bottom + CURATE_BAR_HEIGHT + 16 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                containerStyle={s.containerFlex}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={3}
                updateCellsBatchingPeriod={50}
            />

            {/* ══ THE ACT ══ docked, and honest about what it wants. The same
                law as the composer's seal: a control that refuses must say why,
                and the act a page exists for should never be somewhere you have
                to go and find. */}
            <View style={[s.bar, { paddingBottom: insets.bottom + 14 }]}>
                <Text style={s.barLine} numberOfLines={1} {...scaledTextProps}>{barLine}</Text>
                <PressableScale
                    style={[s.barPress, !canFile && s.barDim]}
                    onPress={handleSave}
                    disabled={saving}
                    hitSlop={null}
                    pressedScale={0.97}
                    haptic="medium"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving }}
                    // The reason travels in the LABEL: accessibilityLiveRegion is
                    // Android-only, so a button that reads "File the stack" while
                    // doing nothing is a dead end for anyone who cannot see it dim.
                    accessibilityLabel={canFile ? fileLabel : `${fileLabel}. ${barLine}`}
                >
                    <Text style={s.barPressText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{fileLabel}</Text>
                </PressableScale>
                {/* No CANCEL. The way out is CLOSE, top-right, where a sheet's
                    dismissal lives — and the sheet still pulls down. A second
                    one here cost 48pt of a bar that was already standing on the
                    form, and gave the page two names for one act. */}
            </View>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.soot },
    handleWrap: { alignItems: 'center', paddingBottom: 8 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.sepia },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
        paddingHorizontal: 20, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: colors.ash,
    },
    headerTitleWrap: { flex: 1, paddingRight: 12 },
    headerTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.parchment },
    // 48 by geometry. A halo is invisible to both platforms' accessibility
    // layers, so only the box itself answers "is this big enough".
    closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 48, marginRight: -8 },
    closeBtnText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog, includeFontPadding: false },

    sec: { paddingHorizontal: 20, marginTop: 20 },
    secTight: { paddingHorizontal: 20, marginTop: 8 },
    label: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.sepia, marginBottom: 8, includeFontPadding: false },
    input: {
        backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
        padding: 12, fontFamily: fonts.body, fontSize: 14, color: colors.parchment,
    },
    /**
     * THE PLATE — the stack's name, set in the face the catalogue will use.
     *
     * A title is the only piece of type on this page that carries any weight,
     * and it was being typed into a 14pt monospace box to be discovered later,
     * on another screen, in another font. Here it takes its shape under the
     * member's hands.
     *
     * A rule beneath rather than a box around it, so it reads as a plate and
     * not as another field — with the caret in brass so it still plainly says
     * "type here". It WRAPS and never shrinks: adjustsFontSizeToFit is
     * unreliable multiline on Android, and a squeezed title is worse than a
     * second line.
     */
    plate: {
        borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
        paddingTop: 2, paddingBottom: 10, paddingHorizontal: 0,
        fontFamily: fonts.display, fontSize: 26, lineHeight: 34, color: colors.parchment,
    },

    // Search
    searchWrap: { position: 'relative' },
    searchInput: {
        backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
        paddingLeft: 36, paddingRight: 12, paddingVertical: 10,
        fontFamily: fonts.body, fontSize: 13, color: colors.parchment,
    },
    dropdown: {
        backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash,
        borderRadius: 4, marginTop: 4, overflow: 'hidden',
    },
    dropRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    },
    dropPoster: { width: 28, height: 42, borderRadius: 2 },
    dropTitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.parchment },
    dropMeta: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, letterSpacing: 1, marginTop: 2, includeFontPadding: false },

    // Film list
    containerFlex: { flex: 1 },
    filmRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: colors.ash,
        borderRadius: 4, padding: 8,
    },
    filmPoster: { width: 28, height: 42, borderRadius: 2 },
    filmTitle: { flex: 1, fontFamily: fonts.sub, fontSize: 13, color: colors.parchment },
    // Out of the drag row's own pressable and up to 48. At 26pt inside its
    // parent it both missed the floor and stole the area you grab to reorder —
    // a child always wins the touch, on both platforms.
    removeBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginVertical: -8, marginRight: -8 },
    filmRowMargin: { marginHorizontal: 20, marginBottom: 6 },
    filmRowActive: {
        backgroundColor: 'rgba(184,137,26,0.2)',
        borderColor: colors.sepia,
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
    },
    filmPosterEmpty: { backgroundColor: colors.ash },
    gripOpacity: { opacity: 0.5 },
    
    // Rank Styling
    rankWrap: { width: 36, alignItems: 'center', justifyContent: 'center', marginRight: 4, marginLeft: 2 },
    rankWrapActive: { transform: [{ scale: 1.1 }] },
    rankText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, opacity: 0.5, fontVariant: ['tabular-nums'], letterSpacing: 1 },
    rankTextActive: { color: colors.sepia, opacity: 1, textShadowColor: 'rgba(218,165,32,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },

    // Empty list state

    // The order is stored for EVERY stack: rank_position is written from the
    // array order whether or not the stack is ranked. "Unranked" means
    // unnumbered, not unordered — and nothing on this page ever said so while
    // the grip sat there in both modes.
    dragLine: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.fog, opacity: 0.8, paddingHorizontal: 20, marginTop: 14, marginBottom: 8, includeFontPadding: false },
    // Brass, not blood. Nothing has gone wrong here — a very large index simply
    // cannot be rewritten from a sheet, which is a house rule, not an error. Red
    // would have the member hunting for the mistake they had made.
    lockNote: {
        padding: 12, borderRadius: 4,
        backgroundColor: 'rgba(184,137,26,0.07)', borderWidth: 1, borderColor: colors.sepiaBorder,
    },
    lockNoteText: { fontFamily: fonts.sub, fontSize: 9, lineHeight: 15, letterSpacing: 0.6, color: colors.bone, includeFontPadding: false },

    // Privacy toggle
    toggleRow: { flexDirection: 'row', gap: 8 },
    toggleBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: 48, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
    },
    toggleActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    toggleText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.5, color: colors.fog, includeFontPadding: false },
    toggleTextActive: { color: colors.ink },

    // Submit

    /**
     * THE ACT, DOCKED — the same law as the composer's seal.
     *
     * CREATE STACK sat at the foot of the scroll, so with fifty films you
     * scrolled past all fifty to finish; and it dimmed itself without ever
     * saying what it wanted. Fixed to the sheet now, stating the want, and
     * carrying the stack's own mark once there is one — which is also the only
     * confirmation a member gets that a film they added actually landed.
     */
    bar: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: colors.soot,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.sepiaBorder,
        paddingHorizontal: 20, paddingTop: 12,
    },
    barLine: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.4, color: colors.fog, textAlign: 'center', marginBottom: 11, includeFontPadding: false },
    barPress: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
        backgroundColor: colors.sepia, borderRadius: 4, minHeight: 48,
    },
    barPressText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.ink, includeFontPadding: false },
    barDim: { opacity: 0.42 },
    // A way out should not carry the weight of the act it sits beside.

    // Extracted
    searchIcon: { position: 'absolute', left: 12, top: 13, zIndex: 1 },
    dropFlex: { flex: 1 },
    descInput: { minHeight: 72 },
    // Appears only near the ceiling — a counter present from the first
    // character is a warning about a limit nobody was approaching.
    counter: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1, color: colors.fog, textAlign: 'right', marginTop: 6, includeFontPadding: false },
});


DropdownResultRow.displayName = 'DropdownResultRow';

ListFilmItem.displayName = 'ListFilmItem';