/**
 * EmptyStates — Themed cinematic empty state displays.
 * Used across tabs when no data is available.
 * 
 * Each empty state tells a story — not just "no data" but an invitation.
 * Uses the official Buster mascot with mood-aware personality + lore fragments.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    FadeIn, useSharedValue, useAnimatedStyle,
    withRepeat, withSequence, withTiming, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import Buster, { BusterMood } from '@/src/components/Buster';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { pickRandom, EMPTY, BUSTER } from '@/src/lore/fragments';

interface EmptyStateProps {
    icon?: React.ReactNode;
    glyph?: string;
    title: string;
    subtitle?: string;
    compact?: boolean;
    busterMood?: BusterMood;
    busterMessage?: string;
    useBuster?: boolean;
}

/** Breathing wrapper — standby projector bulb effect */
function BreathingIcon({ children }: { children: React.ReactNode }) {
    const opacity = useSharedValue(0.4);
    const scale = useSharedValue(0.95);

    useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    return <Animated.View style={[s.iconWrap, style]}>{children}</Animated.View>;
}

export function EmptyState({ icon, glyph = '◈', title, subtitle, compact, busterMood, busterMessage, useBuster = false }: EmptyStateProps) {
    return (
        <Animated.View entering={FadeIn.duration(600)} style={[s.container, compact && s.compact]}>
            {useBuster ? (
                <Buster size={80} mood={busterMood ?? 'neutral'} message={busterMessage} />
            ) : icon ? (
                <BreathingIcon>{icon}</BreathingIcon>
            ) : (
                <BreathingIcon><Text style={s.glyph}>{glyph}</Text></BreathingIcon>
            )}
            <Text style={s.title}>{title}</Text>
            {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
            <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerGlyph}>✦</Text>
                <View style={s.dividerLine} />
            </View>
        </Animated.View>
    );
}

// ── Pre-built variants with Buster + lore poetry ──
// (Six sibling variants — Ledger/Watchlist/Vault/Lists/Reviews/Feed — were
// deleted once their last consumer, the dead ledger route, was removed. Their
// lore copy lives in git history if a future surface wants it.)

export function EmptyOffline() {
    const lore = pickRandom([
        'The transmission has been severed. We are operating in the dark.',
        'No signal from the Society. Hold your ground.',
        'The projector requires a connection. We wait.'
    ]);
    return (
        <EmptyState
            useBuster
            busterMood="crying"
            title="Transmission Interrupted"
            subtitle={lore}
        />
    );
}

const s = StyleSheet.create({
    container: { padding: 48, alignItems: 'center', justifyContent: 'center' },
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
