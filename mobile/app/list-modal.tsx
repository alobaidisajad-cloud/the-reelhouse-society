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
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, InteractionManager
} from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Image } from 'expo-image';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, useAnimatedProps, useAnimatedKeyboard } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFilmStore } from '@/src/stores/films';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { Search, X, Globe, Lock, Plus, GripVertical, List, ListOrdered } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';
import { ToastOverlay } from '@/src/components/ToastOverlay';

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

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

 
const ListFilmItem = React.memo(({ item, drag, isActive, onRemove }: { item: ListFilm, drag: () => void, isActive: boolean, onRemove: (id: number) => void }) => {
    return (
        <ScaleDecorator>
            <PressableScale
                onLongPress={drag}
                disabled={isActive}
                style={[
                    s.filmRow,
                    { marginHorizontal: 20, marginBottom: 6 },
                    isActive ? { backgroundColor: 'rgba(139,105,20,0.2)', borderColor: colors.sepia, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10 } : {}
                ]}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`Reorder ${item.title}`}
            >
                <GripVertical size={16} color={isActive ? colors.sepia : colors.fog} style={{ opacity: 0.5 }} />
                {item.poster_path ? (
                    <Image source={{ uri: tmdb.poster(item.poster_path, 'w92') }} style={s.filmPoster} />
                ) : (
                    <View style={[s.filmPoster, { backgroundColor: colors.ash }]} />
                )}
                <Text style={s.filmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{item.title}</Text>
                <PressableScale onPress={() => onRemove(item.id)} style={s.removeBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light" accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`}>
                    <X size={14} color={colors.danger} />
                </PressableScale>
            </PressableScale>
        </ScaleDecorator>
    );
});

 
const DropdownResultRow = React.memo(({ r, onAdd }: { r: SearchResult, onAdd: (r: SearchResult) => void }) => {
    return (
        <PressableScale style={s.dropRow} onPress={() => onAdd(r)} accessibilityRole="button" accessibilityLabel={`Add ${r.title ?? r.name}`}>
            {r.poster_path && <Image source={{ uri: tmdb.poster(r.poster_path, 'w92') }} style={s.dropPoster} cachePolicy="memory-disk" />}
            <View style={s.dropFlex}>
                <Text style={s.dropTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{r.title ?? r.name}</Text>
                <Text style={s.dropMeta}>{r.release_date?.slice(0, 4) ?? '—'}</Text>
            </View>
            <Plus size={16} color={colors.sepia} />
        </PressableScale>
    );
});

export default function ListModal() {
    const router = useRouter();
    const params = useLocalSearchParams<{ editId?: string }>();
    const lists = useFilmStore(s => s.lists);
    const fetchLists = useFilmStore(s => s.fetchLists);
    const createList = useFilmStore(s => s.createList);
    const updateList = useFilmStore(s => s.updateList);
    const insets = useSafeAreaInsets();
    
    const keyboard = useAnimatedKeyboard();
    const animatedContainerStyle = useAnimatedStyle(() => ({
        paddingBottom: keyboard.height.value,
    }));

    // Edit mode
    const editList = params.editId ? lists.find(l => l.id === params.editId) : null;

    const [title, setTitle] = useState(editList?.title || '');
    const [description, setDescription] = useState(editList?.description || '');
    const [isPrivate, setIsPrivate] = useState(editList?.isPrivate || false);
    const [isRanked, setIsRanked] = useState(editList?.isRanked || false);
    const [films, setFilms] = useState<ListFilm[]>(
        editList?.films?.map((f: any) => ({ id: f.id, title: f.title ?? '', poster_path: f.poster_path ?? f.poster ?? null })) ?? []
    );
    const [saving, setSaving] = useState(false);

    // Search state
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Nitrate Noir Breathing Ember Protocol
    const emberOpacity = useSharedValue(0.5);
    useEffect(() => {
        if (searching) {
            emberOpacity.value = withTiming(1, { duration: 600 });
        } else {
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
    const handleSearch = useCallback((q: string) => {
        setQuery(q);
        if (!q.trim()) { setResults([]); setSearching(false); return; }
        setSearching(true);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await tmdb.search(q, 1);
                const filtered = (res.results || [])
                    .filter((r: any) => r.media_type !== 'person')
                    .filter((r: any) => !films.some(f => f.id === r.id))
                    .slice(0, 6) as SearchResult[];
                setResults(filtered);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (err: unknown) { setResults([]); }
            finally { setSearching(false); }
        }, 400);
    }, [films]);
    
    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (searchTimeout.current) clearTimeout(searchTimeout.current);
        };
    }, []);

    // ── Add film to list ──
    const addFilm = useCallback((f: SearchResult) => {
        setFilms(prev => [...prev, { id: f.id, title: f.title ?? f.name ?? '', poster_path: f.poster_path }]);
        setQuery('');
        setResults([]);
        Haptics.selectionAsync();
    }, []);

    // ── Remove film from list ──
    const removeFilm = useCallback((filmId: number) => {
        setFilms(prev => prev.filter(f => f.id !== filmId));
        Haptics.selectionAsync();
    }, []);

    // ── Save handler ──
    const handleSave = async () => {
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
                    films,
                });
            } else {
                // Create new list
                await createList({
                    title: title.trim(),
                    description: description.trim(),
                    isPrivate,
                    isRanked,
                    films,
                });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            fetchLists();
            InteractionManager.runAfterInteractions(() => {
                router.back();
            });
        } catch (err: unknown) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            const msg = err instanceof Error ? err.message : 'The stack could not be archived.';
            reelToast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const renderFilmItem = useCallback(({ item, drag, isActive }: RenderItemParams<ListFilm>) => {
        return (
            <ListFilmItem 
                item={item} 
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
                <PressableScale onPress={() => { router.back(); }} style={s.closeBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" accessibilityRole="button" accessibilityLabel="Close list modal">
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
                        onPress={() => { setIsPrivate(false); Haptics.selectionAsync(); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set list to public"
                    >
                        <Globe size={14} color={!isPrivate ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, !isPrivate && s.toggleTextActive]}>PUBLIC</Text>
                    </PressableScale>
                    <PressableScale
                        style={[s.toggleBtn, isPrivate && s.toggleActive]}
                        onPress={() => { setIsPrivate(true); Haptics.selectionAsync(); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set list to private"
                    >
                        <Lock size={14} color={isPrivate ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, isPrivate && s.toggleTextActive]}>PRIVATE</Text>
                    </PressableScale>
                </View>
            </View>

            {/* Ranking Toggle (Auteur Only) */}
            <View style={s.sec}>
                <Text style={s.label}>FORMAT</Text>
                <View style={s.toggleRow}>
                    <PressableScale
                        style={[s.toggleBtn, !isRanked && s.toggleActive]}
                        onPress={() => { setIsRanked(false); Haptics.selectionAsync(); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set list to unranked"
                    >
                        <List size={14} color={!isRanked ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, !isRanked && s.toggleTextActive]}>UNRANKED</Text>
                    </PressableScale>
                    <PressableScale
                        style={[s.toggleBtn, isRanked && s.toggleActive]}
                        onPress={() => { 
                            setIsRanked(true); 
                            Haptics.selectionAsync(); 
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityLabel="Set list to ranked"
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
                    hitSlop={{ top: 15, bottom: 15 }}
                    pressedScale={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={editList ? "Save changes" : "Create list"}
                >
                    <Text style={s.submitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {saving ? 'SAVING...' : (editList ? 'SAVE CHANGES' : 'CREATE LIST')}
                    </Text>
                </PressableScale>
                <PressableScale style={s.cancelBtn} onPress={() => router.back()} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" accessibilityRole="button" accessibilityLabel="Cancel">
                    <Text style={s.cancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
                </PressableScale>
            </View>
        </>
    );

    return (
        <Animated.View style={[s.container, animatedContainerStyle]}>
            <ToastOverlay />
            <DraggableFlatList
                data={films}
                onDragBegin={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                onDragEnd={({ data }) => setFilms(data)}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderFilmItem}
                ListHeaderComponent={ListHeader}
                ListFooterComponent={ListFooter}
                contentContainerStyle={[s.scrollPad, { paddingBottom: Math.max(insets.bottom, 20) + 80 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                containerStyle={{flex: 1}}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={3}
                removeClippedSubviews={true}
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
    headerLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 3, color: colors.sepia, marginBottom: 4 },
    headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment },
    closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
    closeBtnText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog },

    sec: { paddingHorizontal: 20, marginTop: 20 },
    label: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 8 },
    input: {
        backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
        padding: 12, fontFamily: fonts.sub, fontSize: 14, color: colors.parchment,
    },

    // Search
    searchWrap: { position: 'relative' },
    searchInput: {
        backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
        paddingLeft: 36, paddingRight: 12, paddingVertical: 10,
        fontFamily: fonts.sub, fontSize: 13, color: colors.parchment,
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
    dropMeta: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1, marginTop: 2 },

    // Film list
    filmsList: { marginTop: 12, gap: 6 },
    filmRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: colors.ash,
        borderRadius: 4, padding: 8,
    },
    filmPoster: { width: 28, height: 42, borderRadius: 2 },
    filmTitle: { flex: 1, fontFamily: fonts.sub, fontSize: 13, color: colors.parchment },
    removeBtn: { padding: 6 },

    // Privacy toggle
    toggleRow: { flexDirection: 'row', gap: 8 },
    toggleBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
    },
    toggleActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    toggleText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
    toggleTextActive: { color: colors.ink },

    // Submit
    submitRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 28 },
    submitBtn: { flex: 1, backgroundColor: colors.sepia, paddingVertical: 14, borderRadius: 4, alignItems: 'center' },
    submitText: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 2, color: colors.ink, fontWeight: '600' },
    cancelBtn: { paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    cancelText: { fontFamily: fonts.ui, fontSize: 11, color: colors.fog },

    // Extracted
    scrollPad: { paddingBottom: 60 },
    searchIcon: { position: 'absolute', left: 12, top: 13, zIndex: 1 },
    dropFlex: { flex: 1 },
    descInput: { minHeight: 80 },
    submitDisabled: { opacity: 0.5 },
});


DropdownResultRow.displayName = 'DropdownResultRow';

ListFilmItem.displayName = 'ListFilmItem';