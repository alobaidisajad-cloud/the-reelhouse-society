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
import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform
} from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { Search, X, Globe, Lock, Plus, GripVertical } from 'lucide-react-native';

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

export default function ListModal() {
    const router = useRouter();
    const params = useLocalSearchParams<{ editId?: string }>();
    const { user } = useAuthStore();
    const { lists, fetchLists, createList } = useFilmStore();

    // Edit mode
    const editList = params.editId ? lists.find(l => l.id === params.editId) : null;

    const [title, setTitle] = useState(editList?.title || '');
    const [description, setDescription] = useState(editList?.description || '');
    const [isPrivate, setIsPrivate] = useState(editList?.isPrivate || false);
    const [films, setFilms] = useState<ListFilm[]>(editList?.films as ListFilm[] || []);
    const [saving, setSaving] = useState(false);

    // Search state
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                    .filter((r) => r.media_type !== 'person')
                    .filter((r) => !films.some(f => f.id === r.id))
                    .slice(0, 6) as SearchResult[];
                setResults(filtered);
            } catch { setResults([]); }
            finally { setSearching(false); }
        }, 400);
    }, [films]);

    // ── Add film to list ──
    const addFilm = (f: SearchResult) => {
        setFilms(prev => [...prev, { id: f.id, title: f.title ?? f.name, poster_path: f.poster_path }]);
        setQuery('');
        setResults([]);
        Haptics.selectionAsync();
    };

    // ── Remove film from list ──
    const removeFilm = (filmId: number) => {
        setFilms(prev => prev.filter(f => f.id !== filmId));
        Haptics.selectionAsync();
    };

    // ── Save handler ──
    const handleSave = async () => {
        if (!title.trim()) {
            reelToast('Every stack requires a title. Name your thesis.');
            return;
        }
        setSaving(true);
        try {
            if (editList) {
                // Update existing list
                await supabase.from('lists').update({
                    title: title.trim(),
                    description: description.trim(),
                    is_private: isPrivate,
                }).eq('id', editList.id);
            } else {
                // Create new list
                await createList({
                    title: title.trim(),
                    description: description.trim(),
                    isPrivate,
                    films,
                });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            fetchLists();
            router.back();
        } catch (err: unknown) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            const msg = err instanceof Error ? err.message : 'The stack could not be archived.';
            reelToast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const renderFilmItem = ({ item, drag, isActive }: RenderItemParams<ListFilm>) => {
        return (
            <ScaleDecorator>
                <TouchableOpacity
                    activeOpacity={1}
                    onLongPress={drag}
                    disabled={isActive}
                    style={[
                        s.filmRow,
                        { marginHorizontal: 20, marginBottom: 6 },
                        isActive ? { backgroundColor: 'rgba(139,105,20,0.2)', borderColor: colors.sepia, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10 } : {}
                    ]}
                >
                    <GripVertical size={16} color={isActive ? colors.sepia : colors.fog} style={{ opacity: 0.5 }} />
                    {item.poster_path && <Image source={{ uri: tmdb.poster(item.poster_path, 'w92') }} style={s.filmPoster} />}
                    <Text style={s.filmTitle} numberOfLines={1}>{item.title}</Text>
                    <TouchableOpacity onPress={() => removeFilm(item.id)} style={s.removeBtn}>
                        <X size={14} color={colors.danger} />
                    </TouchableOpacity>
                </TouchableOpacity>
            </ScaleDecorator>
        );
    };

    const ListHeader = (
        <>
            {/* Drag Handle */}
            <View style={s.handleWrap}>
                <View style={s.handle} />
            </View>

            {/* Header */}
            <View style={s.header}>
                <View>
                    <Text style={s.headerLabel}>NEW STACK</Text>
                    <Text style={s.headerTitle}>Curate a Stack</Text>
                </View>
                <TouchableOpacity onPress={() => router.back()} style={s.closeBtn} activeOpacity={0.7}>
                    <X size={16} color={colors.fog} />
                    <Text style={s.closeBtnText}>CLOSE</Text>
                </TouchableOpacity>
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
                />
            </View>

            {/* Film Search & Add */}
            <View style={[s.sec, { marginBottom: films.length > 0 ? 12 : 0 }]}>
                <Text style={s.label}>ADD FILMS</Text>
                <View style={s.searchWrap}>
                    <Search size={14} color={colors.fog} style={s.searchIcon} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Search films to add..."
                        placeholderTextColor={colors.fog}
                        value={query}
                        onChangeText={handleSearch}
                        returnKeyType="search"
                    />
                </View>

                {/* Search results dropdown */}
                {results.length > 0 && (
                    <Animated.View entering={FadeIn.duration(150)} style={s.dropdown}>
                        {results.map(r => (
                            <TouchableOpacity key={r.id} style={s.dropRow} onPress={() => addFilm(r)} activeOpacity={0.7}>
                                {r.poster_path && <Image source={{ uri: tmdb.poster(r.poster_path, 'w92') }} style={s.dropPoster} cachePolicy="memory-disk" />}
                                <View style={s.dropFlex}>
                                    <Text style={s.dropTitle} numberOfLines={1}>{r.title ?? r.name}</Text>
                                    <Text style={s.dropMeta}>{r.release_date?.slice(0, 4) ?? '—'}</Text>
                                </View>
                                <Plus size={16} color={colors.sepia} />
                            </TouchableOpacity>
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
                />
            </View>

            {/* Privacy Toggle */}
            <View style={s.sec}>
                <Text style={s.label}>VISIBILITY</Text>
                <View style={s.toggleRow}>
                    <TouchableOpacity
                        style={[s.toggleBtn, !isPrivate && s.toggleActive]}
                        onPress={() => { setIsPrivate(false); Haptics.selectionAsync(); }}
                        activeOpacity={0.7}
                    >
                        <Globe size={14} color={!isPrivate ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, !isPrivate && s.toggleTextActive]}>PUBLIC</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.toggleBtn, isPrivate && s.toggleActive]}
                        onPress={() => { setIsPrivate(true); Haptics.selectionAsync(); }}
                        activeOpacity={0.7}
                    >
                        <Lock size={14} color={isPrivate ? colors.ink : colors.fog} />
                        <Text style={[s.toggleText, isPrivate && s.toggleTextActive]}>PRIVATE</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Submit */}
            <View style={s.submitRow}>
                <TouchableOpacity
                    style={[s.submitBtn, (saving || !title.trim()) && s.submitDisabled]}
                    onPress={handleSave}
                    disabled={saving || !title.trim()}
                    activeOpacity={0.8}
                >
                    <Text style={s.submitText}>
                        {saving ? 'SAVING...' : (editList ? 'SAVE CHANGES' : 'CREATE LIST')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
                    <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
            <DraggableFlatList
                data={films}
                onDragBegin={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                onDragEnd={({ data }) => setFilms(data)}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderFilmItem}
                ListHeaderComponent={ListHeader}
                ListFooterComponent={ListFooter}
                contentContainerStyle={s.scrollPad}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                containerStyle={{flex: 1}}
            />
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.soot },
    handleWrap: { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 8 },
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
