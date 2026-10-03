/**
 * EmptyStates — what a screen draws when there is nothing to show, or what it
 * shows could not be read: Buster, a line of lore, and the way on.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, {
    useSharedValue, useAnimatedStyle, useReducedMotion,
    withRepeat, withSequence, withTiming, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import Buster, { type BusterPicture } from '@/src/components/Buster';
import TryAgain, { ACTS_GAP, TRY_AGAIN_ABOVE_A_WAY_OUT, WayOut } from '@/src/components/TryAgain';
import { pickRandom } from '@/src/lore/fragments';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { Arrive } from '@/src/components/Arrive';

interface EmptyStateProps {
    icon?: React.ReactNode;
    glyph?: string;
    title: string;
    subtitle?: string;
    compact?: boolean;
    /** Buster, in this mood, where the icon would be. */
    buster?: Extract<BusterPicture, { size: 80 }>['mood'];
}

/** Breathing wrapper — standby projector bulb effect. Under Reduce Motion it rests, half lit. */
function BreathingIcon({ children }: { children: React.ReactNode }) {
    const still = useReducedMotion();
    const opacity = useSharedValue(still ? 0.55 : 0.4);
    const scale = useSharedValue(still ? 1 : 0.95);

    useEffect(() => {
        if (still) return;
        // Finite repeats (6 iterations ≈ 24s) to allow UI thread idling
        opacity.value = withRepeat(
            withSequence(
                withTiming(0.7, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            ), 6, true
        );
        scale.value = withRepeat(
            withSequence(
                withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.95, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            ), 6, true
        );
        return () => {
            cancelAnimation(opacity);
            cancelAnimation(scale);
        };
    }, [still, opacity, scale]);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    return <Animated.View style={[s.iconWrap, style]}>{children}</Animated.View>;
}

export function EmptyState({ icon, glyph = '◈', title, subtitle, compact, buster }: EmptyStateProps) {
    return (
        <Arrive name="empty-state" duration={600} rise={0} style={[s.container, compact && s.compact]}>
            {buster ? (
                <Buster size={80} mood={buster} />
            ) : icon ? (
                <BreathingIcon>{icon}</BreathingIcon>
            ) : (
                <BreathingIcon><Text style={s.glyph}>{glyph}</Text></BreathingIcon>
            )}
            <Text style={s.title}>{title}</Text>
            {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
            <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerGlyph} {...UNSPOKEN}>✦</Text>
                <View style={s.dividerLine} />
            </View>
        </Arrive>
    );
}

/** What every pull to refresh says when it reached nothing, over the page it kept. */
export const REFRESH_FAILED = 'Could not refresh — check your connection.';

/**
 * What a screen draws when what it shows could not be reached: every screen
 * the same, so a failure never reads as an empty room. With `onRetry`, the
 * house's one TRY AGAIN.
 */
export function EmptyOffline({ onRetry, wayOut }: {
    onRetry?: () => void;
    /** The way out beside TRY AGAIN, spaced so neither touch area takes the other's. */
    wayOut?: { label: string; onPress: () => void };
} = {}) {
    // Chosen once: picked per render, the line changed while it was read.
    const [lore] = useState(() => pickRandom([
        'The transmission has been severed. We are operating in the dark.',
        'No signal from the Society. Hold your ground.',
        'The projector requires a connection. We wait.'
    ]));
    return (
        <View style={s.offline}>
            <EmptyState
                buster="dimmed"
                title="Transmission Interrupted"
                subtitle={lore}
            />
            {(onRetry || wayOut) && (
                <View style={s.acts}>
                    {onRetry && <TryAgain onPress={onRetry} hitSlop={wayOut ? TRY_AGAIN_ABOVE_A_WAY_OUT : undefined} />}
                    {wayOut && <WayOut label={wayOut.label} onPress={wayOut.onPress} belowTryAgain={!!onRetry} />}
                </View>
            )}
        </View>
    );
}

// offline and container give way when a screen is short, so Buster can give his
// room to the words (he steps aside); in a scrolling list they never need to.
const s = StyleSheet.create({
    offline: { alignItems: 'center', flexShrink: 1, minHeight: 0 },
    acts: { alignItems: 'center', gap: ACTS_GAP },
    // 24 at the sides, not 48: inside a page's own margin on a 320pt phone, 48
    // left the title 160pt, and "Transmission" at its largest (23pt) is 166.
    container: { paddingVertical: 48, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 1, minHeight: 0 },
    compact: { padding: 24 },
    iconWrap: { marginBottom: 16, opacity: 0.7 },
    glyph: { fontSize: 32, marginBottom: 16, opacity: 0.4, color: colors.sepia },
    title: {
        fontFamily: fonts.display,
        fontSize: 17,
        color: colors.parchment,
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: 0.5,
        marginTop: 12,
    },
    subtitle: {
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.fog,
        textAlign: 'center',
        lineHeight: 20,
        maxWidth: 280,
        letterSpacing: 0.2,
        fontStyle: 'italic',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 20,
        opacity: 0.3,
    },
    dividerLine: {
        width: 24,
        height: 1,
        backgroundColor: colors.sepia,
    },
    dividerGlyph: {
        fontFamily: fonts.display,
        fontSize: 8,
        color: colors.sepia,
    },
});
