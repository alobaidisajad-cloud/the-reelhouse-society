import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, useAnimatedProps, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import { useModalKeyboardPadding } from '@/src/hooks/useModalKeyboardPadding';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Plus, ArrowLeftRight, Trash2, Replace } from 'lucide-react-native';
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
import { readMounts, MOUNT_COUNT, CENTRE_MOUNT, type FavouriteFilm } from './favourites';

const AnimatedView = Animated.createAnimatedComponent(View);
// Module-scoped: prevents remount on every render cycle
const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

// ════════════════════════════════════════════════════════════════════════════
// THE ALTARPIECE
// ════════════════════════════════════════════════════════════════════════════
/**
 * Three favourite films used to hang as three equal thirds — the same row every
 * other logging app draws. An altarpiece is not three equal panels: it is a
 * large centre with two smaller wings, hung from a hook and standing on a rail.
 * That shape says something a row cannot — that ONE of these films matters most
 * — and it costs nothing but arithmetic.
 *
 * ── THE GEOMETRY IS DERIVED, NEVER TYPED IN ──────────────────────────────────
 * Fixed widths (85 / 140 / 85) fit a 375pt screen and overflow a 320pt one.
 * These are proportions of whatever width the device actually gives us, and
 * `rowW` is the sum of the parts rather than an independent guess — so the row
 * can never be wider than the space it was measured from. There is a test that
 * sweeps every plausible screen width and checks exactly that.
 */
export const TRIPTYCH_AISLE = 20;   // the page's own gutter, both sides
export const TRIPTYCH_GAP = 5;      // between panels — an altarpiece is hinged, not spaced
const POSTER_RATIO = 1.5;           // 2:3, the standard one-sheet
const CENTRE_SHARE = 0.4545;        // the centre's share of the panel width

export function triptychMetrics(windowWidth: number) {
    // Below ~260pt of usable width nothing legible fits; clamp rather than
    // produce negative panels.
    const avail = Math.max(260, windowWidth - TRIPTYCH_AISLE * 2);
    const panels = avail - TRIPTYCH_GAP * 2;
    const centreW = Math.round(panels * CENTRE_SHARE);
    // FLOOR, not round: the wings are the remainder, and rounding them up is
    // what makes a row overflow its own container by a point.
    const wingW = Math.floor((panels - centreW) / 2);
    return {
        avail,
        gap: TRIPTYCH_GAP,
        centreW, centreH: Math.round(centreW * POSTER_RATIO),
        wingW, wingH: Math.round(wingW * POSTER_RATIO),
        rowW: centreW + wingW * 2 + TRIPTYCH_GAP * 2,
    };
}

/** Hanging order: left wing, centre, right wing. */
const HANGING_ORDER = [1, CENTRE_MOUNT, 2] as const;

// ── Tier Slot Glow — Web's archivist-card-glow / auteur-card-glow ──
// 4s breathing border, shimmer top line. The per-panel ✦/★ glyph is gone: the
// altarpiece says rank with LIGHT, and three badges on three frames was the
// "decoration where information belongs" problem this pass exists to remove.
function TierGlow({ tier, style, children }: { tier: 'archivist' | 'auteur'; style?: any; children: React.ReactNode }) {
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
            undefined,
            // A breathing frame is atmosphere, not information — it holds still
            // for anyone who has asked the system to stop things moving.
            ReduceMotion.System,
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

    const shimmerColors: [string, string, string, string, string] = isArch
        ? ['transparent', 'rgba(218,165,32,0.4)', 'rgba(242,232,160,0.7)', 'rgba(218,165,32,0.4)', 'transparent']
        : ['transparent', 'rgba(180,45,45,0.4)', 'rgba(220,80,80,0.7)', 'rgba(180,45,45,0.4)', 'transparent'];

    return (
        <AnimatedView style={[s.glowWrap, baseShadow, style, animStyle]}>
            {children}
            <LinearGradient
                colors={shimmerColors}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.shimmerTop}
            />
        </AnimatedView>
    );
}

/** Kept as the public name — every existing import refers to it. */
export type TriptychFilm = FavouriteFilm;

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
        // 84pt tall, 8pt apart. The default halo would overlap the next result
        // by 22pt and the later row wins — you would pick the wrong film.
        hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
        haptic
    >
        {film.poster_path ? (
            <Image source={{ uri: tmdb.poster(film.poster_path, 'w92') }} style={s.resultPoster} contentFit="cover" cachePolicy="memory-disk" transition={150} />
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
TriptychResultRow.displayName = 'TriptychResultRow';

/** What the sheet is currently showing. One Modal, two panes — see below. */
type Sheet = { index: number; mode: 'plate' | 'search' };

const MOUNT_NAME = ['the centre', 'the left wing', 'the right wing'];

export function ProfileTriptych({ user, isOwnProfile, userRole }: { user: TriptychUser, isOwnProfile: boolean, userRole?: string }) {
    const { updateUser } = useAuthStore();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const m = useMemo(() => triptychMetrics(width), [width]);

    const isArchivistPlus = isArchivistPlusTier(userRole);
    const isAuteurPlus = isAuteurPlusTier(userRole);

    // Positional — a cleared mount stays a hole. See ./favourites.ts.
    const mounts = useMemo(() => readMounts(user?.preferences?.favorites), [user?.preferences?.favorites]);
    const insets = useSafeAreaInsets();

    // KEYBOARD LAW (RN-Modal tier): Modal windows never resize on either
    // platform — the film-search field rises with the keyboard on BOTH.
    const kbPad = useModalKeyboardPadding(insets.bottom);

    // ── ONE MODAL, TWO PANES ─────────────────────────────────────────────────
    // Managing a mount and searching for a film used to want two sheets, and
    // dismissing one to present the other in the same tick is the iOS
    // modal-over-modal race that has bitten this app before: the second sheet
    // never appears. Swapping the CONTENT of a single mounted Modal cannot
    // race with anything.
    const [sheet, setSheet] = useState<Sheet | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<TriptychSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Nitrate Noir Breathing Ember Protocol for Search Modal
    const searchEmberOpacity = useSharedValue(0.5);
    useEffect(() => {
        if (isSearching) {
            searchEmberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true, undefined, ReduceMotion.System);
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

    const handleSearchQueryChange = useCallback((text: string) => {
        setSearchQuery(text);
    }, []);

    const searching = sheet?.mode === 'search';
    useEffect(() => {
        if (!searching || !searchQuery.trim()) {
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
    }, [searchQuery, searching]);

    /**
     * Every write goes through here: optimistic locally, merged onto the
     * FRESHEST prefs from the store rather than a stale prop snapshot (so a
     * concurrent change to another key isn't clobbered), queued when offline,
     * rolled back when the server genuinely refuses.
     */
    const commit = useCallback(async (next: (FavouriteFilm | null)[]) => {
        const currentPrefs = useAuthStore.getState().user?.preferences ?? {};
        const updatedPrefs = { ...currentPrefs, favorites: next };
        updateUser({ preferences: updatedPrefs });

        try {
            // Send only the changed key; the server merges it (COMP-7 cross-device).
            const { error } = await supabase.rpc('update_my_preferences', { p_preferences: { favorites: next } });
            if (error) throw error;
        } catch (e: unknown) {
            if (isNetworkError(e)) {
                enqueueMutation({ type: 'update_profile', payload: { user_id: user.id, preferences: updatedPrefs } });
            } else {
                updateUser({ preferences: currentPrefs });
                if (__DEV__) console.error('[ProfileTriptych] Failed to write favourites:', e);
            }
        }
    }, [updateUser, user.id]);

    const handleSetFilm = useCallback(async (film: TriptychSearchResult) => {
        if (sheet === null) return;
        TactileEngine.success();
        const next = [...mounts];
        const year = typeof film.release_date === 'string' ? film.release_date.slice(0, 4) : '';
        next[sheet.index] = {
            id: film.id,
            title: film.title,
            poster_path: film.poster_path ?? '',
            ...(/^\d{4}$/.test(year) ? { year } : {}),
        };
        setSheet(null);
        await commit(next);
    }, [sheet, mounts, commit]);

    const handleRemove = useCallback(async (index: number) => {
        TactileEngine.rigid();
        const next = [...mounts];
        next[index] = null;
        setSheet(null);
        await commit(next);
    }, [mounts, commit]);

    /** A wing changes places with the centre. Nothing else moves. */
    const handleMoveToCentre = useCallback(async (index: number) => {
        if (index === CENTRE_MOUNT) return;
        TactileEngine.success();
        const next = [...mounts];
        next[CENTRE_MOUNT] = mounts[index];
        next[index] = mounts[CENTRE_MOUNT];
        setSheet(null);
        await commit(next);
    }, [mounts, commit]);

    const openMount = useCallback((index: number, film: FavouriteFilm | null) => {
        if (!isOwnProfile) {
            if (film && film.id && film.id !== -1) (router.push as any)(`/film/${film.id}` as never);
            return;
        }
        TactileEngine.navigate();
        setSearchQuery('');
        setSearchResults([]);
        // An empty mount has nothing to manage — go straight to the search.
        setSheet({ index, mode: film ? 'plate' : 'search' });
    }, [isOwnProfile, router]);

    const hasAnything = mounts.some(Boolean);
    if (!hasAnything && !isOwnProfile) {
        return null;   // A visitor is not shown three empty frames.
    }

    const sheetFilm = sheet ? mounts[sheet.index] : null;

    // ── one mount ────────────────────────────────────────────────────────────
    const renderMount = (index: number) => {
        const film = mounts[index];
        const isCentre = index === CENTRE_MOUNT;
        const w = isCentre ? m.centreW : m.wingW;
        const h = isCentre ? m.centreH : m.wingH;
        const size = { width: w, height: h };

        const label = film
            ? (isOwnProfile
                ? `${film.title}, ${MOUNT_NAME[index]} of your favourites. Manage this mount.`
                : `${film.title}, ${MOUNT_NAME[index]} of their favourites.`)
            : (isOwnProfile ? `Add a film to ${MOUNT_NAME[index]}` : `${MOUNT_NAME[index]}, empty`);

        // The WRAPPER carries the size and the panel fills it.
        //
        // Both were given `size` at first, which is right for the plain wrapper
        // (a bare View, no border) and wrong for TierGlow: that draws a 1pt
        // breathing border, so its content box is 2pt smaller than the size it
        // was handed — and a child with an explicit width simply overflowed it.
        // Every Archivist and Auteur would have had three panels sitting 1pt
        // proud of their own frames.
        const face = (
            <PressableScale
                style={[
                    s.mount, s.mountFill,
                    isCentre ? s.mountCentre : s.mountWing,
                    // TierGlow draws the frame itself for Archivist and above.
                    film && isArchivistPlus && s.mountNoBorder,
                    isCentre && film && (isAuteurPlus ? s.mountCentreLitRuby : s.mountCentreLit),
                ]}
                onPress={() => openMount(index, film)}
                // A visitor cannot act on an empty mount, and a posterless
                // legacy favourite has no film page to open.
                disabled={!isOwnProfile && !(film && film.id !== -1)}
                // NO halo. The panels are 5pt apart and the smallest of them is
                // 88pt wide — they clear the touch floor several times over by
                // their own geometry. PressableScale's 15pt default would push
                // each panel 15pt into the next, and an overlap resolves in
                // favour of the LATER sibling: the centre would have taken the
                // left wing's inner edge, and the right wing the centre's.
                hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
                accessibilityLabel={label}
                haptic
            >
                {film ? (
                    film.poster_path ? (
                        <Image
                            source={{ uri: tmdb.poster(film.poster_path, isCentre ? 'w342' : 'w185') }}
                            style={s.poster}
                            contentFit="cover"
                            cachePolicy="memory-disk" transition={150}
                        />
                    ) : (
                        // A favourite stored by an old build as a bare title has
                        // no artwork. A titled plate is the dignified answer; a
                        // broken image was the old one.
                        <View style={s.titlePlate}>
                            <Text style={[s.titlePlateText, isCentre && s.titlePlateTextLg]} numberOfLines={4}>{film.title}</Text>
                        </View>
                    )
                ) : (
                    // An empty mount is still a frame — the dashed rectangle sits
                    // INSIDE it, the way a gallery leaves a hanging space marked.
                    <View style={s.emptyMount}>
                        {isOwnProfile
                            ? <Plus size={isCentre ? 20 : 15} color={colors.sepia} style={s.inviteGlyph} />
                            : <Text style={s.emptyMark} allowFontScaling={false}>✦</Text>}
                    </View>
                )}
                {/* The mount board: a hairline mat just inside the frame. It is
                    four pixels of nothing, and it is the difference between a
                    picture on a wall and an image in a box. */}
                <View style={s.mountBoard} pointerEvents="none" />
            </PressableScale>
        );

        if (film && isAuteurPlus) return <TierGlow key={index} tier="auteur" style={size}>{face}</TierGlow>;
        if (film && isArchivistPlus) return <TierGlow key={index} tier="archivist" style={size}>{face}</TierGlow>;
        return <View key={index} style={size}>{face}</View>;
    };

    return (
        <View style={s.container}>
            {/* The hook it hangs from — 5pt, and it turns with the rank. */}
            <View style={s.hookWrap}>
                <View style={[s.hook, isAuteurPlus ? s.hookRuby : isArchivistPlus ? s.hookBrass : null]} />
            </View>

            <View style={[s.row, { width: m.rowW, gap: m.gap }]}>
                {HANGING_ORDER.map(renderMount)}
            </View>

            {/* Gallery labels — beneath the frames, never written on the art.
                The mounts keep a fixed label height whether they hold a title,
                an invitation or nothing, so the rail below stays straight. */}
            <View style={[s.labelRow, { width: m.rowW, gap: m.gap }]}>
                {HANGING_ORDER.map(index => {
                    const film = mounts[index];
                    const isCentre = index === CENTRE_MOUNT;
                    return (
                        <View key={index} style={{ width: isCentre ? m.centreW : m.wingW }}>
                            {film ? (
                                <>
                                    <Text style={[s.gallLabel, isCentre && s.gallLabelCentre]} numberOfLines={2}>
                                        {film.title.toUpperCase()}
                                    </Text>
                                    {/* Newly chosen favourites carry their year;
                                        ones stored before this build simply have
                                        none, and the label closes up. */}
                                    {!!film.year && <Text style={s.gallYear} numberOfLines={1}>{film.year}</Text>}
                                </>
                            ) : isOwnProfile ? (
                                <Text style={s.gallInvite} numberOfLines={2}>
                                    {index === CENTRE_MOUNT ? 'CHOOSE THE\nCENTRE' : 'CHOOSE A\nWING'}
                                </Text>
                            ) : (
                                <Text style={s.gallEmpty} numberOfLines={2}>A MOUNT{'\n'}STANDS EMPTY</Text>
                            )}
                        </View>
                    );
                })}
            </View>

            {/* The picture rail the whole altarpiece stands on — page width,
                not row width, so it reads as the wall rather than a underline. */}
            <View style={[s.railRow, { width: m.avail }]}>
                <LinearGradient
                    colors={['transparent', 'rgba(184,137,26,0.3)', 'rgba(184,137,26,0.3)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.railLine}
                />
                <View style={[s.railDiamond, isAuteurPlus && s.railDiamondRuby]} />
                <LinearGradient
                    colors={['rgba(184,137,26,0.3)', 'rgba(184,137,26,0.3)', 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.railLine}
                />
            </View>

            {/* ── the sheet ───────────────────────────────────────────────── */}
            <Modal
                statusBarTranslucent
                visible={sheet !== null}
                transparent
                animationType="slide"
                onRequestClose={() => setSheet(null)}
            >
                <Animated.View style={[s.modalOverlay, kbPad]}>
                    <Pressable
                        style={StyleSheet.absoluteFillObject}
                        onPress={() => { TactileEngine.selection(); setSheet(null); }}
                        accessibilityLabel="Close"
                    />

                    {sheet?.mode === 'plate' && sheetFilm ? (
                        <Animated.View entering={FadeIn.duration(180)} style={[s.sheet, s.plateSheet, { paddingBottom: 20 + insets.bottom }]}>
                            <View style={s.grabber} />
                            <Text style={s.plateEyebrow}>{MOUNT_NAME[sheet.index].toUpperCase()}</Text>
                            <Text style={s.plateTitle} numberOfLines={2}>{sheetFilm.title}</Text>

                            {sheet.index !== CENTRE_MOUNT && (
                                <PlateAction
                                    Icon={ArrowLeftRight}
                                    label="Move to the centre"
                                    hint="Trades places with the centre panel"
                                    onPress={() => handleMoveToCentre(sheet.index)}
                                />
                            )}
                            <PlateAction
                                Icon={Replace}
                                label="Replace this film"
                                onPress={() => { TactileEngine.selection(); setSearchQuery(''); setSearchResults([]); setSheet({ index: sheet.index, mode: 'search' }); }}
                            />
                            <PlateAction
                                Icon={Trash2}
                                label="Remove from the altarpiece"
                                destructive
                                onPress={() => handleRemove(sheet.index)}
                            />
                        </Animated.View>
                    ) : sheet ? (
                        <Animated.View entering={FadeIn.duration(180)} style={[s.sheet, s.searchSheet]}>
                            <View style={s.modalHeader}>
                                <View style={s.grabber} />
                                <Text style={s.modalEyebrow}>{sheetFilm ? 'REPLACE' : 'CURATE'} {MOUNT_NAME[sheet.index].toUpperCase()}</Text>
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
                                        accessibilityLabel={`Search films for ${MOUNT_NAME[sheet.index]}`}
                                        returnKeyType="search"
                                    />
                                </View>
                            </View>

                            <ScrollView style={s.modalScroll} keyboardShouldPersistTaps="handled">
                                {isSearching ? (
                                    <ActivityIndicator size="large" color={colors.sepia} style={s.spinner} />
                                ) : searchResults.length > 0 ? (
                                    searchResults.map(film => (
                                        <TriptychResultRow key={film.id} film={film} handleSetFilm={handleSetFilm} />
                                    ))
                                ) : searchQuery ? (
                                    <Text style={s.noResults}>NO MATCHES FOUND</Text>
                                ) : null}
                            </ScrollView>
                        </Animated.View>
                    ) : null}
                </Animated.View>
            </Modal>
        </View>
    );
}

function PlateAction({ Icon, label, hint, destructive, onPress }: {
    Icon: React.ComponentType<{ size?: number; color?: string }>;
    label: string;
    hint?: string;
    destructive?: boolean;
    onPress: () => void;
}) {
    return (
        <PressableScale
            style={s.plateAction}
            onPress={onPress}
            // Stacked flush, hairline apart, and one of them removes a film.
            // Vertical slop here would hand the bottom of REPLACE to REMOVE.
            hitSlop={{ top: 0, bottom: 0, left: 12, right: 12 }}
            accessibilityLabel={label}
            accessibilityHint={hint}
            haptic
        >
            <Icon size={16} color={destructive ? colors.crimson : colors.sepia} />
            <View style={s.plateActionText}>
                <Text style={[s.plateActionLabel, destructive && s.plateActionLabelDanger]}>{label}</Text>
                {hint ? <Text style={s.plateActionHint}>{hint}</Text> : null}
            </View>
        </PressableScale>
    );
}

const s = StyleSheet.create({
    container: { alignItems: 'center', marginBottom: 20 },

    // ── the hang ──
    hookWrap: { alignItems: 'center', marginBottom: 5 },
    hook: {
        width: 5, height: 5,
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.45)',
        backgroundColor: 'rgba(10,9,6,0.9)',
        transform: [{ rotate: '45deg' }],
    },
    hookBrass: { borderColor: 'rgba(184,137,26,0.75)' },
    hookRuby: { borderColor: 'rgba(180,45,45,0.75)' },

    // Bottoms aligned: the wings stand on the same rail as the centre.
    row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },

    // A fixed floor keeps the section's height stable whether a label runs to
    // one line, two, or carries an invitation instead of a title.
    labelRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, minHeight: 26 },
    gallLabel: {
        fontFamily: fonts.sub,
        fontSize: 7.5,
        letterSpacing: 1.1,
        lineHeight: 10,
        color: colors.bone,
        textAlign: 'center',
    },
    gallLabelCentre: {
        fontSize: 9,
        letterSpacing: 1.4,
        lineHeight: 12,
        color: colors.silverScreen,
    },
    gallYear: { fontFamily: fonts.body, fontSize: 7.5, lineHeight: 10, color: colors.fog, opacity: 0.7, textAlign: 'center', marginTop: 3 },
    // Same pixels, two voices: a fact for a visitor, an invitation on your own file.
    gallEmpty: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.2, lineHeight: 10, color: colors.fog, opacity: 0.5, textAlign: 'center' },
    gallInvite: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.2, lineHeight: 10, color: colors.sepia, opacity: 0.8, textAlign: 'center' },

    // ── the rail ──
    railRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
    railLine: { flex: 1, height: 1 },
    railDiamond: { width: 3, height: 3, marginHorizontal: 5, backgroundColor: colors.sepia, opacity: 0.5, transform: [{ rotate: '45deg' }] },
    railDiamondRuby: { backgroundColor: colors.crimson, opacity: 0.8 },

    // ── a mount ──
    // The frame is BONE, not brass. Brass is the house's action colour; a picture
    // frame that glows like a button reads as a control, and three of them in a
    // row read as a toolbar. The warmth here comes from the light on the centre.
    glowWrap: { borderWidth: 1, borderRadius: 2, overflow: 'visible' },
    mount: {
        borderRadius: 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.frame,
    },
    /** Fills whichever wrapper it is in — see the note at the call site. */
    mountFill: { flex: 1, alignSelf: 'stretch' },
    mountWing: { borderWidth: 1, borderColor: 'rgba(232,223,208,0.15)' },
    mountCentre: { borderWidth: 1, borderColor: 'rgba(232,223,208,0.30)' },
    // Only the centre is lit, and the light is the rank.
    mountCentreLit: { shadowColor: 'rgba(184,137,26,1)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 30, elevation: 8 },
    mountCentreLitRuby: { shadowColor: 'rgba(180,45,45,1)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 30, elevation: 8 },
    mountNoBorder: { borderWidth: 0 },
    mountBoard: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderWidth: 1, borderColor: 'rgba(232,223,208,0.10)', zIndex: 3 },
    poster: { width: '100%', height: '100%' },

    titlePlate: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    titlePlateText: { fontFamily: fonts.display, fontSize: 11, lineHeight: 15, color: colors.sepia, textAlign: 'center' },
    titlePlateTextLg: { fontSize: 15, lineHeight: 20 },

    emptyMount: {
        position: 'absolute', top: 6, left: 6, right: 6, bottom: 6,
        borderWidth: 1, borderColor: 'rgba(184,137,26,0.30)', borderStyle: 'dashed',
        alignItems: 'center', justifyContent: 'center',
    },
    emptyMark: { fontSize: 13, color: 'rgba(184,137,26,0.5)' },
    inviteGlyph: { opacity: 0.55 },

    shimmerTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: 6, zIndex: 4 },

    // ── the sheet ──
    modalOverlay: { flex: 1, backgroundColor: 'rgba(8,6,4,0.95)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.ink,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.2)',
    },
    searchSheet: { height: '85%' },
    plateSheet: { paddingHorizontal: 20, paddingTop: 10 },
    grabber: {
        alignSelf: 'center',
        width: 34, height: 3, borderRadius: 2,
        backgroundColor: 'rgba(184,137,26,0.28)',
        marginBottom: 14,
    },

    plateEyebrow: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia, textAlign: 'center', opacity: 0.75 },
    plateTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.parchment, textAlign: 'center', marginTop: 6, marginBottom: 16 },
    plateAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderTopWidth: 1,
        borderTopColor: 'rgba(184,137,26,0.10)',
    },
    plateActionText: { flex: 1 },
    plateActionLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.parchment },
    plateActionLabelDanger: { color: colors.crimson },
    plateActionHint: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, marginTop: 2 },

    modalHeader: { padding: 24, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)' },
    modalEyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, textAlign: 'center', marginBottom: 16 },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(10,5,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.15)',
        borderRadius: 8,
        paddingHorizontal: 16,
    },
    searchIcon: { marginRight: 12 },
    searchInput: { flex: 1, height: 50, fontFamily: fonts.display, fontSize: 18, color: colors.parchment },
    modalScroll: { flex: 1, padding: 16 },
    spinner: { marginTop: 40 },
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
    resultPoster: { width: 40, height: 60, borderRadius: 4, marginRight: 16 },
    resultPosterPlaceholder: { backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
    resultInfo: { flex: 1 },
    resultTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, marginBottom: 4 },
    resultYear: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
    noResults: { textAlign: 'center', paddingTop: 40, fontFamily: fonts.sub, fontSize: 12, color: colors.fog, letterSpacing: 2 },
});

export { MOUNT_COUNT };
