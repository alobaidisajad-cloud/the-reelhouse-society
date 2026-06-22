import React, { memo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import TactileEngine from '@/src/utils/TactileEngine';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Buster from '@/src/components/Buster';
import { RadarChart } from '@/src/components/profile/RadarChart';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '../PressableScale';

import type { ProfileAnalyticsPayload } from './NoirPassport';

interface DNALog {
    year?: number | string;
    rating: number;
    isAutopsied?: boolean;
    autopsy?: Record<string, number> | null;
}

interface DNAUser {
    username?: string;
}

export const CinemaDNACard = memo(function CinemaDNACard({ logs, user, analytics, onClose }: { logs: DNALog[]; user: DNAUser; analytics?: ProfileAnalyticsPayload | null; onClose: () => void }) {
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    
    // Always calculate total count from either analytics or logs
    const totalCount = analytics?.stamps?.total_logs ?? logs?.length ?? 0;
    if (totalCount < 5) return null;

    let topDecades: [string, number][] = [];
    let avgRatingStr = '—';
    let avgRatingNum = 0;
    let avgAutopsy: { story: number; cinematography: number; sound: number } | null = null;

    if (analytics?.dna) {
        // Phase 3: Server-side pre-computed
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
    } else {
        // Fallback: Client-side O(N) computation
        const decades: Record<string, number> = {};
        logs.forEach((log) => {
            if (!log.year) return;
            const year = parseInt(String(log.year), 10);
            if (isNaN(year)) return;
            const decade = `${Math.floor(year / 10) * 10}s`;
            decades[decade] = (decades[decade] ?? 0) + 1;
        });
        topDecades = Object.entries(decades).sort((a, b) => b[1] - a[1]).slice(0, 3);
        
        const rated = logs.filter((l) => l.rating > 0);
        avgRatingNum = rated.length ? rated.reduce((s, l) => s + l.rating, 0) / rated.length : 0;
        avgRatingStr = rated.length ? avgRatingNum.toFixed(1) : '—';
        
        const autopsies = logs.filter((l) => l.isAutopsied && l.autopsy).map((l) => l.autopsy!);
        if (autopsies.length > 0) {
            avgAutopsy = {
                story: Math.round(autopsies.reduce((s, a) => s + (a.story ?? a.screenplay ?? a.script ?? 0), 0) / autopsies.length),
                cinematography: Math.round(autopsies.reduce((s, a) => s + (a.cinematography ?? a.visuals ?? a.acting ?? 0), 0) / autopsies.length),
                sound: Math.round(autopsies.reduce((s, a) => s + (a.sound ?? a.score ?? a.editing ?? 0), 0) / autopsies.length),
            };
        }
    }

    const obscurityScore = Math.round(40 + (5 - (avgRatingNum || 3)) * 12 + Math.min(totalCount, 30));

    const archetypes = [
        { min: 0, label: 'Initiate' }, { min: 5, label: 'Devotee' }, { min: 15, label: 'Archivist' },
        { min: 30, label: 'Cinephile' }, { min: 60, label: 'Obsessive' }, { min: 100, label: 'The Oracle' },
    ];
    const archetype = archetypes.filter(a => totalCount >= a.min).pop()?.label ?? 'Initiate';
    const tones = avgRatingNum >= 4 ? 'Romanticism' : avgRatingNum >= 3 ? 'Realism' : avgRatingNum >= 2 ? 'Dark Romanticism' : 'Nihilism';

    return (
        <Animated.View entering={FadeInDown} exiting={FadeOut} style={s.overlay}>
            <PressableScale onPress={() => { onClose(); }} style={[s.closeBtn, { top: Math.max(insets.top + 10, 40) }]} hitSlop={{top:15,bottom:15,left:15,right:15}} haptic>
                <X size={16} color={colors.parchment} />
            </PressableScale>

            <View style={[s.card, { width: windowWidth * 0.85 }]}>
                <View style={s.grainOverlay} />
                
                <View style={s.header}>
                    <View style={s.avatarWrap}>
                        <Buster size={24} mood="smiling" />
                    </View>
                    <View style={s.userInfoWrap}>
                        <Text style={s.username} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>@{user?.username ?? 'cinephile'}</Text>
                        <Text style={s.subtext} numberOfLines={1}>THE REELHOUSE SOCIETY</Text>
                    </View>
                </View>

                <View style={s.titleWrap}>
                    <Text style={s.eyebrow}>CINEMATIC FINGERPRINT</Text>
                    <Text style={s.title}>CINEMA DNA</Text>
                </View>

                <View style={s.archetypeWrap}>
                    <Text style={s.archetypeLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{archetype}</Text>
                    <Text style={s.archetypeSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SCHOOL OF {tones.toUpperCase()}</Text>
                </View>

                {avgAutopsy && (
                    <View style={s.radarWrap}>
                        <RadarChart autopsy={avgAutopsy} size={120} />
                    </View>
                )}

                <View style={s.statsGrid}>
                    <View style={s.statBox}>
                        <Text style={s.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{totalCount}</Text>
                        <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>FILMS</Text>
                    </View>
                    <View style={s.statBox}>
                        <Text style={s.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{avgRatingStr}</Text>
                        <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>AVG RATING</Text>
                    </View>
                </View>

                <View style={s.decadesWrap}>
                    <Text style={s.sectionEyebrow}>DOMINANT ERAS</Text>
                    <View style={s.decadesRow}>
                        {topDecades.length > 0 ? (
                            topDecades.map(([decade, count]) => {
                                const pct = Math.round((count / Math.max(totalCount, 1)) * 100);
                                return (
                                    <View key={decade} style={s.decadeBox}>
                                        <Text style={s.decadeLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{decade}</Text>
                                        <Text style={s.decadePct} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{pct}%</Text>
                                    </View>
                                );
                            })
                        ) : (
                            <View style={[s.decadeBox, { opacity: 0.5 }]}>
                                <Text style={s.decadeLabel}>UNKNOWN</Text>
                                <Text style={s.decadePct}>—</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={s.obscurityWrap}>
                    <Text style={s.obscurityLabel}>OBSCURITY INDEX</Text>
                    <Text style={s.obscurityVal}>{obscurityScore}</Text>
                </View>

                <View style={s.footer}>
                    <Text style={s.logo}>REELHOUSE</Text>
                    <Text style={s.footerSub}>CASE №{String(totalCount).padStart(4, '0')}</Text>
                </View>
            </View>
        </Animated.View>
    );
});

const s = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10, 7, 3, 0.95)',
        zIndex: 100005,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtn: { position: 'absolute', top: 40, right: 20, zIndex: 100006, padding: 10 },
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
        backgroundColor: 'rgba(139,105,20,0.02)',
        zIndex: -1,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
    avatarWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#050402', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.sepia },
    username: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.parchment },
    subtext: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia, marginTop: 2 },
    userInfoWrap: { flex: 1, paddingRight: 10 },
    titleWrap: { alignItems: 'center', marginBottom: 16 },
    eyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
    title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment },
    archetypeWrap: { alignItems: 'center', padding: 10, backgroundColor: 'rgba(139,105,20,0.1)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', marginBottom: 16 },
    archetypeLabel: { fontFamily: fonts.sub, fontSize: 16, color: colors.parchment },
    archetypeSub: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginTop: 4 },
    radarWrap: { alignItems: 'center', marginBottom: 16 },
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    statBox: { flex: 1, alignItems: 'center', padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    statVal: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment },
    statLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog, marginTop: 4 },
    decadesWrap: { marginBottom: 'auto' },
    sectionEyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 8 },
    decadesRow: { flexDirection: 'row', gap: 8 },
    decadeBox: { flex: 1, padding: 8, backgroundColor: 'rgba(139,105,20,0.06)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', alignItems: 'center' },
    decadeLabel: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    decadePct: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia },
    obscurityWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.15)', paddingVertical: 10, marginBottom: 10 },
    obscurityLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
    obscurityVal: { fontFamily: fonts.display, fontSize: 24, color: colors.sepia },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.15)', paddingTop: 16 },
    logo: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia },
    footerSub: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, letterSpacing: 1, textAlign: 'right' }
});
