/**
 * CountryReleases — International release dates with certification badges.
 * Collapsible section matching web's 82-line component.
 */
import { useState, memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Globe } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { formatTMDBDate } from '@/src/utils/timeAgo';

interface ReleaseDate {
    release_date: string;
    type: number;
    certification?: string;
}
interface CountryRelease {
    iso_3166_1: string;
    release_dates: ReleaseDate[];
}
interface ReleaseDatesResponse {
    results: CountryRelease[];
}

const RELEASE_TYPES: Record<number, string> = {
    1: 'PREMIERE', 2: 'LIMITED', 3: 'THEATRICAL', 4: 'DIGITAL', 5: 'PHYSICAL', 6: 'TV',
};

const getDeviceRegion = () => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const parts = locale.split('-');
    if (parts.length > 1) {
      const regionPart = parts[1];
      if (/^[A-Za-z]{2}$/.test(regionPart)) {
        return regionPart.toUpperCase();
      }
    }
    return 'US';
  } catch {
    return 'US';
  }
};

export default memo(function CountryReleases({ releaseDates }: { releaseDates: ReleaseDatesResponse | null }) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const handleToggleOpen = useCallback(() => setOpen(o => !o), []);
    const handleToggleExpanded = useCallback(() => setExpanded(e => !e), []);


    const releases = useMemo(() => {
        const region = getDeviceRegion();
        if (!releaseDates?.results) return [];
        return releaseDates.results
            .filter((r: CountryRelease) => r.release_dates?.some((d: ReleaseDate) => d.type <= 6))
            .sort((a: CountryRelease, b: CountryRelease) => {
                if (a.iso_3166_1 === region) return -1;
                if (b.iso_3166_1 === region) return 1;
                return (a.iso_3166_1 || '').localeCompare(b.iso_3166_1 || '');
            });
    }, [releaseDates]);

    if (!releaseDates?.results?.length) return null;

    if (!releases.length) return null;

    const visible = expanded ? releases : releases.slice(0, 6);

    return (
        <View style={s.card}>
            <PressableScale style={s.header} onPress={handleToggleOpen} haptic="light" hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                <View style={s.headerLeft}>
                    <Globe size={12} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={s.sectionTitle}>INTERNATIONAL RELEASES</Text>
                </View>
                <Text style={[s.toggleText, open && s.toggleActive]}>
                    {open ? '▲ CLOSE' : `▼ ${releases.length} COUNTRIES`}
                </Text>
            </PressableScale>

            {open && (
                <Animated.View entering={FadeIn.duration(300)}>
                    {visible.map(({ iso_3166_1, release_dates }: CountryRelease) => {
                        const mainRelease = release_dates.find((d: ReleaseDate) => d.type === 3) || 
                                            release_dates.find((d: ReleaseDate) => d.type === 4) || 
                                            release_dates.find((d: ReleaseDate) => d.type === 2) || 
                                            release_dates.find((d: ReleaseDate) => d.type === 5) || 
                                            release_dates.find((d: ReleaseDate) => d.type === 1) || 
                                            release_dates.find((d: ReleaseDate) => d.type === 6) || 
                                            release_dates[0];
                        if (!mainRelease?.release_date) return null;
                        const rawDate = mainRelease.release_date;
                        const formattedDate = formatTMDBDate(rawDate, 'long');
                        if (!formattedDate) return null;
                        const cert = mainRelease.certification;
                        return (
                            <View key={iso_3166_1} style={s.row}>
                                <View style={s.rowLeft}>
                                    <Text style={s.countryCode}>{iso_3166_1}</Text>
                                    {cert ? <View style={s.certBadge}><Text style={s.certText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{cert}</Text></View> : null}
                                    <Text style={s.typeText}>{RELEASE_TYPES[mainRelease.type] ?? ''}</Text>
                                </View>
                                <Text style={s.dateText}>
                                    {formattedDate}
                                </Text>
                            </View>
                        );
                    })}

                    {releases.length > 6 && (
                        <PressableScale onPress={handleToggleExpanded} style={s.showMoreBtn} haptic="light" hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                            <Text style={s.showMoreText}>
                                {expanded ? '↑ SHOW LESS' : `↓ ${releases.length - 6} MORE COUNTRIES`}
                            </Text>
                        </PressableScale>
                    )}
                </Animated.View>
            )}
        </View>
    );
})

const s = StyleSheet.create({
    card: {
        padding: 16,
        backgroundColor: 'rgba(8,6,4,0.98)',
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.3)',
        borderRadius: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
    toggleText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },
    toggleActive: { color: colors.sepia },
    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)',
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    countryCode: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 1, color: colors.sepia, minWidth: 28 },
    certBadge: { backgroundColor: 'rgba(139,105,20,0.3)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
    certText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia },
    typeText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },
    dateText: { fontFamily: fonts.body, fontSize: 12, color: colors.bone },
    showMoreBtn: {
        marginTop: 10, paddingVertical: 8,
        borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2,
        alignItems: 'center',
        backgroundColor: 'rgba(8,6,4,0.98)',
    },
    showMoreText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
});
