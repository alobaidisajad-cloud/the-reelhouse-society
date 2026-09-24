import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, type SharedValue } from 'react-native-reanimated';
import { RoomVeil, type VeilStops } from '@/src/components/atmosphere/RoomLight';
import { LinearGradient } from 'expo-linear-gradient';
import { tmdb } from '@/src/lib/tmdb';
import { colors } from '@/src/theme/theme';
import { isAuteurPlusTier } from '@/src/utils/tier';
import { pickBackdropFilm } from './favourites';

/**
 * The backdrop is a privilege, not an imposition.
 *
 * An Auteur's page is dressed from the centre of their altarpiece — beautiful,
 * and not what everyone wants behind their own face. The switch lives in the
 * Dossier Bureau; ABSENT MEANS ON, so nobody who already has a backdrop loses
 * it the day this ships, and only an explicit `false` takes it down.
 */
export function backdropIsOn(preferences: { backdrop?: unknown } | null | undefined): boolean {
    return preferences?.backdrop !== false;
}

/**
 * ProfileBackdrop — Auteur-only full-bleed poster backdrop.
 * 
 * Keeps the poster VISIBLE but atmospheric — not muddy.
 * No gold glow (user feedback: looks messy/annoying).
 */
interface BackdropLog {
    poster?: string | null;
}

interface BackdropUser {
    role?: string | null;
    tier?: string | null;
    is_founding?: boolean | null;
    preferences?: { favorites?: { poster_path?: string | null }[]; backdrop?: unknown; [key: string]: unknown } | null;
}

/**
 * The picture a member's file is dressed from, or null when it has none — an
 * Auteur with the backdrop on and a film to cut it from. One function, read by
 * the backdrop itself AND by the room's light, which blooms from the same
 * picture: two copies of this rule could disagree about which film it is.
 */
export function backdropSource(user: BackdropUser | null | undefined, logs: BackdropLog[] | null | undefined): string | null {
    if (!user || !isAuteurPlusTier(user)) return null;
    if (!backdropIsOn(user?.preferences)) return null;
    // The centre of the altarpiece dresses the page. That rule lives in one
    // place so this and ProfileTriptych can never disagree about which film is
    // "first" — they used to read the same array two different ways.
    const centre = pickBackdropFilm(user?.preferences?.favorites);
    return (centre
        ? `https://image.tmdb.org/t/p/w780${centre.poster_path}`
        : logs?.filter((l: BackdropLog) => l.poster).slice(0, 1).map((l: BackdropLog) => tmdb.poster(l.poster ?? '', 'w342'))[0]) || null;
}

/** The plate's fade into the room: how much house it lays down, top to hem. */
const PLATE_VEIL: VeilStops = [[0, 0], [0.45, 0.55], [1, 1]];

export function ProfileBackdrop({ user, logs, hem, scrollY }: {
    user: BackdropUser;
    logs: BackdropLog[];
    /** Where the plate ends at rest, once it has been laid out. */
    hem?: number;
    /** The page's scroll: the plate moves with it, the room's light does not. */
    scrollY?: SharedValue<number>;
}) {
    const posterSrc = backdropSource(user, logs);
    if (!posterSrc) return null;

    return (
        <Animated.View testID="profile-backdrop" entering={FadeIn.duration(1200)} style={s.container}>
            {/* Poster image */}
            <Image
                source={{ uri: posterSrc }}
                style={s.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
            />

            {/* Dark wash to simulate CSS brightness(0.4) */}
            <View style={s.darkWash} />

            {/* Top edge fade (navbar blend) */}
            <LinearGradient
                colors={['rgba(13,11,9,0.85)', 'transparent']}
                style={s.topFade}
            />

            {/* Left vignette */}
            <LinearGradient
                colors={['rgba(13,11,9,0.6)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.sideFadeLeft}
            />

            {/* Right vignette */}
            <LinearGradient
                colors={['rgba(13,11,9,0.6)', 'transparent']}
                start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }}
                style={s.sideFadeRight}
            />

            {/* Bottom-to-top gradient (primary vignette) — LAST, over the side
                vignettes too: at the hem it paints the lit room exactly (see
                RoomVeil), and a vignette over it would darken the plate's
                corners against the light below them. Until the plate has been
                measured it is the plain veil. */}
            {hem ? (
                <RoomVeil room="member" hem={hem} art={posterSrc} stops={PLATE_VEIL} lifted={scrollY} />
            ) : (
                <LinearGradient
                    colors={['transparent', 'rgba(13,11,9,0.55)', colors.ink]}
                    locations={[0, 0.45, 1]}
                    style={StyleSheet.absoluteFillObject}
                />
            )}
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
        zIndex: 0,
    },
    image: {
        width: '100%',
        height: '100%',
        opacity: 0.55,
        transform: [{ scale: 1.08 }],
    },
    darkWash: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(13,11,9,0.35)',
    },
    topFade: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 50,
    },
    sideFadeLeft: {
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: '22%',
    },
    sideFadeRight: {
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: '22%',
    },
});
