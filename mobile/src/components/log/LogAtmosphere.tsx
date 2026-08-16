import React from 'react';
import { View, StyleSheet, InteractionManager } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, ReduceMotion } from 'react-native-reanimated';

import { colors } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

/** How far down the film reaches before it is solid ink. Matches the record. */
const FILM_HEIGHT = 360;

/**
 * THE FILM, BEHIND THE RECORD.
 *
 * The composer was the only major surface in this app with no film in it — you
 * wrote about a picture while looking at a flat dark form, and the film only
 * appeared afterwards, behind your words, on the finished record. The act of
 * making it was less atmospheric than the thing made.
 *
 * ── THE RECIPE IS THE RECORD'S OWN ──────────────────────────────────────────
 * Poster, blurred, at 20% under a four-stop gradient that reaches solid ink
 * before any writing begins — so text is never set over an image. The record
 * page falls back to the poster for its backdrop in exactly this way, which is
 * why this needs NO new data: the poster is already in hand.
 *
 * It reuses the docket's URI (w342), so there is one download, one cache entry
 * and one base decode for both. Copying the record's w780 would have bought a
 * sharpness that a 20% blur throws away.
 *
 * ── A SCRIM OF ITS OWN FOR THE CHROME ───────────────────────────────────────
 * The record's gradient starts fully transparent, which is right there because
 * its header is opaque. Ours dissolves into the film, so CLOSE, the handle and
 * the EDITING badge would sit on the LEAST covered part of a blurred poster.
 * The top 124pt carries a second, shorter scrim for them alone.
 *
 * ── IT ARRIVES AFTER THE DOOR CLOSES ────────────────────────────────────────
 * Mounted only once the entrance has settled, so a decode can never compete
 * with the sheet sliding up — and it fades in rather than appearing. Which is
 * not a compromise: it is the projector lamp warming after you sit down, the
 * same beat as the Society's mark at the door.
 *
 * `runAfterInteractions` is paired with a timeout: if anything ever keeps the
 * interaction handle open, the film still arrives. The one element carrying the
 * atmosphere must not depend on a promise that can be starved.
 */
export default React.memo(function LogAtmosphere({ posterPath }: { posterPath: string | null | undefined }) {
    const [mounted, setMounted] = React.useState(false);
    const fade = useSharedValue(0);

    React.useEffect(() => {
        let done = false;
        const arrive = () => {
            if (done) return;
            done = true;
            setMounted(true);
            fade.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
        };
        const task = InteractionManager.runAfterInteractions(arrive);
        const backstop = setTimeout(arrive, 450);
        return () => { done = true; task.cancel(); clearTimeout(backstop); };
    }, [fade]);

    const style = useAnimatedStyle(() => ({ opacity: fade.value }));

    if (!posterPath || !mounted) return null;

    return (
        <Animated.View style={[s.film, style]} pointerEvents="none">
            <Image
                source={{ uri: tmdb.poster(posterPath, 'w342') }}
                style={s.image}
                contentFit="cover"
                blurRadius={4}
                cachePolicy="memory-disk"
                transition={0}
                accessible={false}
            />
            <LinearGradient
                colors={['rgba(10,7,3,0)', 'rgba(10,7,3,0.40)', 'rgba(10,7,3,0.95)', colors.ink]}
                locations={[0, 0.38, 0.76, 1]}
                style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
                colors={['rgba(10,7,3,0.72)', 'rgba(10,7,3,0.34)', 'rgba(10,7,3,0)']}
                locations={[0, 0.55, 1]}
                style={s.chromeScrim}
            />
            {/* The house's own texture — a single view at 3% black, the same one
                the record uses. Not the Skia grain shader, which is not mounted
                anywhere and would cost far more than this is worth. */}
            <View style={[StyleSheet.absoluteFillObject, s.texture]} />
        </Animated.View>
    );
});

const s = StyleSheet.create({
    film: { position: 'absolute', top: 0, left: 0, right: 0, height: FILM_HEIGHT, overflow: 'hidden' },
    // Inset so the blur's soft edge never shows a seam against the sheet.
    image: { position: 'absolute', top: -14, left: -14, right: -14, bottom: -14, opacity: 0.2 },
    chromeScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 124 },
    texture: { backgroundColor: 'rgba(0,0,0,0.03)' },
});
