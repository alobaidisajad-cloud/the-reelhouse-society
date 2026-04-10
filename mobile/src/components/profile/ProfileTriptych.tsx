import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, TextInput, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import Animated, { FadeInUp, FadeInDown, Layout, ZoomIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Plus, X } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import * as Haptics from 'expo-haptics';

const AnimatedView = Animated.createAnimatedComponent(View);

// ── Tier Slot Glow — Web's archivist-card-glow / auteur-card-glow ──
// 4s breathing border animation, shimmer top line, ✦/★ glyph
function TierSlotGlow({ tier, children }: { tier: 'archivist' | 'auteur'; children: React.ReactNode }) {
    const isArch = tier === 'archivist';
    const borderOpacity = useSharedValue(0.30);
    const shadowRadius = useSharedValue(15);

    useEffect(() => {
        // Web: archivistCardBreathe / auteurCardBreathe — 4s ease-in-out infinite
        borderOpacity.value = withRepeat(
            withSequence(
                withTiming(0.55, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.30, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            ),
            -1, false,
        );
        shadowRadius.value = withRepeat(
            withSequence(
                withTiming(30, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(15, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            ),
            -1, false,
        );
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        borderColor: isArch
            ? `rgba(196,150,26,${borderOpacity.value.toFixed(2)})`
            : `rgba(125,31,31,${borderOpacity.value.toFixed(2)})`,
        shadowRadius: shadowRadius.value,
    }));

    // Web: box-shadow values
    const baseShadow = isArch
        ? { shadowColor: 'rgba(139,105,20,1)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, elevation: 6 }
        : { shadowColor: 'rgba(125,31,31,1)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, elevation: 6 };

    // Web glyph: ✦ (archivist) or ★ (auteur)
    const glyph = isArch ? '✦' : '★';
    const glyphColor = isArch ? 'rgba(218,165,32,0.85)' : 'rgba(180,45,45,0.85)';
    const glyphShadow = isArch ? 'rgba(139,105,20,0.6)' : 'rgba(125,31,31,0.6)';

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
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: 6, zIndex: 4 }}
            />
            {/* Tier glyph indicator (web ::after) */}
            <View style={{ position: 'absolute', top: 5, right: 6, zIndex: 5 }}>
                <Text style={{
                    fontSize: 9, color: glyphColor,
                    textShadowColor: glyphShadow,
                    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
                }}>{glyph}</Text>
            </View>
        </AnimatedView>
    );
}

interface TriptychFilm {
    id: number;
    title: string;
    poster_path: string;
}

const { width: SCREEN_W } = Dimensions.get('window');

export function ProfileTriptych({ user, isOwnProfile, userRole }: { user: any, isOwnProfile: boolean, userRole?: string }) {
    const { updateUser } = useAuthStore();
    const isArchivist = userRole === 'archivist';
    const isAuteur = userRole === 'auteur';
    
    const favorites = (user?.preferences?.favorites as TriptychFilm[]) || [];
    const slots: Array<TriptychFilm | null> = [favorites[0] || null, favorites[1] || null, favorites[2] || null];

    const [isEditing, setIsEditing] = useState(false);
    const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        if (searchRef.current) clearTimeout(searchRef.current);
        searchRef.current = setTimeout(async () => {
            try {
                const data = await tmdb.search(searchQuery);
                const movies = (data?.results || []).filter((r: any) => r.media_type === 'movie' && r.poster_path);
                setSearchResults(movies.slice(0, 10));
            } catch (err) {
            } finally {
                setIsSearching(false);
            }
        }, 400);
    }, [searchQuery]);

    useEffect(() => {
        return () => {
            if (searchRef.current) clearTimeout(searchRef.current);
        };
    }, []);

    const handleSelectSlot = (index: number) => {
        if (!isOwnProfile) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEditingSlotIndex(index);
        setIsEditing(true);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleSetFilm = async (film: any) => {
        if (editingSlotIndex === null) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        const newFavs = [...slots];
        newFavs[editingSlotIndex] = { id: film.id, title: film.title, poster_path: film.poster_path };
        
        const currentPrefs = user?.preferences || {};
        const updatedPrefs = { ...currentPrefs, favorites: newFavs };
        
        updateUser({ preferences: updatedPrefs });
        setIsEditing(false);

        try {
            await supabase.from('profiles').update({ preferences: updatedPrefs }).eq('id', user.id);
        } catch (error: any) {
        }
    };

    const handleClearSlot = async (index: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        const newFavs = [...slots];
        newFavs[index] = null;
        
        const currentPrefs = user?.preferences || {};
        const updatedPrefs = { ...currentPrefs, favorites: newFavs };
        
        updateUser({ preferences: updatedPrefs });

        try {
            await supabase.from('profiles').update({ preferences: updatedPrefs }).eq('id', user.id);
        } catch (error: any) {
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
                        <TouchableOpacity 
                            key={i}
                            style={[
                                s.slot,
                                film ? s.slotFilled : s.slotEmpty,
                                // Only apply static border for non-tiered users
                                film && !isArchivist && !isAuteur && s.slotFilled,
                                // Remove border when TierSlotGlow handles it
                                film && (isArchivist || isAuteur) && { borderWidth: 0 },
                            ]}
                            activeOpacity={isOwnProfile ? 0.7 : 1}
                            onPress={() => handleSelectSlot(i)}
                        >
                            {film ? (
                                <>
                                    <Image 
                                        source={{ uri: tmdb.poster(film.poster_path, 'w342') }} 
                                        style={s.poster} 
                                    />
                                    {isOwnProfile && (
                                        <TouchableOpacity style={s.clearBtn} onPress={() => handleClearSlot(i)}>
                                            <X size={16} color={colors.parchment} />
                                        </TouchableOpacity>
                                    )}
                                </>
                            ) : (
                                isOwnProfile && <Plus size={24} color={colors.sepia} style={{ opacity: 0.5 }} />
                            )}
                        </TouchableOpacity>
                    );

                    // Wrap filled slots in TierSlotGlow for archivist/auteur
                    if (film && isArchivist) {
                        return <TierSlotGlow key={i} tier="archivist">{slotContent}</TierSlotGlow>;
                    }
                    if (film && isAuteur) {
                        return <TierSlotGlow key={i} tier="auteur">{slotContent}</TierSlotGlow>;
                    }
                    return <View key={i} style={{ flex: 1 }}>{slotContent}</View>;
                })}
            </View>

            {/* Selection Modal */}
            <Modal visible={isEditing} transparent animationType="slide">
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setIsEditing(false)} />
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalEyebrow}>CURATE DOSSIER SLOT {editingSlotIndex !== null ? editingSlotIndex + 1 : ''}</Text>
                            <View style={s.searchWrap}>
                                <Search size={18} color={colors.sepia} style={s.searchIcon} />
                                <TextInput 
                                    autoFocus
                                    placeholder="Search cinematic archives..."
                                    placeholderTextColor={colors.fog}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    style={s.searchInput}
                                />
                            </View>
                        </View>

                        <ScrollView style={s.modalScroll} keyboardShouldPersistTaps="handled">
                            {isSearching ? (
                                <ActivityIndicator size="large" color={colors.sepia} style={{ marginTop: 40 }} />
                            ) : searchResults.length > 0 ? (
                                searchResults.map(film => (
                                    <TouchableOpacity 
                                        key={film.id}
                                        style={s.resultItem}
                                        onPress={() => handleSetFilm(film)}
                                    >
                                        {film.poster_path ? (
                                            <Image source={{ uri: tmdb.poster(film.poster_path, 'w92') }} style={s.resultPoster} />
                                        ) : (
                                            <View style={[s.resultPoster, { backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' }]}>
                                                <Search size={16} color={colors.ash} />
                                            </View>
                                        )}
                                        <View style={s.resultInfo}>
                                            <Text style={s.resultTitle} numberOfLines={2}>{film.title}</Text>
                                            {film.release_date && <Text style={s.resultYear}>{film.release_date.slice(0, 4)}</Text>}
                                        </View>
                                    </TouchableOpacity>
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
        borderColor: 'rgba(139,105,20,0.3)',
        borderStyle: 'dashed',
        backgroundColor: 'transparent'
    },
    slotFilled: {
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.5)',
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
        resizeMode: 'cover'
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
        borderColor: 'rgba(139,105,20,0.2)',
    },
    modalHeader: {
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(139,105,20,0.1)',
    },
    modalEyebrow: {
        fontFamily: fonts.ui,
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
        borderColor: 'rgba(139,105,20,0.15)',
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
        borderColor: 'rgba(139,105,20,0.1)',
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
        fontFamily: fonts.ui,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.sepia,
    },
    noResults: {
        textAlign: 'center',
        paddingTop: 40,
        fontFamily: fonts.ui,
        fontSize: 12,
        color: colors.fog,
        letterSpacing: 2,
    }
});
