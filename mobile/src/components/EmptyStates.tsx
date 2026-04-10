/**
 * EmptyStates — Themed cinematic empty state displays.
 * Used across tabs when no data is available.
 */
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

interface EmptyStateProps {
    glyph?: string;
    title: string;
    subtitle?: string;
    compact?: boolean;
}

export function EmptyState({ glyph = '◈', title, subtitle, compact }: EmptyStateProps) {
    return (
        <Animated.View entering={FadeIn.duration(600)} style={[s.container, compact && s.compact]}>
            <Text style={s.glyph}>{glyph}</Text>
            <Text style={s.title}>{title}</Text>
            {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
        </Animated.View>
    );
}

// Pre-built variants
export function EmptyLedger() {
    return <EmptyState glyph="📽" title="No Films Logged Yet" subtitle="Start building your archive by logging your first film." />;
}

export function EmptyWatchlist() {
    return <EmptyState glyph="✦" title="Watchlist Empty" subtitle="Save films you want to watch — the Archive remembers all." />;
}

export function EmptyVault() {
    return <EmptyState glyph="▣" title="Vault Sealed" subtitle="Your vault awaits. Add films to your collection." />;
}

export function EmptyLists() {
    return <EmptyState glyph="▤" title="No Lists Curated" subtitle="Create your first curated list and share your taste." />;
}

export function EmptyReviews() {
    return <EmptyState glyph="†" title="No Reviews Written" subtitle="Your critical voice awaits. Review a film to begin." />;
}

export function EmptyFeed() {
    return <EmptyState glyph="◎" title="The Feed Is Quiet" subtitle="Follow other archivists to see their activity here." />;
}

const s = StyleSheet.create({
    container: { padding: 48, alignItems: 'center', justifyContent: 'center' },
    compact: { padding: 24 },
    glyph: { fontSize: 40, marginBottom: 16, opacity: 0.5 },
    title: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
