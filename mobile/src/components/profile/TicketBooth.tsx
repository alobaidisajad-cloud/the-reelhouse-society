/**
 * TicketBooth — Decorative ticket-style display for profile.
 */
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

interface TicketBoothProps {
    username: string;
    memberSince?: string;
    filmCount?: number;
}

export function TicketBooth({ username, memberSince, filmCount = 0 }: TicketBoothProps) {
    const since = memberSince ? new Date(memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';

    return (
        <Animated.View entering={FadeIn.duration(500)} style={s.container}>
            {/* Ticket perforations */}
            <View style={s.perfRow}>
                {Array.from({ length: 12 }).map((_, i) => (
                    <View key={i} style={s.perfDot} />
                ))}
            </View>

            <View style={s.ticketBody}>
                <Text style={s.eyebrow}>THE REELHOUSE SOCIETY</Text>
                <Text style={s.nameText}>@{username}</Text>

                <View style={s.ticketRow}>
                    <View style={s.ticketField}>
                        <Text style={s.fieldLabel}>ADMIT</Text>
                        <Text style={s.fieldValue}>ONE</Text>
                    </View>
                    <View style={s.ticketField}>
                        <Text style={s.fieldLabel}>SINCE</Text>
                        <Text style={s.fieldValue}>{since}</Text>
                    </View>
                    <View style={s.ticketField}>
                        <Text style={s.fieldLabel}>SCREENINGS</Text>
                        <Text style={s.fieldValue}>{filmCount}</Text>
                    </View>
                </View>
            </View>

            {/* Bottom perforations */}
            <View style={s.perfRow}>
                {Array.from({ length: 12 }).map((_, i) => (
                    <View key={i} style={s.perfDot} />
                ))}
            </View>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: {
        marginHorizontal: 16, marginVertical: 8,
        backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.sepia,
        borderRadius: 4, overflow: 'hidden',
    },
    perfRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4, backgroundColor: 'rgba(139,105,20,0.05)' },
    perfDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink },
    ticketBody: { padding: 20, alignItems: 'center' },
    eyebrow: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 4, color: colors.sepia, opacity: 0.6, marginBottom: 8 },
    nameText: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 16 },
    ticketRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
    ticketField: { alignItems: 'center' },
    fieldLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog, marginBottom: 4 },
    fieldValue: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia },
});
