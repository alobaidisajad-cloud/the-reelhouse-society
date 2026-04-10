import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import Buster from '@/src/components/Buster';
import { RadarChart } from '@/src/components/profile/RadarChart';
import { colors, fonts } from '@/src/theme/theme';

const { width } = Dimensions.get('window');

export function CinemaDNACard({ logs, user, onClose }: { logs: any[]; user: any; onClose: () => void }) {
    if (!logs || logs.length < 5) return null;

    const decades: Record<string, number> = {};
    logs.forEach((log: any) => {
        const year = parseInt(log.year || '2000');
        const decade = `${Math.floor(year / 10) * 10}s`;
        decades[decade] = (decades[decade] || 0) + 1;
    });
    const topDecades = Object.entries(decades).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 3);
    const rated = logs.filter((l: any) => l.rating > 0);
    const avgRating = rated.length ? (rated.reduce((s: number, l: any) => s + l.rating, 0) / rated.length).toFixed(1) : '—';
    const obscurityScore = Math.round(40 + (5 - parseFloat(avgRating || '3')) * 12 + Math.min(logs.length, 30));

    const archetypes = [
        { min: 0, label: 'Initiate' }, { min: 5, label: 'Devotee' }, { min: 15, label: 'Archivist' },
        { min: 30, label: 'Cinephile' }, { min: 60, label: 'Obsessive' }, { min: 100, label: 'The Oracle' },
    ];
    const archetype = archetypes.filter(a => logs.length >= a.min).pop()?.label || 'Initiate';
    const tones = parseFloat(avgRating) >= 4 ? 'Romanticism' : parseFloat(avgRating) >= 3 ? 'Realism' : parseFloat(avgRating) >= 2 ? 'Dark Romanticism' : 'Nihilism';

    const autopsies = logs.filter((l: any) => l.isAutopsied && l.autopsy).map((l: any) => l.autopsy);
    let avgAutopsy: { story: number; cinematography: number; sound: number } | null = null;
    if (autopsies.length > 0) {
        avgAutopsy = {
            story: Math.round(autopsies.reduce((s: number, a: any) => s + (a.story || a.screenplay || a.script || 0), 0) / autopsies.length),
            cinematography: Math.round(autopsies.reduce((s: number, a: any) => s + (a.cinematography || a.visuals || a.acting || 0), 0) / autopsies.length),
            sound: Math.round(autopsies.reduce((s: number, a: any) => s + (a.sound || a.score || a.editing || 0), 0) / autopsies.length),
        };
    }

    return (
        <Animated.View entering={FadeInDown} exiting={FadeOut} style={s.overlay}>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                <X size={16} color={colors.parchment} />
            </TouchableOpacity>

            <View style={s.card}>
                <View style={s.grainOverlay} />
                
                <View style={s.header}>
                    <View style={s.avatarWrap}>
                        <Buster size={24} mood="smiling" />
                    </View>
                    <View>
                        <Text style={s.username}>@{user?.username || 'cinephile'}</Text>
                        <Text style={s.subtext}>THE REELHOUSE SOCIETY</Text>
                    </View>
                </View>

                <View style={s.titleWrap}>
                    <Text style={s.eyebrow}>CINEMATIC FINGERPRINT</Text>
                    <Text style={s.title}>CINEMA DNA</Text>
                </View>

                <View style={s.archetypeWrap}>
                    <Text style={s.archetypeLabel}>{archetype}</Text>
                    <Text style={s.archetypeSub}>SCHOOL OF {tones.toUpperCase()}</Text>
                </View>

                {avgAutopsy && (
                    <View style={s.radarWrap}>
                        <RadarChart autopsy={avgAutopsy} size={120} />
                    </View>
                )}

                <View style={s.statsGrid}>
                    <View style={s.statBox}>
                        <Text style={s.statVal}>{logs.length}</Text>
                        <Text style={s.statLabel}>FILMS</Text>
                    </View>
                    <View style={s.statBox}>
                        <Text style={s.statVal}>{avgRating}</Text>
                        <Text style={s.statLabel}>AVG RATING</Text>
                    </View>
                </View>

                <View style={s.decadesWrap}>
                    <Text style={s.sectionEyebrow}>DOMINANT ERAS</Text>
                    <View style={s.decadesRow}>
                        {topDecades.map(([decade, count]: any) => {
                            const pct = Math.round((count / logs.length) * 100);
                            return (
                                <View key={decade} style={s.decadeBox}>
                                    <Text style={s.decadeLabel}>{decade}</Text>
                                    <Text style={s.decadePct}>{pct}%</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                <View style={s.obscurityWrap}>
                    <Text style={s.obscurityLabel}>OBSCURITY INDEX</Text>
                    <Text style={s.obscurityVal}>{obscurityScore}</Text>
                </View>

                <View style={s.footer}>
                    <Text style={s.logo}>REELHOUSE</Text>
                    <Text style={s.footerSub}>CASE №{String(logs.length).padStart(4, '0')}</Text>
                </View>
            </View>
        </Animated.View>
    );
}

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
        width: width * 0.85,
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
    avatarWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ash, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.sepia },
    username: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.parchment },
    subtext: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia, marginTop: 2 },
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
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.ash, paddingTop: 16 },
    logo: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia },
    footerSub: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, letterSpacing: 1, textAlign: 'right' }
});
