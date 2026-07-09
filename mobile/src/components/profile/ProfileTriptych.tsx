import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, useAnimatedProps, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Plus, X } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';
 
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { enqueueMutation } from '@/src/utils/offlineQueue';
import { isArchivistPlusTier, isAuteurPlusTier } from '@/src/utils/tier';
import { isNetworkError } from '@/src/utils/networkError';
const AnimatedView = Animated.createAnimatedComponent(View);

// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

// ── Tier Slot Glow — Web's archivist-card-glow / auteur-card-glow ──
// 4s breathing border animation, shimmer top line, ✦/★ glyph
function TierSlotGlow({ tier, children }: { tier: 'archivist' | 'auteur'; children: React.ReactNode }) {
    const isArch = tier === 'archivist';
    const borderOpacity = useSharedValue(0.30);

    useEffect(() => {
        // Web: archivistCardBreathe / auteurCardBreathe — 4s ease-in-out.
        // Border-opacity only: animating shadowRadius forced expensive layer
        // re-blurs each frame; the breathing border alone carries the effect.
        borderOpacity.value = withRepeat(
            withSequence(
                withTiming(0.55, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.30, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            ),
            30, false,
        );
        return () => { cancelAnimation(borderOpacity); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        borderColor: isArch
            ? `rgba(196,150,26,${borderOpacity.value.toFixed(2)})`
            : `rgba(180,45,45,${borderOpacity.value.toFixed(2)})`,
    }));

    // Web: box-shadow values (static radius — the border does the breathing)
    const baseShadow = isArch
        ? { shadowColor: 'rgba(184,137,26,1)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 6 }
        : { shadowColor: 'rgba(180,45,45,1)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 6 };

    // Web glyph: ✦ (archivist) or ★ (auteur)
    const glyph = isArch ? '✦' : '★';
    const glyphColor = isArch ? 'rgba(218,165,32,0.85)' : 'rgba(180,45,45,0.85)';
    const glyphShadow = isArch ? 'rgba(184,137,26,0.6)' : 'rgba(125,31,31,0.6)';

    // Shimmer line colors
    const shimmerColors: [string, string, string, string, string] = isArch
        ? ['transparent', 'rgba(218,165,32,0.4)', 'rgba(242,232,160,0.7)', 'rgba(218,165,32,0.4)', 'transparent']
        : ['transparent', 'rgba(180,45,45,0.4)', 'rgba(220,80,80,0.7)', 'rgba(180,45,45,0.4)', 'transparent'];

    return (
        <AnimatedView style={[{
            flex: 1,
            borderWidth: 1,
            borderRadius: 6,
            overflow: 'visible',
            ...baseShadow,
        }, animStyle]}>
            {children}
            {/* Shimmer line across top (web ::before) */}
            <LinearGradient
                colors={shimmerColors}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.shimmerTop}
            />
            {/* Tier glyph indicator (web ::after) */}
            <View style={s.glyphWrap}>
                <Text style={[s.glyphText, {
                    color: glyphColor,
                    textShadowColor: glyphShadow,
                }]}>{glyph}</Text>
            </View>
        </AnimatedView>
    );
}

export interface TriptychFilm {
    id: number;
    title: string;
    poster_path: string;
}

interface TriptychSearchResult {
    id: number;
    title: string;
    poster_path?: string | null;
    release_date?: string;
    media_type?: string;
}

export interface TriptychUser {
    id: string;
    preferences?: {
        favorites?: TriptychFilm[];
        [key: string]: unknown;
    } | null;
}

 
const TriptychResultRow = React.memo(({ film, handleSetFilm }: { film: TriptychSearchResult, handleSetFilm: (film: TriptychSearchResult) => void }) => (
    <PressableScale 
        style={s.resultItem}
        onPress={() => handleSetFilm(film)}
        haptic
    >
        {film.poster_path ? (
            <Image source={{ uri: tmdb.poster(film.poster_path, 'w92') }} style={s.resultPoster} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
            <View style={[s.resultPoster, s.resultPosterPlaceholder]}>
                <Search size={16} color={colors.ash} />
            </View>
        )}
        <View style={s.resultInfo}>
            <Text style={s.resultTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{film.title}</Text>
            {film.release_date && <Text style={s.resultYear} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{film.release_date.slice(0, 4)}</Text>}
        </View>
    </PressableScale>
));


export function ProfileTriptych({ user, isOwnProfile, userRole }: { user: TriptychUser, isOwnProfile: boolean, userRole?: string }) {
    const { updateUser } = useAuthStore();
    const router = useRouter();
    const isArchivistPlus = isArchivistPlusTier(userRole);
    const isAuteurPlus = isAuteurPlusTier(userRole);
    
    // Handle favorites array regardless of data source format (it might come back raw)
    const rawFavorites = user?.preferences?.favorites;
    const safeFavorites = Array.isArray(rawFavorites) ? rawFavorites : [];
    
    // Safely transform strings to objects if needed (prevent Zod mismatch crash)
    const validFavorites = safeFavorites.map(f => {
        if (typeof f === 'string') return { id: -1, title: f, poster_path: '' } as TriptychFilm;
        if (f && typeof f === 'object') return { id: f.id || -1, title: f.title || '', poster_path: f.poster_path || '' } as TriptychFilm;
        return null;
    }).filter(Boolean) as TriptychFilm[];
    const slots: (TriptychFilm | null)[] = [validFavorites[0] ?? null, validFavorites[1] ?? null, validFavorites[2] ?? null];
    const insets = useSafeAreaInsets();

    const [isEditing, setIsEditing] = useState(false);
    const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<TriptychSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Nitrate Noir Breathing Ember Protocol for Search Modal
    const searchEmberOpacity = useSharedValue(0.5);
    useEffect(() => {
        if (isSearching) {
            searchEmberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
        } else {
            searchEmberOpacity.value = withTiming(0.5, { duration: 300 });
        }
        return () => cancelAnimation(searchEmberOpacity);
    }, [isSearching, searchEmberOpacity]);

    const animatedSearchProps = useAnimatedProps(() => ({
        color: isSearching ? colors.bloodReel : colors.sepia,
    }));
    const animatedSearchStyle = useAnimatedStyle(() => ({
        opacity: searchEmberOpacity.value,
    }));

    const handleSearchQueryChange = React.useCallback((text: string) => {
        setSearchQuery(text);
    }, [setSearchQuery]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        if (searchRef.current) clearTimeout(searchRef.current);
        
        let cancelled = false;

        searchRef.current = setTimeout(async () => {
            try {
                const data = await tmdb.search(searchQuery);
                if (cancelled) return;
                const movies = ((data as any)?.results ?? []).filter((r: TriptychSearchResult) => r.media_type === 'movie' && r.poster_path);
                setSearchResults(movies.slice(0, 10));
            } catch (err: unknown) {
                if (__DEV__) console.error('[ProfileTriptych] Search timeout/error:', err);
            } finally {
                if (!cancelled) setIsSearching(false);
            }
        }, 400);

        return () => {
            cancelled = true;
            if (searchRef.current) clearTimeout(searchRef.current);
        };
    }, [searchQuery]);

    const handleSelectSlot = (index: number) => {
        if (!isOwnProfile) return;
        TactileEngine.navigate();
        setEditingSlotIndex(index);
        setIsEditing(true);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleSetFilm = async (film: TriptychSearchResult) => {
        if (editingSlotIndex === null) return;
        TactileEngine.success();
        
        const newFavs = [...slots];
        newFavs[editingSlotIndex] = { id: film.id, title: film.title, poster_path: film.poster_path ?? '' };

        // Merge onto the freshest prefs from the store, not a stale prop snapshot,
        // so a concurrent change to another key (e.g. programmes) isn't clobbered.
        const currentPrefs = useAuthStore.getState().user?.preferences ?? {};
        const updatedPrefs = { ...currentPrefs, favorites: newFavs };

        updateUser({ preferences: updatedPrefs });
        setIsEditing(false);

        try {
            // Send only the changed key; the server merges it (COMP-7 cross-device).
            const { error } = await supabase.rpc('update_my_preferences', { p_preferences: { favorites: newFavs } });
            if (error) throw error;
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                enqueueMutation({ type: 'update_profile', payload: { user_id: user.id, preferences: updatedPrefs } });
            } else {
                updateUser({ preferences: currentPrefs });
                if (__DEV__) console.error('[ProfileTriptych] Failed to set film:', e);
            }
        }
    };

    const handleClearSlot = async (index: number) => {
        TactileEngine.rigid();
        const newFavs = [...slots];
        newFavs[index] = null;

        const currentPrefs = useAuthStore.getState().user?.preferences ?? {};
        const updatedPrefs = { ...currentPrefs, favorites: newFavs };

        updateUser({ preferences: updatedPrefs });

        try {
            // Send only the changed key; the server merges it (COMP-7 cross-device).
            const { error } = await supabase.rpc('update_my_preferences', { p_preferences: { favorites: newFavs } });
            if (error) throw error;
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                enqueueMutation({ type: 'update_profile', payload: { user_id: user.id, preferences: updatedPrefs } });
            } else {
                updateUser({ preferences: currentPrefs });
                if (__DEV__) console.error('[ProfileTriptych] Failed to clear slot:', e);
            }
        }
    };

    const hasFavorites = slots.some(s => s !== null);

    if (!hasFavorites && !isOwnProfile) {
        return null; // Hide entirely for other users if empty
    }

    return (
        <View style={s.container}>
            <View style={s.grid}>
                {slots.map((film, i) => {
                    const slotContent = (
                        <PressableScale 
                            key={i}
                            style={[
                                s.slot,
                                film ? s.slotFilled : s.slotEmpty,
                                // Only apply static border for non-tiered users
                                film && !isArchivistPlus && s.slotFilled,
                                // Remove border when TierSlotGlow handles it
                                film && isArchivistPlus && s.slotNoBorder,
                            ]}
                            onPress={() => {
                                if (film && !isOwnProfile && film.id && film.id !== -1) {
                                    (router.push as any)(`/film/${film.id}` as never);
                                } else if (isOwnProfile) {
                                    handleSelectSlot(i);
                                }
                            }}
                            disabled={!film && !isOwnProfile}
                            haptic
                        >
                            {film ? (
                                <>
                                    <Image 
                                        source={{ uri: tmdb.poster(film.poster_path, 'w342') }} 
                                        style={s.poster}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
                                    {isOwnProfile && (
                                        <PressableScale style={s.clearBtn} onPress={() => handleClearSlot(i)} haptic="medium" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                            <X size={16} color={colors.parchment} />
                                        </PressableScale>
                                    )}
                                </>
                            ) : (
                                isOwnProfile && <Plus size={24} color={colors.sepia} style={{ opacity: 0.5 }} />
                            )}
                        </PressableScale>
                    );

                    // Wrap filled slots in TierSlotGlow for archivist/auteur
                    if (film && isAuteurPlus) {
                        return <TierSlotGlow key={i} tier="auteur">{slotContent}</TierSlotGlow>;
                    }
                    if (film && isArchivistPlus) {
                        return <TierSlotGlow key={i} tier="archivist">{slotContent}</TierSlotGlow>;
                    }
                    return <View key={i} style={s.slotFlexWrap}>{slotContent}</View>;
                })}
            </View>

            {/* Selection Modal */}
            <Modal visible={isEditing} transparent animationType="slide">
                <View style={[s.modalOverlay, { paddingBottom: insets.bottom }]}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => { TactileEngine.selection(); setIsEditing(false); }} />
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalEyebrow}>CURATE DOSSIER SLOT {editingSlotIndex !== null ? editingSlotIndex + 1 : ''}</Text>
                            <View style={s.searchWrap}>
                                <AnimatedSearchIcon size={18} animatedProps={animatedSearchProps} style={[s.searchIcon, animatedSearchStyle]} />
                                <TextInput 
                                    autoFocus
                                    placeholder="Search cinematic archives..."
                                    placeholderTextColor={colors.fog}
                                    value={searchQuery}
                                    onChangeText={handleSearchQueryChange}
                                    style={s.searchInput}
                                    selectionColor={colors.sepia}
                                    keyboardAppearance="dark"
                                    accessibilityLabel="Search films for triptych slot"
                                    returnKeyType="search"
                                />
                            </View>
                        </View>

                        <ScrollView style={s.modalScroll} keyboardShouldPersistTaps="handled">
                            {isSearching ? (
                                <ActivityIndicator size="large" color={colors.sepia} style={{ marginTop: 40 }} />
                            ) : searchResults.length > 0 ? (
                                searchResults.map(film => (
                                    <TriptychResultRow key={film.id} film={film} handleSetFilm={handleSetFilm} />
                                ))
                            ) : searchQuery ? (
                                <Text style={s.noResults}>NO MATCHES FOUND</Text>
                            ) : null}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, marginBottom: 20 },
    grid: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    slot: {
        flex: 1,
        aspectRatio: 2/3,
        borderRadius: 6, // Web: borderRadius: '6px'
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    slotEmpty: {
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.3)',
        borderStyle: 'dashed',
        backgroundColor: 'transparent'
    },
    slotFilled: {
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.5)',
        backgroundColor: colors.ink,
        // Web: boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.1)'
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 6,
    },
    poster: {
        width: '100%',
        height: '100%',
    },
    clearBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(8,6,4,0.95)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        height: '85%',
        backgroundColor: colors.ink,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.2)',
    },
    modalHeader: {
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(184,137,26,0.1)',
    },
    modalEyebrow: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 3,
        color: colors.sepia,
        textAlign: 'center',
        marginBottom: 16,
    },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(10,5,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.15)',
        borderRadius: 8,
        paddingHorizontal: 16,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        height: 50,
        fontFamily: fonts.display,
        fontSize: 18,
        color: colors.parchment,
    },
    modalScroll: {
        flex: 1,
        padding: 16,
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'rgba(20,15,10,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.1)',
        borderRadius: 8,
        marginBottom: 8,
    },
    resultPoster: {
        width: 40,
        height: 60,
        borderRadius: 4,
        marginRight: 16,
    },
    resultInfo: {
        flex: 1,
    },
    resultTitle: {
        fontFamily: fonts.display,
        fontSize: 16,
        color: colors.parchment,
        marginBottom: 4,
    },
    resultYear: {
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.sepia,
    },
    noResults: {
        textAlign: 'center',
        paddingTop: 40,
        fontFamily: fonts.sub,
        fontSize: 12,
        color: colors.fog,
        letterSpacing: 2,
    },
    // ── Extracted from inline ──
    shimmerTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: 6, zIndex: 4 },
    glyphWrap: { position: 'absolute', top: 6, left: 8, zIndex: 5 },
    glyphText: { fontSize: 9, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
    slotNoBorder: { borderWidth: 0 },
    slotFlexWrap: { flex: 1 },
    resultPosterPlaceholder: { backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
});


TriptychResultRow.displayName = 'TriptychResultRow';
