import { View, StyleSheet, Image } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { tmdb } from '@/src/lib/tmdb';
import { colors } from '@/src/theme/theme';

/**
 * ProfileBackdrop — Auteur-only full-bleed poster backdrop.
 * 
 * Keeps the poster VISIBLE but atmospheric — not muddy.
 * No gold glow (user feedback: looks messy/annoying).
 */
export function ProfileBackdrop({ user, logs }: { user: any; logs: any[] }) {
    const isAuteur = user?.role === 'auteur' || user?.tier === 'auteur';
    if (!isAuteur) return null;

    const favorites = (user?.preferences?.favorites || []).filter((f: any) => f && f.poster_path);
    const posterSrc = favorites.length > 0
        ? `https://image.tmdb.org/t/p/w780${favorites[0].poster_path}`
        : logs?.filter((l: any) => l.poster).slice(0, 1).map((l: any) => tmdb.poster(l.poster, 'w342'))[0];

    if (!posterSrc) return null;

    return (
        <Animated.View entering={FadeIn.duration(1200)} style={s.container}>
            {/* Poster image */}
            <Image
                source={{ uri: posterSrc }}
                style={s.image}
                resizeMode="cover"
            />
            
            {/* Dark wash to simulate CSS brightness(0.4) */}
            <View style={s.darkWash} />

            {/* Bottom-to-top gradient (primary vignette) */}
            <LinearGradient
                colors={['transparent', 'rgba(10,7,3,0.55)', colors.ink]}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Top edge fade (navbar blend) */}
            <LinearGradient
                colors={['rgba(10,7,3,0.85)', 'transparent']}
                style={s.topFade}
            />

            {/* Left vignette */}
            <LinearGradient
                colors={['rgba(10,7,3,0.6)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.sideFadeLeft}
            />

            {/* Right vignette */}
            <LinearGradient
                colors={['rgba(10,7,3,0.6)', 'transparent']}
                start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }}
                style={s.sideFadeRight}
            />
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
        backgroundColor: 'rgba(10,7,3,0.35)',
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
