/**
 * ProgrammesSection — Double Feature Curation
 * Create and display "Nightly Programme" double-feature pairings.
 * Matches web's 150-line component.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import { useFilmStore } from '@/src/stores/films';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { enqueueMutation } from '@/src/utils/offlineQueue';
import { isNetworkError } from '@/src/utils/networkError';
import reelToast from '@/src/utils/reelToast';
import { isArchivistPlusTier } from '@/src/utils/tier';

interface ProgrammeFilm {
    id?: number;
    filmId?: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    poster?: string | null;
}

interface Programme {
    id: string;
    title: string;
    description: string;
    films?: { id?: number; filmId?: number; title?: string; poster_path?: string | null }[];
}

interface ProgrammeUser {
    id?: string;
    role?: string | null;
    tier?: string | null;
    is_founding?: boolean | null;
    preferences?: any;
}

 
const PickerItemRow = React.memo(({ f, selectingFor, setFilm1, setFilm2, setSelectingFor }: {
    f: ProgrammeFilm;
    selectingFor: 1 | 2 | null;
    setFilm1: (f: ProgrammeFilm) => void;
    setFilm2: (f: ProgrammeFilm) => void;
    setSelectingFor: (val: 1 | 2 | null) => void;
}) => (
    <PressableScale
        style={s.pickerItem}
        onPress={() => {
            if (selectingFor === 1) setFilm1(f);
            else setFilm2(f);
            setSelectingFor(null);
            TactileEngine.selection();
        }}
        haptic="selection"
    >
        <Text style={s.pickerItemText} numberOfLines={1}>{f.title ?? f.name}</Text>
    </PressableScale>
));

export function ProgrammesSection({ programmes, user, uniqueFilms, isOwnProfile }: {
    programmes?: Programme[];
    user?: ProgrammeUser;
    uniqueFilms?: ProgrammeFilm[];
    isOwnProfile?: boolean;
}) {
    const safeProgs = programmes ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const safeFilms = uniqueFilms ?? [];
    const { logs } = useFilmStore();
    const router = useRouter();

    const [isCreating, setIsCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [playbill, setPlaybill] = useState('');
    const [film1, setFilm1] = useState<ProgrammeFilm | null>(null);
    const [film2, setFilm2] = useState<ProgrammeFilm | null>(null);
    const [searchText, setSearchText] = useState('');
    const [selectingFor, setSelectingFor] = useState<1 | 2 | null>(null);

    const handleSearchTextChange = useCallback((text: string) => {
        setSearchText(text);
    }, [setSearchText]);

    const isAuteur = (logs?.length ?? 0) >= 20 || isArchivistPlusTier(user);

    const filteredFilms = useMemo(() => {
        if (!searchText.trim()) return safeFilms.slice(0, 20);
        const q = searchText.toLowerCase();
        return safeFilms.filter((f: ProgrammeFilm) =>
            (f.title ?? f.name ?? '').toLowerCase().includes(q)
        ).slice(0, 20);
    }, [safeFilms, searchText]);

    const handleCreate = async () => {
        if (!title.trim() || !playbill.trim() || !film1 || !film2) {
            reelToast.error('Please fill in all fields and select both films.');
            return;
        }
        TactileEngine.success();
        
        const newProgramme: Programme = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            title: title.trim(),
            description: playbill.trim(),
            films: [
                { id: film1.id ?? film1.filmId, title: film1.title ?? film1.name, poster_path: film1.poster_path ?? film1.poster },
                { id: film2.id ?? film2.filmId, title: film2.title ?? film2.name, poster_path: film2.poster_path ?? film2.poster }
            ]
        };

        // Merge onto the freshest prefs from the store, not a stale prop snapshot,
        // so a concurrent change to another key (e.g. favorites) isn't clobbered.
        const currentPrefs = useAuthStore.getState().user?.preferences ?? {};
        const currentProgrammes = currentPrefs.programmes ?? [];
        const updatedPrefs = { ...currentPrefs, programmes: [newProgramme, ...currentProgrammes] };

        // Optimistic UI update
        useAuthStore.getState().updateUser({ preferences: updatedPrefs });

        setIsCreating(false);
        setTitle(''); setPlaybill(''); setFilm1(null); setFilm2(null);

        if (!user?.id) return;

        try {
            await supabase.from('profiles').update({ preferences: updatedPrefs }).eq('id', user.id);
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                enqueueMutation({ type: 'update_profile', payload: { user_id: user.id, preferences: updatedPrefs } });
            } else {
                // Hard failure — roll the optimistic programme back out of local state.
                useAuthStore.getState().updateUser({ preferences: currentPrefs });
                if (__DEV__) console.error('[ProgrammesSection] Failed to create programme:', e);
            }
        }
    };

    const posterUri = (path: string | null | undefined) => path ? tmdb.poster(path, 'w185') : null;

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
                <PressableScale style={s.createBtn} onPress={() => { setIsCreating(true); TactileEngine.navigate(); }}>
                    <Text style={s.createBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>+ CURATE NIGHTLY PROGRAMME</Text>
                </PressableScale>
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
                        keyboardAppearance="dark"
                        accessibilityLabel="Programme name"
                        selectionColor={colors.sepia}
                    />

                    <TextInput
                        style={[s.input, { height: 100, textAlignVertical: 'top' }]}
                        placeholder="The Playbill (Why these two films?)"
                        placeholderTextColor={colors.fog}
                        value={playbill}
                        onChangeText={setPlaybill}
                        multiline
                        keyboardAppearance="dark"
                        accessibilityLabel="Programme playbill"
                        selectionColor={colors.sepia}
                    />

                    {/* Film selectors */}
                    <View style={s.filmSelectRow}>
                        {[{ label: 'FEATURE 1 (THE PRIMER)', selected: film1, slot: 1 as const },
                          { label: 'FEATURE 2 (THE DESCENT)', selected: film2, slot: 2 as const }]
                        .map(({ label, selected, slot }) => (
                            <View key={label} style={s.filmSelectBox}>
                                <Text style={s.filmSelectLabel}>{label}</Text>
                                {selected ? (
                                    <PressableScale style={s.selectedFilm} onPress={() => { TactileEngine.selection(); setSelectingFor(slot); setSearchText(''); }}>
                                        {posterUri(selected.poster_path ?? selected.poster) && (
                                            <Image source={{ uri: posterUri(selected.poster_path ?? selected.poster)! }} style={s.selectedPoster} contentFit="cover" />
                                        )}
                                        <Text style={s.selectedTitle} numberOfLines={2}>{selected.title ?? selected.name}</Text>
                                    </PressableScale>
                                ) : (
                                    <PressableScale style={s.filmSelectTrigger} onPress={() => { TactileEngine.selection(); setSelectingFor(slot); setSearchText(''); }}>
                                        <Text style={s.filmSelectTriggerText}>Select from Archive...</Text>
                                    </PressableScale>
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
                                onChangeText={handleSearchTextChange}
                                autoFocus
                                selectionColor={colors.sepia}
                                keyboardAppearance="dark"
                                accessibilityLabel="Search your logged films"
                                returnKeyType="search"
                            />
                            <View style={s.pickerList}>
                                {filteredFilms.map((f: ProgrammeFilm) => (
                                    <PickerItemRow 
                                        key={f.id || f.filmId} 
                                        f={f} 
                                        selectingFor={selectingFor} 
                                        setFilm1={setFilm1} 
                                        setFilm2={setFilm2} 
                                        setSelectingFor={setSelectingFor} 
                                    />
                                ))}
                            </View>
                            <PressableScale onPress={() => { setSelectingFor(null); }} style={s.pickerCancel} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection">
                                <Text style={s.pickerCancelText}>CLOSE</Text>
                            </PressableScale>
                        </View>
                    )}

                    {/* Form actions */}
                    <View style={s.formActions}>
                        <PressableScale onPress={() => { setIsCreating(false); }} style={s.cancelBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light">
                            <Text style={s.cancelBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>CANCEL</Text>
                        </PressableScale>
                        <PressableScale
                            style={[s.publishBtn, (!title || !playbill || !film1 || !film2) && { opacity: 0.4 }]}
                            onPress={handleCreate}
                            disabled={!title || !playbill || !film1 || !film2}
                            hitSlop={{ top: 15, bottom: 15 }}
                            pressedScale={0.97}
                        >
                            <Text style={s.publishBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>PUBLISH PROGRAMME</Text>
                        </PressableScale>
                    </View>
                </Animated.View>
            )}

            {/* Display existing programmes */}
            {safeProgs.length > 0 && !isCreating && safeProgs.map((prog: Programme) => (
                <Animated.View key={prog.id} entering={FadeIn.duration(400)} style={s.progCard}>
                    {/* Overlapping posters */}
                    <View style={s.progPosters}>
                        {prog.films?.[0]?.poster_path && (
                            <PressableScale onPress={() => {
                                const id = prog.films![0].id ?? prog.films![0].filmId;
                                if (id) router.push(`/film/${id}` as never);
                            }} style={s.progPoster1}>
                                <Image source={{ uri: posterUri(prog.films[0].poster_path)! }} style={s.progPosterImg} contentFit="cover" cachePolicy="memory-disk" />
                            </PressableScale>
                        )}
                        {prog.films?.[1]?.poster_path && (
                            <PressableScale onPress={() => {
                                const id = prog.films![1].id ?? prog.films![1].filmId;
                                if (id) router.push(`/film/${id}` as never);
                            }} style={s.progPoster2}>
                                <Image source={{ uri: posterUri(prog.films[1].poster_path)! }} style={s.progPosterImg} contentFit="cover" cachePolicy="memory-disk" />
                            </PressableScale>
                        )}
                    </View>
                    <View style={s.progInfo}>
                        <Text style={s.progEyebrow}>THE NIGHTLY PROGRAMME</Text>
                        <Text style={s.progTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{prog.title}</Text>
                        <View style={s.progFilmsRow}>
                            <Text style={[s.progFilmName, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{prog.films?.[0]?.title ?? 'Unknown Film'}</Text>
                            <Text style={s.progPlus}> + </Text>
                            <Text style={[s.progFilmName, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{prog.films?.[1]?.title ?? 'Unknown Film'}</Text>
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
    selectedPoster: { width: 30, height: 45, borderRadius: 2 },
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
    pickerList: { paddingBottom: 10 },
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
        width: 70, height: 105, borderRadius: 4,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', zIndex: 2,
    },
    progPoster2: {
        width: 70, height: 105, borderRadius: 4,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        position: 'absolute', left: 20, top: 20, zIndex: 1, opacity: 0.6,
    },
    progPosterImg: { width: '100%', height: '100%', borderRadius: 4 },
    progInfo: { flex: 1 },
    progEyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 6 },
    progTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 8 },
    progFilmsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
    progFilmName: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
    progPlus: { fontFamily: fonts.sub, fontSize: 12, color: colors.fog },
    progDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, lineHeight: 20 },
});


PickerItemRow.displayName = 'PickerItemRow';