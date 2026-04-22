import React from 'react';
import { View, ScrollView, Text, Image, StyleSheet } from 'react-native';
import { Disc, Film as FilmIcon } from 'lucide-react-native';
import { colors, fonts } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import { useRouter } from 'expo-router';
import type { ProfileVaultItem, FormatCount } from '../../types';
import PressableScale from '../PressableScale';

interface ProfilePhysicalTabProps {
  isSelf: boolean;
  vault: ProfileVaultItem[];
  physicalFilter: string | null;
  setPhysicalFilter: (val: string | null) => void;
  physicalFormatCounts: FormatCount[];
  physicalFiltered: ProfileVaultItem[];
  groupByMonth: (items: ProfileVaultItem[], dateKey?: string) => Record<string, ProfileVaultItem[]>;
}

const SEPIA_HASH = "L9D]2+?]00Mw%iRjIUj]~W00D%~W";

export default function ProfilePhysicalTab({
  isSelf,
  vault,
  physicalFilter,
  setPhysicalFilter,
  physicalFormatCounts,
  physicalFiltered,
  groupByMonth
}: ProfilePhysicalTabProps) {
  const router = useRouter();

  return (
    <View style={s.tabContentPad}>
      {physicalFormatCounts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScrollMargin} contentContainerStyle={s.filterChipRowTight}>
          <PressableScale 
            style={[s.filterChip, !physicalFilter && s.filterChipActive]} 
            onPress={() => setPhysicalFilter(null)} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            haptic
          >
            <Text style={[s.filterChipText, !physicalFilter && s.filterChipTextActive]}>ALL ({vault.length})</Text>
          </PressableScale>
          {physicalFormatCounts.map((f: FormatCount) => (
            <PressableScale 
              key={f.id} 
              style={[s.filterChip, physicalFilter === f.id && { borderColor: f.color, backgroundColor: `${f.color}15` }]} 
              onPress={() => setPhysicalFilter(physicalFilter === f.id ? null : f.id)} 
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              haptic
            >
              <Text style={[s.filterChipText, physicalFilter === f.id && { color: f.color }]}>
                {f.label} ({f.count})
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
      )}
      {physicalFiltered.length === 0 ? (
        <View style={s.emptyState}>
          <Disc size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
          <Text style={s.emptyTitle}>Physical Archive is Empty</Text>
          <Text style={s.emptyDesc}>{isSelf ? 'No physical media catalogued yet.' : 'No physical media.'}</Text>
        </View>
      ) : (
        <View style={s.tabGap}>
          {Object.entries(groupByMonth(physicalFiltered, 'created_at')).map(([month, items]) => (
            <View key={month}>
              <Text style={s.monthHeader}>{month}</Text>
              <View style={s.grid4}>
                {(items as ProfileVaultItem[]).map((item: ProfileVaultItem) => {
                  const posterUri = tmdb.poster(item.poster_path, 'w185');
                  const fmt = (item.formats || [])[0];
                  const FC: Record<string, string> = { '4k': '#a855f7', bluray: '#3b82f6', dvd: '#f59e0b', vhs: '#ef4444', laserdisc: '#10b981', steelbook: '#6366f1', criterion: colors.sepia };
                  const FL: Record<string, string> = { '4k': '4K', bluray: 'BD', dvd: 'DVD', vhs: 'VHS', laserdisc: 'LD', steelbook: 'SB', criterion: 'CC' };
                  return (
                    <PressableScale 
                      key={item.id} 
                      style={s.posterCardWrap} 
                      onPress={() => item.film_id && router.push(`/film/${item.film_id}`)}
                      haptic
                    >
                      {posterUri ? (
                        <Image source={{ uri: posterUri }} style={s.posterImg} />
                      ) : (
                        <View style={[s.posterImg, s.posterPlaceholder]}>
                          <FilmIcon size={14} color={colors.sepia} strokeWidth={1} />
                        </View>
                      )}
                      {fmt && (
                        <View style={[s.formatBadge, { borderColor: FC[fmt] || colors.sepia }]}>
                          <Text style={[s.formatBadgeText, { color: FC[fmt] || colors.sepia }]}>
                            {FL[fmt] || fmt.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tabContentPad: { paddingHorizontal: 16, paddingTop: 16 },
  filterScrollMargin: { marginBottom: 20 },
  filterChipRowTight: { gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', backgroundColor: 'transparent' },
  filterChipActive: { backgroundColor: 'rgba(139,105,20,0.1)', borderColor: 'rgba(139,105,20,0.4)' },
  filterChipText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', backgroundColor: 'rgba(8,6,4,0.98)' },
  emptyLockIcon: { marginBottom: 16, opacity: 0.6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, fontStyle: 'italic', textAlign: 'center', lineHeight: 16 },
  tabGap: { gap: 32 },
  monthHeader: { fontFamily: 'Courier', fontSize: 12, letterSpacing: 6, color: colors.sepia, opacity: 0.6, marginBottom: 12, paddingHorizontal: 4 },
  grid4: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  posterCardWrap: { position: 'relative', width: '23%', aspectRatio: 2 / 3, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#3A2E1C', backgroundColor: '#050402' },
  posterImg: { width: '100%', height: '100%' },
  posterPlaceholder: { backgroundColor: 'rgba(18,14,9,0.7)', justifyContent: 'center', alignItems: 'center' },
  formatBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(5,4,3,0.95)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  formatBadgeText: { fontFamily: fonts.uiBold, fontSize: 7, letterSpacing: 1 },
});
