/**
 * EmptyStates — Themed cinematic empty state displays.
 * Used across tabs when no data is available.
 * 
 * Each empty state tells a story — not just "no data" but an invitation.
 * Uses the official Buster mascot with mood-aware personality + lore fragments.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    FadeIn, useSharedValue, useAnimatedStyle,
    withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import Buster, { BusterMood } from '@/src/components/Buster';
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
        opacity.value = withRepeat(
            withSequence(
                withTiming(0.7, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            ), -1, true
        );
        scale.value = withRepeat(
            withSequence(
                withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.95, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            ), -1, true
        );
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

export function EmptyLedger() {
    const lore = useMemo(() => pickRandom([
        'The ledger is empty. Buster is staring at you. He\'s not angry. He\'s disappointed.',
        'Every great archivist begins with a single entry.',
        'The ink is dry. The pen awaits your hand.',
    ]), []);
    return (
        <EmptyState
            useBuster
            busterMood="peeking"
            title="The Ledger Awaits"
            subtitle={lore}
        />
    );
}

export function EmptyWatchlist() {
    const lore = useMemo(() => pickRandom([
        'Nothing queued? Even the founding members had a backlog.',
        'Save films you intend to watch — the Archive remembers what you haven\'t seen yet.',
        'Your future screenings list stands empty. For now.',
    ]), []);
    return (
        <EmptyState
            useBuster
            busterMood="smiling"
            title="The Queue Is Empty"
            subtitle={lore}
        />
    );
}

export function EmptyVault() {
    const lore = useMemo(() => pickRandom([
        'Your vault stands ready. The first addition is the hardest.',
        'This shelf is bare. Every great collection starts with one.',
        'The vault has never been breached. It just needs filling.',
    ]), []);
    return (
        <EmptyState
            useBuster
            busterMood="neutral"
            title="The Vault Is Sealed"
            subtitle={lore}
        />
    );
}

export function EmptyLists() {
    const lore = useMemo(() => pickRandom([
        'A stack is not a list. It is a thesis. Write yours.',
        'Curate your first stack — a collection of films that tells your story.',
        'The Society\'s shelves are organized by devotion, not alphabet.',
    ]), []);
    return (
        <EmptyState
            useBuster
            busterMood="thinking"
            title="No Stacks Curated"
            subtitle={lore}
        />
    );
}

export function EmptyReviews() {
    const lore = useMemo(() => pickRandom([
        'Your voice has weight here. The tribunal awaits your first critique.',
        'All critiques are permanent. Choose your words with care.',
        'The critic\'s chair is warm. Someone was here before you.',
    ]), []);
    return (
        <EmptyState
            useBuster
            busterMood="thinking"
            title="The Critic's Chair Is Empty"
            subtitle={lore}
        />
    );
}

export function EmptyFeed() {
    const lore = useMemo(() => pickRandom([
        'The foyer is quiet tonight. The portraits on the wall are watching.',
        'Follow fellow archivists to see their screenings and discoveries.',
        'No dispatches have arrived yet. The courier is en route.',
    ]), []);
    return (
        <EmptyState
            useBuster
            busterMood="sleeping"
            title="The Foyer Is Quiet"
            subtitle={lore}
        />
    );
}

export function EmptyOffline() {
    const lore = useMemo(() => pickRandom([
        'The transmission has been severed. We are operating in the dark.',
        'No signal from the Society. Hold your ground.',
        'The projector requires a connection. We wait.'
    ]), []);
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
