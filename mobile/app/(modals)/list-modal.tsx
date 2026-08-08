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
    InteractionManager,
    Keyboard,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { cancelAnimation, FadeIn, useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import TactileEngine from '@/src/utils/TactileEngine';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { ToastOverlay } from '@/src/components/ToastOverlay';
import { useBanCheck } from '@/src/hooks/useBanCheck';
import { tmdb } from '@/src/lib/tmdb';
import { useListStore } from '@/src/stores/films';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { Globe, GripVertical, List, ListOrdered, Lock, Plus, Search, X } from 'lucide-react-native';

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

// Module-scoped hitSlop constants — zero allocation on render
const HITSLOP_15 = { top: 15, bottom: 15, left: 15, right: 15 } as const;
const HITSLOP_10 = { top: 10, bottom: 10, left: 10, right: 10 } as const;
const HITSLOP_V15 = { top: 15, bottom: 15 } as const;

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

 
const ListFilmItem = React.memo(({ item, index, drag, isActive, onRemove }: { item: ListFilm, index: number | undefined, drag: () => void, isActive: boolean, onRemove: (id: number) => void }) => {
    // Cache the index during active drag so the number never flashes to a hyphen.
    const lastIndex = React.useRef<number | undefined>(index);
    if (index !== undefined) {
        lastIndex.current = index;
    }
    const displayIndex = index !== undefined ? (index + 1).toString() : (lastIndex.current !== undefined ? (lastIndex.current + 1).toString() : '-');
    
    return (
        <ScaleDecorator>
            <PressableScale
                onLongPress={drag}
                disabled={isActive}
                style={[
                    s.filmRow,
                    s.filmRowMargin,
                    isActive ? s.filmRowActive : undefined
                ]}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`Reorder ${item.title}`}
            >
                <GripVertical size={16} color={isActive ? colors.sepia : colors.fog} style={s.gripOpacity} />
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
                <PressableScale onPress={() => onRemove(item.id)} style={s.removeBtn} hitSlop={HITSLOP_15} haptic="light" accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`}>
                    <X size={14} color={colors.crimson} />
                </PressableScale>
            </PressableScale>
        </ScaleDecorator>
    );
});

 
const DropdownResultRow = React.memo(({ r, onAdd }: { r: SearchResult, onAdd: (r: SearchResult) => void }) => {
    return (
        <PressableScale style={s.dropRow} onPress={() => onAdd(r)} accessibilityRole="button" accessibilityLabel={`Add ${r.title ?? r.name}`}>
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
                withTiming(1, { duration: 600 }),
                -1,
                true
            );
        } else {
            cancelAnimation(emberOpacity);
            emberOpacity.value = withTiming(0.5, { duration: 300 });
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

    // ── Add film to list ──
    const addFilm = useCallback((f: SearchResult) => {
        setFilms(prev => {
            if (prev.some(film => film.id === f.id)) return prev;
            return [...prev, { id: f.id, title: f.title ?? f.name ?? '', poster_path: f.poster_path }];
        });
        setQuery('');
        setResults([]);
        TactileEngine.selection();
    }, []);

    // ── Remove film from list ──
    const removeFilm = useCallback((filmId: number) => {
        setFilms(prev => prev.filter(f => f.id !== filmId));
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
        setSaving(true);
        try {
            if (editList) {
                // Update existing list through store so list_items sync natively
                await updateList(editList.id, {
                    title: title.trim(),
                    description: description.trim(),
                    isPrivate,
                    isRanked,
                    films: films.map(f => ({ id: f.id, title: f.title, poster: f.poster_path ?? null })),
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
                onRemove={removeFilm} 
            />
        );
    }, [removeFilm]);

    const ListHeader = (
        <>
            {/* Drag Handle */}
            <View style={[s.handleWrap, { paddingTop: Math.max(insets.top + 10, 20) }]}>
                <View style={s.handle} />
            </View>

            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.headerLabel}>NEW STACK</Text>
                    <Text style={s.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Curate a Stack</Text>
                </View>
                <PressableScale onPress={() => { nav.back(); }} style={s.closeBtn} hitSlop={HITSLOP_15} haptic="selection" accessibilityRole="button" accessibilityLabel="Close list modal">
                    <X size={16} color={colors.fog} />
                    <Text style={s.closeBtnText}>CLOSE</Text>
                </PressableScale>
            </View>

            {/* Title */}
            <View style={s.sec}>
                <Text style={s.label}>STACK TITLE</Text>
                <TextInput
                    style={s.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="E.g. Neon Noir Masterpieces"
                    placeholderTextColor={colors.fog}
                    autoFocus
                    maxLength={100}
                    selectionColor={'rgba(218,165,32,0.3)'}
                    cursorColor={colors.sepia}
                    disableFullscreenUI={true}
                    keyboardAppearance="dark"
                    accessibilityLabel="Stack title"
                />
            </View>

            {/* Film Search & Add */}
            <View style={[s.sec, { marginBottom: films.length > 0 ? 12 : 0 }]}>
                <Text style={s.label}>ADD FILMS</Text>
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
            </View>
        </>
    );

    const ListFooter = (
        <>
            {/* Description */}
            <View style={s.sec}>
                <Text style={s.label}>DESCRIPTION (OPTIONAL)</Text>
                <TextInput
                    style={[s.input, s.descInput]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="A brief curation note..."
                    placeholderTextColor={colors.fog}
                    multiline
                    textAlignVertical="top"
                    maxLength={500}
                    selectionColor={'rgba(218,165,32,0.3)'}
                    cursorColor={colors.sepia}
                    disableFullscreenUI={true}
                    keyboardAppearance="dark"
                    accessibilityLabel="Stack description"
                />
            </View>

            {/* Privacy Toggle */}
            <View style={s.sec}>
                <Text style={s.label}>VISIBILITY</Text>
                <View style={s.toggleRow}>
                    <PressableScale
                        style={[s.toggleBtn, !isPrivate && s.toggleActive]}
                        onPress={() => { setIsPrivate(false); TactileEngine.selection(); }}
                        hitSlop={HITSLOP_10}
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
                        hitSlop={HITSLOP_10}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set stack to private"
                    >
                        <Lock size={14} color={isPrivate ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, isPrivate && s.toggleTextActive]}>PRIVATE</Text>
                    </PressableScale>
                </View>
            </View>

            {/* Ranking Toggle — available to every rank; a ranked stack is a thesis. */}
            <View style={s.sec}>
                <Text style={s.label}>FORMAT</Text>
                <View style={s.toggleRow}>
                    <PressableScale
                        style={[s.toggleBtn, !isRanked && s.toggleActive]}
                        onPress={() => { setIsRanked(false); TactileEngine.selection(); }}
                        hitSlop={HITSLOP_10}
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
                        hitSlop={HITSLOP_10}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set stack to ranked"
                    >
                        <ListOrdered size={14} color={isRanked ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, isRanked && s.toggleTextActive]}>RANKED</Text>
                    </PressableScale>
                </View>
            </View>

            {/* Submit */}
            <View style={s.submitRow}>
                <PressableScale
                    style={[s.submitBtn, (saving || !title.trim()) && s.submitDisabled]}
                    onPress={handleSave}
                    disabled={saving || !title.trim()}
                    hitSlop={HITSLOP_V15}
                    pressedScale={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={editList ? "Save changes" : "Create stack"}
                >
                    <Text style={s.submitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {saving ? 'SEALING...' : (editList ? 'SAVE CHANGES' : 'CREATE STACK')}
                    </Text>
                </PressableScale>
                <PressableScale style={s.cancelBtn} onPress={() => nav.back()} hitSlop={HITSLOP_15} haptic="light" accessibilityRole="button" accessibilityLabel="Cancel">
                    <Text style={s.cancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
                </PressableScale>
            </View>
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
                ListEmptyComponent={
                    <View style={s.emptyListWrap}>
                        <List size={24} color={colors.ash} style={{ marginBottom: 12 }} />
                        <Text style={s.emptyListText}>Search for films above to add them to your stack.</Text>
                    </View>
                }
                ListFooterComponent={ListFooter}
                contentContainerStyle={[s.scrollPad, { paddingBottom: Math.max(insets.bottom, 20) + 80 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                containerStyle={s.containerFlex}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={3}
                updateCellsBatchingPeriod={50}
            />
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
    headerLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 4, includeFontPadding: false },
    headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment },
    closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
    closeBtnText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog, includeFontPadding: false },

    sec: { paddingHorizontal: 20, marginTop: 20 },
    label: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.sepia, marginBottom: 8, includeFontPadding: false },
    input: {
        backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
        padding: 12, fontFamily: fonts.body, fontSize: 14, color: colors.parchment,
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
    removeBtn: { padding: 6 },
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
    emptyListWrap: {
        paddingVertical: 40,
        paddingHorizontal: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyListText: {
        fontFamily: fonts.sub,
        fontSize: 13,
        color: colors.fog,
        textAlign: 'center',
        lineHeight: 20,
    },

    // Privacy toggle
    toggleRow: { flexDirection: 'row', gap: 8 },
    toggleBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
    },
    toggleActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    toggleText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.5, color: colors.fog, includeFontPadding: false },
    toggleTextActive: { color: colors.ink },

    // Submit
    submitRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 28 },
    submitBtn: { flex: 1, backgroundColor: colors.sepia, paddingVertical: 14, borderRadius: 4, alignItems: 'center' },
    submitText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },
    cancelBtn: { paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    cancelText: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, includeFontPadding: false },

    // Extracted
    scrollPad: { paddingBottom: 60 },
    searchIcon: { position: 'absolute', left: 12, top: 13, zIndex: 1 },
    dropFlex: { flex: 1 },
    descInput: { minHeight: 80 },
    submitDisabled: { opacity: 0.5 },
});


DropdownResultRow.displayName = 'DropdownResultRow';

ListFilmItem.displayName = 'ListFilmItem';