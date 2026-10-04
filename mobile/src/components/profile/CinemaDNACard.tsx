import React, { memo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { portraitInitial } from '@/src/components/profile/portraitInitial';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { RadarChart } from '@/src/components/profile/RadarChart';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '../PressableScale';

import type { ProfileAnalyticsPayload } from './NoirPassport';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { standingFor } from '@/src/constants/standing';
import { RoomRetrieving, RoomUnreachable } from './RoomParts';

/** A reading needs this many films before it says anything. */
const DNA_FLOOR = 5;

interface DNAUser {
    username?: string;
    persona?: string | null;
    display_name?: string | null;
    member_no?: number | null;
    avatar_url?: string | null;
}

/**
 * The Cinema DNA card, read from the member's whole record (the server's
 * summary). Until that record is read it says so; below five films it says
 * how many a reading needs. It always opens, and always closes.
 */
export const CinemaDNACard = memo(function CinemaDNACard({ user, analytics, failed, onRetry, onClose }: {
    user: DNAUser;
    analytics?: ProfileAnalyticsPayload | null;
    /** The record's read failed. */
    failed?: boolean;
    onRetry?: () => void;
    onClose: () => void;
}) {
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();

    const stamps = analytics?.stamps;
    const totalCount = stamps?.total_logs ?? 0;

    const close = (
        <PressableScale onPress={() => { onClose(); }} style={[s.closeBtn, { top: Math.max(insets.top + 10, 40) }]} hitSlop={{top:15,bottom:15,left:15,right:15}} haptic accessibilityRole="button" accessibilityLabel="Close cinema DNA">
            <X size={16} color={colors.parchment} />
        </PressableScale>
    );
    if (!stamps || totalCount < DNA_FLOOR) {
        // Shown at once (no entrance of its own): only the full reading arrives.
        return (
            <View style={s.overlay}>
                {close}
                <View style={[s.card, s.cardPlain, { width: windowWidth * 0.85 }]}>
                    <Text {...scaledTextProps} style={s.eyebrow}>CINEMATIC FINGERPRINT</Text>
                    <Text {...scaledTextProps} style={s.title}>CINEMA DNA</Text>
                    {!stamps
                        ? (failed || analytics
                            ? <RoomUnreachable room="the reading" onRetry={onRetry ?? (() => {})} />
                            : <RoomRetrieving room="the reading" />)
                        : <Text {...scaledTextProps} style={s.plainLine}>{`A reading needs ${DNA_FLOOR} films; ${totalCount} ${totalCount === 1 ? 'is' : 'are'} logged.`}</Text>}
                </View>
            </View>
        );
    }

    let topDecades: [string, number][] = [];
    let avgRatingStr = '—';
    let avgRatingNum = 0;
    let avgAutopsy: { story: number; cinematography: number; sound: number } | null = null;

    if (analytics?.dna) {
        const d = analytics.dna;
        avgRatingNum = d.avg_rating ?? 0;
        avgRatingStr = d.avg_rating ? Number(d.avg_rating).toFixed(1) : '—';
        if (d.top_decades && Array.isArray(d.top_decades)) {
            topDecades = d.top_decades.map((td: Record<string, number>) => {
                const entries = Object.entries(td);
                return entries.length > 0 ? entries[0] : null;
            }).filter(Boolean) as [string, number][];
        }
        if (analytics.autopsy_math?.avg_story !== undefined) {
            avgAutopsy = {
                story: Math.round(analytics.autopsy_math.avg_story || 0),
                cinematography: Math.round(analytics.autopsy_math.avg_cinematography || 0),
                sound: Math.round(analytics.autopsy_math.avg_sound || 0),
            };
        }
    }

    // The film page's obscurity mark, averaged over the member's films the
    // house has read (get_public_profile_analytics); none read yet, none said.
    const measured = analytics?.dna?.obscurity_index;
    const obscurityIndex = typeof measured === 'number' ? String(measured) : '—';

    // The house's one ladder (the Projector's STANDING), never a second one
    // that borrows the paid ranks' names.
    const archetype = standingFor(totalCount).name;
    const tones = avgRatingNum >= 4 ? 'Romanticism' : avgRatingNum >= 3 ? 'Realism' : avgRatingNum >= 2 ? 'Dark Romanticism' : 'Nihilism';

    return (
        <Animated.View entering={FadeInDown} exiting={FadeOut} style={s.overlay}>
            {close}

            <View style={[s.card, { width: windowWidth * 0.85 }]}>
                <View style={s.grainOverlay} />

                <View style={s.header}>
                    {/* The member's real portrait; without one, the letter their file shows */}
                    <View style={s.avatarWrap}>
                        {user?.avatar_url ? (
                            <Image source={{ uri: user.avatar_url }} style={s.avatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                        ) : (
                            <Text {...decorativeTextProps} {...UNSPOKEN} style={s.avatarInitial}>{portraitInitial(user)}</Text>
                        )}
                    </View>
                    <View style={s.userInfoWrap}>
                        <Text {...scaledTextProps} style={s.username} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>@{user?.username ?? 'cinephile'}</Text>
                        <Text {...scaledTextProps} style={s.subtext} numberOfLines={1}>THE REELHOUSE SOCIETY</Text>
                    </View>
                </View>

                <View style={s.titleWrap}>
                    <Text {...scaledTextProps} style={s.eyebrow}>CINEMATIC FINGERPRINT</Text>
                    <Text {...scaledTextProps} style={s.title}>CINEMA DNA</Text>
                </View>

                <View style={s.archetypeWrap}>
                    <Text {...scaledTextProps} style={s.archetypeLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{archetype}</Text>
                    <Text {...scaledTextProps} style={s.archetypeSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SCHOOL OF {tones.toUpperCase()}</Text>
                </View>

                {avgAutopsy && (
                    <View style={s.radarWrap}>
                        <RadarChart autopsy={avgAutopsy} size={120} />
                    </View>
                )}

                <View style={s.statsGrid}>
                    <View style={s.statBox}>
                        <Text {...scaledTextProps} style={s.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{totalCount}</Text>
                        <Text {...scaledTextProps} style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>FILMS</Text>
                    </View>
                    <View style={s.statBox}>
                        <Text {...scaledTextProps} style={s.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{avgRatingStr}</Text>
                        <Text {...scaledTextProps} style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>AVG RATING</Text>
                    </View>
                </View>

                <View style={s.decadesWrap}>
                    <Text {...scaledTextProps} style={s.sectionEyebrow}>DOMINANT ERAS</Text>
                    <View style={s.decadesRow}>
                        {topDecades.length > 0 ? (
                            topDecades.map(([decade, count]) => {
                                const pct = Math.round((count / Math.max(totalCount, 1)) * 100);
                                return (
                                    <View key={decade} style={s.decadeBox}>
                                        <Text {...scaledTextProps} style={s.decadeLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{decade}</Text>
                                        <Text {...scaledTextProps} style={s.decadePct} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{pct}%</Text>
                                    </View>
                                );
                            })
                        ) : (
                            <View style={[s.decadeBox, { opacity: 0.5 }]}>
                                <Text {...scaledTextProps} style={s.decadeLabel}>UNKNOWN</Text>
                                <Text {...scaledTextProps} style={s.decadePct}>—</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={s.obscurityWrap}>
                    <Text {...scaledTextProps} style={s.obscurityLabel}>OBSCURITY INDEX</Text>
                    <Text {...scaledTextProps} style={s.obscurityVal}>{obscurityIndex}</Text>
                </View>

                <View style={s.footer}>
                    <Text {...scaledTextProps} style={s.logo}>REELHOUSE</Text>
                    {/* The member's real serial; with none on file, none is invented. */}
                    {!!user?.member_no && (
                        <Text {...scaledTextProps} style={s.footerSub}>
                            {`MEMBER Nº ${String(user.member_no).padStart(4, '0')}`}
                        </Text>
                    )}
                </View>
            </View>
        </Animated.View>
    );
});

const s = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.ink,
        zIndex: 100005,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtn: { position: 'absolute', top: 40, right: 20, zIndex: 100006, padding: 10 },
    cardPlain: { aspectRatio: undefined, gap: 16, alignItems: 'center' },
    plainLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.bone, textAlign: 'center' },
    card: {
        aspectRatio: 9/16,
        backgroundColor: colors.ink,
        borderColor: colors.sepia,
        borderWidth: 1,
        padding: 20,
        overflow: 'hidden',
    },
    grainOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(184,137,26,0.02)',
        zIndex: -1,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
    avatarWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.inkwell, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.sepia, overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%' },
    avatarInitial: { fontFamily: fonts.display, fontSize: 16, color: 'rgba(232,223,208,0.28)' },
    username: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.parchment },
    subtext: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.5, color: colors.sepia, marginTop: 2 },
    userInfoWrap: { flex: 1, paddingRight: 10 },
    titleWrap: { alignItems: 'center', marginBottom: 16 },
    eyebrow: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 8 },
    title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment },
    archetypeWrap: { alignItems: 'center', padding: 10, backgroundColor: 'rgba(184,137,26,0.1)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', marginBottom: 16 },
    archetypeLabel: { fontFamily: fonts.sub, fontSize: 16, color: colors.parchment },
    archetypeSub: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginTop: 4 },
    radarWrap: { alignItems: 'center', marginBottom: 16 },
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    statBox: { flex: 1, alignItems: 'center', padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    statVal: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment },
    statLabel: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2, color: colors.fog, marginTop: 4 },
    decadesWrap: { marginBottom: 'auto' },
    sectionEyebrow: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 8 },
    decadesRow: { flexDirection: 'row', gap: 8 },
    decadeBox: { flex: 1, padding: 8, backgroundColor: 'rgba(184,137,26,0.06)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)', alignItems: 'center' },
    decadeLabel: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    decadePct: { fontFamily: fonts.sub, fontSize: 10, color: colors.sepia },
    obscurityWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.15)', paddingVertical: 10, marginBottom: 10 },
    obscurityLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog },
    obscurityVal: { fontFamily: fonts.display, fontSize: 24, color: colors.sepia },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.15)', paddingTop: 16 },
    logo: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia },
    footerSub: { fontFamily: fonts.sub, fontSize: 8, color: colors.sepia, letterSpacing: 1.5, textAlign: 'right' }
});
