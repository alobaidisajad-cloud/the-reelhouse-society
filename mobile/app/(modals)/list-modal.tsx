/**
 * list-modal.tsx — curate a stack, or amend one (/list-modal?editId=…): its name,
 * its films (searched, added, dragged into order, removed), its note, and its terms
 * (public or private, ranked or not), filed from a bar docked at the foot.
 */
import { nav } from '@/src/utils/typedRouter';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, InteractionManager, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { cancelAnimation, FadeIn, ReduceMotion, useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import TactileEngine from '@/src/utils/TactileEngine';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { useBanCheck } from '@/src/hooks/useBanCheck';
import { tmdb } from '@/src/lib/tmdb';
import { useListStore } from '@/src/stores/films';
import { colors, fonts, effects } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { Globe, GripVertical, List, ListOrdered, Lock, Plus, Search, X } from 'lucide-react-native';
import { EDGE_LIT } from '@/src/theme/light';

// At module scope: made inside the component, it would be a new type, and remount, each render.
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

/** The docked bar's height above the inset; list-modal.curate.test.tsx checks it. */
export const CURATE_BAR_HEIGHT = 104;

// Every control here is 48pt by its own box. A hitSlop halo is invisible to both
// platforms' accessibility, and past the floor only takes area from a neighbour.

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
                // Stacked rows: a halo would reach into the next, and the later wins.
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
    // Stacked too, and a mis-tap here adds the wrong film without a word.
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

    // The form fills when the stack first ARRIVES, not only at mount: a stack
    // not yet loaded would open an empty form whose save deletes every film.
    // Once per stack, so a later refetch never overwrites what was typed.
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

    // The films are sent only when this sheet holds ALL of them: `films: []`
    // deletes every item (the write and its offline replay alike), `undefined`
    // leaves them. The cached stack holds at most 500, with the true count
    // beside it; with no count, the store's copy (read whole) is taken as whole.
    const trueFilmCount: number | undefined =
        params.editId ? queryClient.getQueryData<any>(['stack', params.editId])?.list?.filmCount : undefined;
    const holdingsAreComplete =
        !params.editId ? true
        : !editList ? false
        : trueFilmCount === undefined ? true
        : (editList.films?.length ?? 0) >= trueFilmCount;

    /** An editId that resolves to nothing must never quietly become a create. */
    const editTargetMissing = !!params.editId && !editList;

    /** A sheet that cannot write the films does not offer to edit them (✕, grip, search). */
    const holdingsAreSealed = !!params.editId && !editTargetMissing && !holdingsAreComplete;

    // The bar names what it waits for, then the stack's mark (its count confirms an add).
    const canFile = !!title.trim() && !saving && !editTargetMissing;
    // The mode the member asked for, not what has loaded: before the stack arrives
    // (or if it never does) this is still an amendment.
    const isAmending = !!params.editId;
    const fileLabel = saving ? 'FILING…' : (isAmending ? 'SAVE THE AMENDMENTS' : 'FILE THE STACK');
    // The stack's true size, as the notice above states it, not the part held here.
    const markCount = holdingsAreSealed && typeof trueFilmCount === 'number' ? trueFilmCount : films.length;
    const reelWord = markCount === 1 ? 'REEL' : 'REELS';
    const barLine = editTargetMissing ? 'THIS STACK COULD NOT BE OPENED'
        : !title.trim() ? 'A NAME FOR YOUR THESIS'
        : [
            `${markCount} ${reelWord}`,
            isRanked ? 'RANKED' : 'UNRANKED',
            isPrivate ? 'SEALED' : 'PUBLIC',
          ].join('  ·  ');

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    // The search icon breathes while a search is out.
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

    // Adds and removals are SPOKEN (far below the fold; the live region is Android-only),
    // from a ref: an updater may run twice, and would say it twice.
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

    const removeFilm = useCallback((filmId: number) => {
        const gone = filmsRef.current.find(f => f.id === filmId);
        setFilms(prev => prev.filter(f => f.id !== filmId));
        if (gone) {
            AccessibilityInfo.announceForAccessibility(`${gone.title} removed. ${filmsRef.current.length - 1} in the stack.`);
        }
        TactileEngine.mutate();
    }, []);

    const handleSave = async () => {
        Keyboard.dismiss();
        // Before setSaving, which only the catch undoes: a return after it would
        // leave the button spinning. A silenced member may neither create nor amend.
        if (checkBan()) return;
        if (!title.trim()) {
            reelToast.error('Every stack requires a title. Name your thesis.');
            return;
        }
        // Never a create in its place: that files a second stack.
        if (editTargetMissing) {
            reelToast.error('That stack could not be opened for amendment. Go back and try again.');
            return;
        }
        setSaving(true);
        try {
            if (editList) {
                await updateList(editList.id, {
                    title: title.trim(),
                    description: description.trim(),
                    isPrivate,
                    isRanked,
                    // Omitted, never empty, when this sheet does not hold them all.
                    ...(holdingsAreComplete
                        ? { films: films.map(f => ({ id: f.id, title: f.title, poster: f.poster_path ?? null })) }
                        : {}),
                });
                queryClient.removeQueries({ queryKey: ['stack', editList.id] });
            } else {
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
                // May run after the sheet is gone, when back() would pop another screen.
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
            <View style={[s.handleWrap, { paddingTop: Math.max(insets.top + 10, 20) }]}>
                <View style={s.handle} />
            </View>

            <View style={s.header}>
                {/* The MODE, not the stack's name, which the plate below already
                    shows. Two lines, never shrink-to-fit (unreliable on Android). */}
                <View style={s.headerTitleWrap}>
                    <Text style={s.headerTitle} numberOfLines={2} {...displayTextProps}>
                        {isAmending ? 'Amend a Stack' : 'Curate a Stack'}
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
                    // Wraps, never shrinks (see the plate's style).
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
                    // Capped: 26pt uncapped passes 70 at iOS's largest text setting.
                    {...displayTextProps}
                />
            </View>

            <View style={[s.sec, { marginBottom: films.length > 0 ? 12 : 0 }]}>
                <Text style={s.label}>HOLDINGS</Text>

                {holdingsAreSealed ? (
                    // In the search field's place: the label, then what may be done here.
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

            {/* Above the films it describes, once there are two to order. */}
            {!holdingsAreSealed && films.length > 1 && (
                <Text style={s.dragLine} {...scaledTextProps}>DRAG TO ORDER  ·  THE ORDER IS KEPT EITHER WAY</Text>
            )}
        </>
    );

    const ListFooter = (
        <>
            <View style={s.sec}>
                {/* No "(OPTIONAL)": the bar never asks for a note, which says so. */}
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

            {/* THE TERMS: who may see it and whether it is numbered, one decision. */}
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

        </>
    );

    return (
        <Animated.View style={[s.container, animatedContainerStyle]}>
            <DraggableFlatList
                data={films}
                onDragBegin={() => TactileEngine.navigate()}
                onDragEnd={({ data }) => setFilms(data)}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderFilmItem}
                ListHeaderComponent={ListHeader}
                // No empty state: the search field above is its own instruction.
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

            {/* THE ACT, docked (the composer's seal is the same): never scrolled to,
                and a refusal says why. */}
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
                    // The reason is in the label: a dimmed button cannot be heard.
                    accessibilityLabel={canFile ? fileLabel : `${fileLabel}. ${barLine}`}
                >
                    <Text style={s.barPressText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{fileLabel}</Text>
                </PressableScale>
                {/* No CANCEL: the way out is CLOSE, top right, or pulling the sheet down. */}
            </View>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: { ...EDGE_LIT, flex: 1, backgroundColor: colors.soot },
    handleWrap: { alignItems: 'center', paddingBottom: 8 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.sepia },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
        paddingHorizontal: 20, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: colors.ash,
    },
    headerTitleWrap: { flex: 1, paddingRight: 12 },
    headerTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.parchment },
    closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 48, marginRight: -8 },
    closeBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.fog, includeFontPadding: false },

    sec: { paddingHorizontal: 20, marginTop: 20 },
    secTight: { paddingHorizontal: 20, marginTop: 8 },
    label: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.sepia, marginBottom: 8, includeFontPadding: false },
    input: {
        backgroundColor: colors.well, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
        padding: 12, fontFamily: fonts.body, fontSize: 14, color: colors.parchment,
    },
    /**
     * THE PLATE: the name typed in the face the catalogue sets it in, over a rule
     * rather than in a box, the caret in brass. It wraps and never shrinks:
     * adjustsFontSizeToFit is unreliable multiline on Android.
     */
    plate: {
        borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
        paddingTop: 2, paddingBottom: 10, paddingHorizontal: 0,
        fontFamily: fonts.display, fontSize: 26, lineHeight: 34, color: colors.parchment,
    },

    searchWrap: { position: 'relative' },
    searchInput: {
        backgroundColor: colors.well, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
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
    dropMeta: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, letterSpacing: 0.6, marginTop: 2, includeFontPadding: false },

    containerFlex: { flex: 1 },
    filmRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(13,11,9,0.5)', borderWidth: 1, borderColor: colors.ash,
        borderRadius: 4, padding: 8,
    },
    filmPoster: { width: 28, height: 42, borderRadius: 2 },
    filmTitle: { flex: 1, fontFamily: fonts.sub, fontSize: 13, color: colors.parchment },
    // 48pt, reaching past the row's padding: a child wins the touch over its row,
    // so a small ✕ inside would take the area grabbed to reorder.
    removeBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginVertical: -8, marginRight: -8 },
    filmRowMargin: { marginHorizontal: 20, marginBottom: 6 },
    filmRowActive: {
        backgroundColor: 'rgba(184,137,26,0.2)',
        borderColor: colors.sepia,
        // Keeps its elevation (Android paint order while dragging); casts no
        // shadow — a row this wide would draw a dark rim on the lit house.
        elevation: 5,
        ...effects.flat,
    },
    filmPosterEmpty: { backgroundColor: colors.ash },
    gripOpacity: { opacity: 0.5 },
    
    rankWrap: { width: 36, alignItems: 'center', justifyContent: 'center', marginRight: 4, marginLeft: 2 },
    rankWrapActive: { transform: [{ scale: 1.1 }] },
    rankText: { fontFamily: fonts.body, fontSize: 13, color: colors.fogQuiet, fontVariant: ['tabular-nums'], letterSpacing: 1 },
    rankTextActive: { color: colors.sepia, opacity: 1, textShadowColor: 'rgba(218,165,32,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },

    // Every stack keeps its order (rank_position): "unranked" is unnumbered, not unordered.
    dragLine: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fogQuiet, paddingHorizontal: 20, marginTop: 14, marginBottom: 8, includeFontPadding: false },
    // Brass, not red: a house rule, not an error the member made.
    lockNote: {
        padding: 12, borderRadius: 4,
        backgroundColor: 'rgba(184,137,26,0.07)', borderWidth: 1, borderColor: colors.sepiaBorder,
    },
    lockNoteText: { fontFamily: fonts.sub, fontSize: 10, lineHeight: 16.5, letterSpacing: 0.5, color: colors.bone, includeFontPadding: false },

    toggleRow: { flexDirection: 'row', gap: 8 },
    toggleBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: 48, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
    },
    toggleActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    toggleText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.1, color: colors.fog, includeFontPadding: false },
    toggleTextActive: { color: colors.ink },

    // THE ACT, docked (see CURATE_BAR_HEIGHT).
    bar: { ...EDGE_LIT,
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: colors.soot,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.sepiaBorder,
        paddingHorizontal: 20, paddingTop: 12,
    },
    barLine: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.fog, textAlign: 'center', marginBottom: 11, includeFontPadding: false },
    barPress: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
        backgroundColor: colors.sepia, borderRadius: 4, minHeight: 48,
    },
    barPressText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.ink, includeFontPadding: false },
    barDim: { opacity: 0.42 },

    searchIcon: { position: 'absolute', left: 12, top: 13, zIndex: 1 },
    dropFlex: { flex: 1 },
    descInput: { minHeight: 72 },
    // Shown only past 800 of 1000: a counter from the first letter warns of nothing.
    counter: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.6, color: colors.fog, textAlign: 'right', marginTop: 6, includeFontPadding: false },
});


DropdownResultRow.displayName = 'DropdownResultRow';

ListFilmItem.displayName = 'ListFilmItem';

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
