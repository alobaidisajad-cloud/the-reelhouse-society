/**
 * ProgrammesSection — Double Feature Curation
 * Create and display "Nightly Programme" double-feature pairings.
 * Matches web's 150-line component.
 */
import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ScrollView, Alert } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { useFilmStore } from '@/src/stores/films';

export function ProgrammesSection({ programmes, user, uniqueFilms, isOwnProfile }: {
    programmes?: any[];
    user?: any;
    uniqueFilms?: any[];
    isOwnProfile?: boolean;
}) {
    const safeProgs = programmes || [];
    const safeFilms = uniqueFilms || [];
    const { logs } = useFilmStore();

    const [isCreating, setIsCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [playbill, setPlaybill] = useState('');
    const [film1, setFilm1] = useState<any>(null);
    const [film2, setFilm2] = useState<any>(null);
    const [searchText, setSearchText] = useState('');
    const [selectingFor, setSelectingFor] = useState<1 | 2 | null>(null);

    const isAuteur = (logs?.length || 0) >= 20 || user?.role === 'auteur' || user?.role === 'archivist';

    const filteredFilms = useMemo(() => {
        if (!searchText.trim()) return safeFilms.slice(0, 20);
        const q = searchText.toLowerCase();
        return safeFilms.filter((f: any) =>
            (f.title || f.name || '').toLowerCase().includes(q)
        ).slice(0, 20);
    }, [safeFilms, searchText]);

    const handleCreate = () => {
        if (!title.trim() || !playbill.trim() || !film1 || !film2) {
            Alert.alert('Missing Fields', 'Please fill in all fields and select both films.');
            return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Programme Published', `"${title}" has been curated.`);
        setIsCreating(false);
        setTitle(''); setPlaybill(''); setFilm1(null); setFilm2(null);
    };

    const posterUri = (path: string | null) => path ? tmdb.poster(path, 'w185') : null;

    // Not auteur and no programmes
    if (!isAuteur && isOwnProfile && safeProgs.length === 0) {
        return (
            <Animated.View entering={FadeIn.duration(400)} style={s.lockedCard}>
                <Text style={s.lockGlyph}>◈</Text>
                <Text style={s.lockTitle}>Auteur Status Required</Text>
                <Text style={s.lockBody}>
                    The Nightly Programme curation is unlocked at 20 film logs or for Archivist tier members. Keep watching to unlock the power to publish double features.
                </Text>
            </Animated.View>
        );
    }

    // Other user, no programmes
    if (!isOwnProfile && safeProgs.length === 0) {
        return (
            <View style={s.emptyWrap}>
                <Text style={s.emptyText}>This Auteur has not curated any programmes yet.</Text>
            </View>
        );
    }

    return (
        <View style={s.container}>
            {/* Create button */}
            {isOwnProfile && isAuteur && !isCreating && (
                <TouchableOpacity style={s.createBtn} onPress={() => { setIsCreating(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} activeOpacity={0.7}>
                    <Text style={s.createBtnText}>+ CURATE NIGHTLY PROGRAMME</Text>
                </TouchableOpacity>
            )}

            {/* Creation Form */}
            {isCreating && (
                <Animated.View entering={FadeInDown.duration(400)} style={s.formCard}>
                    <Text style={s.formTitle}>NEW DOUBLE FEATURE</Text>

                    <TextInput
                        style={s.input}
                        placeholder="Programme Name (e.g., 'Neon Blood & Rain')"
                        placeholderTextColor={colors.fog}
                        value={title}
                        onChangeText={setTitle}
                    />

                    <TextInput
                        style={[s.input, { height: 100, textAlignVertical: 'top' }]}
                        placeholder="The Playbill (Why these two films?)"
                        placeholderTextColor={colors.fog}
                        value={playbill}
                        onChangeText={setPlaybill}
                        multiline
                    />

                    {/* Film selectors */}
                    <View style={s.filmSelectRow}>
                        {[{ label: 'FEATURE 1 (THE PRIMER)', selected: film1, slot: 1 as const },
                          { label: 'FEATURE 2 (THE DESCENT)', selected: film2, slot: 2 as const }]
                        .map(({ label, selected, slot }) => (
                            <View key={label} style={s.filmSelectBox}>
                                <Text style={s.filmSelectLabel}>{label}</Text>
                                {selected ? (
                                    <TouchableOpacity style={s.selectedFilm} onPress={() => { setSelectingFor(slot); setSearchText(''); }}>
                                        {posterUri(selected.poster_path || selected.poster) && (
                                            <Image source={{ uri: posterUri(selected.poster_path || selected.poster)! }} style={s.selectedPoster} />
                                        )}
                                        <Text style={s.selectedTitle} numberOfLines={2}>{selected.title || selected.name}</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity style={s.filmSelectTrigger} onPress={() => { setSelectingFor(slot); setSearchText(''); }}>
                                        <Text style={s.filmSelectTriggerText}>Select from Archive...</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Film picker dropdown */}
                    {selectingFor !== null && (
                        <View style={s.pickerWrap}>
                            <TextInput
                                style={s.pickerSearch}
                                placeholder="Search your films..."
                                placeholderTextColor={colors.fog}
                                value={searchText}
                                onChangeText={setSearchText}
                                autoFocus
                            />
                            <ScrollView style={s.pickerList} nestedScrollEnabled>
                                {filteredFilms.map((f: any) => (
                                    <TouchableOpacity
                                        key={f.id || f.filmId}
                                        style={s.pickerItem}
                                        onPress={() => {
                                            if (selectingFor === 1) setFilm1(f);
                                            else setFilm2(f);
                                            setSelectingFor(null);
                                            Haptics.selectionAsync();
                                        }}
                                    >
                                        <Text style={s.pickerItemText} numberOfLines={1}>{f.title || f.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <TouchableOpacity onPress={() => setSelectingFor(null)} style={s.pickerCancel}>
                                <Text style={s.pickerCancelText}>CLOSE</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Form actions */}
                    <View style={s.formActions}>
                        <TouchableOpacity onPress={() => setIsCreating(false)} style={s.cancelBtn}>
                            <Text style={s.cancelBtnText}>CANCEL</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.publishBtn, (!title || !playbill || !film1 || !film2) && { opacity: 0.4 }]}
                            onPress={handleCreate}
                            disabled={!title || !playbill || !film1 || !film2}
                        >
                            <Text style={s.publishBtnText}>PUBLISH PROGRAMME</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            )}

            {/* Display existing programmes */}
            {safeProgs.length > 0 && !isCreating && safeProgs.map((prog: any) => (
                <Animated.View key={prog.id} entering={FadeIn.duration(400)} style={s.progCard}>
                    {/* Overlapping posters */}
                    <View style={s.progPosters}>
                        {prog.films?.[0]?.poster_path && (
                            <Image source={{ uri: posterUri(prog.films[0].poster_path)! }} style={s.progPoster1} />
                        )}
                        {prog.films?.[1]?.poster_path && (
                            <Image source={{ uri: posterUri(prog.films[1].poster_path)! }} style={s.progPoster2} />
                        )}
                    </View>
                    <View style={s.progInfo}>
                        <Text style={s.progEyebrow}>THE NIGHTLY PROGRAMME</Text>
                        <Text style={s.progTitle}>{prog.title}</Text>
                        <View style={s.progFilmsRow}>
                            <Text style={s.progFilmName}>{prog.films?.[0]?.title || 'Unknown Film'}</Text>
                            <Text style={s.progPlus}> + </Text>
                            <Text style={s.progFilmName}>{prog.films?.[1]?.title || 'Unknown Film'}</Text>
                        </View>
                        <Text style={s.progDesc} numberOfLines={4}>{prog.description}</Text>
                    </View>
                </Animated.View>
            ))}
        </View>
    );
}

const s = StyleSheet.create({
    container: { gap: 16 },
    // Create button
    createBtn: {
        paddingVertical: 16, borderWidth: 1, borderStyle: 'dashed',
        borderColor: colors.sepia, alignItems: 'center', borderRadius: 4,
    },
    createBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia },
    // Locked state
    lockedCard: {
        padding: 32, alignItems: 'center', borderWidth: 1, borderColor: colors.sepia,
        borderRadius: 4, backgroundColor: colors.soot,
    },
    lockGlyph: { fontFamily: fonts.display, fontSize: 32, color: colors.sepia, opacity: 0.5, marginBottom: 12 },
    lockTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, marginBottom: 8 },
    lockBody: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
    // Empty
    emptyWrap: { padding: 40, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center' },
    // Form
    formCard: {
        padding: 20, backgroundColor: colors.ink, borderWidth: 1,
        borderColor: colors.sepia, borderRadius: 4,
    },
    formTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia, textAlign: 'center', marginBottom: 16 },
    input: {
        backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.ash,
        color: colors.bone, fontFamily: fonts.body, fontSize: 13,
        paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, borderRadius: 4,
    },
    // Film selectors
    filmSelectRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    filmSelectBox: { flex: 1 },
    filmSelectLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog, marginBottom: 6 },
    filmSelectTrigger: {
        paddingVertical: 12, borderWidth: 1, borderColor: colors.ash,
        borderRadius: 4, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)',
    },
    filmSelectTriggerText: { fontFamily: fonts.body, fontSize: 11, color: colors.fog },
    selectedFilm: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderWidth: 1, borderColor: colors.sepia, borderRadius: 4 },
    selectedPoster: { width: 30, height: 45, borderRadius: 2, resizeMode: 'cover' },
    selectedTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.bone, flex: 1 },
    // Picker
    pickerWrap: {
        backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.sepia,
        borderRadius: 4, padding: 12, marginBottom: 12,
    },
    pickerSearch: {
        backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.ash,
        color: colors.bone, fontFamily: fonts.body, fontSize: 13,
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, marginBottom: 8,
    },
    pickerList: { maxHeight: 160 },
    pickerItem: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
    pickerItemText: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone },
    pickerCancel: { marginTop: 8, alignItems: 'center', paddingVertical: 8 },
    pickerCancelText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 2, color: colors.fog },
    // Actions
    formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
    cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
    cancelBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.fog },
    publishBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.sepia, borderRadius: 4 },
    publishBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.ink },
    // Programme cards
    progCard: {
        flexDirection: 'row', gap: 16, padding: 20,
        backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash, borderRadius: 4,
    },
    progPosters: { width: 100, position: 'relative' },
    progPoster1: {
        width: 70, height: 105, borderRadius: 4, resizeMode: 'cover',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', zIndex: 2,
    },
    progPoster2: {
        width: 70, height: 105, borderRadius: 4, resizeMode: 'cover',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        position: 'absolute', left: 20, top: 20, zIndex: 1, opacity: 0.6,
    },
    progInfo: { flex: 1 },
    progEyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 6 },
    progTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 8 },
    progFilmsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
    progFilmName: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
    progPlus: { fontFamily: fonts.sub, fontSize: 12, color: colors.fog },
    progDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, lineHeight: 20 },
});
