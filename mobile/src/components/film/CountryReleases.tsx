/**
 * CountryReleases — International release dates with certification badges.
 * Collapsible section matching web's 82-line component.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

const RELEASE_TYPES: Record<number, string> = {
    1: 'PREMIERE', 2: 'LIMITED', 3: 'THEATRICAL', 4: 'DIGITAL', 5: 'PHYSICAL', 6: 'TV',
};

export default function CountryReleases({ releaseDates }: { releaseDates: any }) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);

    if (!releaseDates?.results?.length) return null;

    const releases = releaseDates.results
        .filter((r: any) => r.release_dates?.some((d: any) => d.type <= 3))
        .sort((a: any, b: any) => {
            if (a.iso_3166_1 === 'US') return -1;
            if (b.iso_3166_1 === 'US') return 1;
            return a.iso_3166_1.localeCompare(b.iso_3166_1);
        });

    if (!releases.length) return null;

    const visible = expanded ? releases : releases.slice(0, 6);

    return (
        <View style={s.card}>
            <TouchableOpacity style={s.header} onPress={() => setOpen(!open)} activeOpacity={0.7}>
                <Text style={s.sectionTitle}>🌍 INTERNATIONAL RELEASES</Text>
                <Text style={[s.toggleText, open && { color: colors.sepia }]}>
                    {open ? '▲ CLOSE' : `▼ ${releases.length} COUNTRIES`}
                </Text>
            </TouchableOpacity>

            {open && (
                <Animated.View entering={FadeIn.duration(300)}>
                    {visible.map(({ iso_3166_1, release_dates }: any) => {
                        const mainRelease = release_dates.find((d: any) => d.type === 3) || release_dates[0];
                        if (!mainRelease?.release_date) return null;
                        const date = new Date(mainRelease.release_date);
                        const cert = mainRelease.certification;
                        return (
                            <View key={iso_3166_1} style={s.row}>
                                <View style={s.rowLeft}>
                                    <Text style={s.countryCode}>{iso_3166_1}</Text>
                                    {cert ? <View style={s.certBadge}><Text style={s.certText}>{cert}</Text></View> : null}
                                    <Text style={s.typeText}>{RELEASE_TYPES[mainRelease.type] || ''}</Text>
                                </View>
                                <Text style={s.dateText}>
                                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </Text>
                            </View>
                        );
                    })}

                    {releases.length > 6 && (
                        <TouchableOpacity onPress={() => setExpanded(!expanded)} style={s.showMoreBtn}>
                            <Text style={s.showMoreText}>
                                {expanded ? '↑ SHOW LESS' : `↓ ${releases.length - 6} MORE COUNTRIES`}
                            </Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { padding: 16, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
    toggleText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },
    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.04)',
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    countryCode: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 1, color: colors.sepia, minWidth: 28 },
    certBadge: { backgroundColor: colors.fog, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
    certText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.ink },
    typeText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.ash },
    dateText: { fontFamily: fonts.body, fontSize: 12, color: colors.bone },
    showMoreBtn: {
        marginTop: 10, paddingVertical: 8, borderWidth: 1,
        borderStyle: 'dashed', borderColor: colors.ash, borderRadius: 2, alignItems: 'center',
    },
    showMoreText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
});
