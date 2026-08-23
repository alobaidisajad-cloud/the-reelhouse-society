import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { Film as FilmIcon } from 'lucide-react-native';
import { colors, fonts } from '../../theme/theme';
import PressableScale from '../PressableScale';
import type { ProfileLog } from '../../types';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, ReduceMotion } from 'react-native-reanimated';
import VaultLock from './VaultLock';
import { useAuthStore } from '@/src/stores/auth';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { r, posterColumns, completeCount, countLabel } from './roomStyles';
import { RoomChip, RoomRail, RoomRetrieving, RoomEmpty, RoomFoot } from './RoomParts';

/**
 * THE ARCHIVE — every film, by the month it was seen.
 *
 * The Archive and the Ledger were twins: the same four-wide grid of the same
 * posters, differing only in which subset of logs they were handed. A member
 * had no way to tell which room they were standing in. The Archive keeps the
 * grid — it is the room for SHEER VOLUME, the wall of everything — and takes
 * the month rails as its structure. The Ledger stops being a grid entirely.
 */

interface ProfileArchiveTabProps {
  logs: ProfileLog[];
  isSelf: boolean;
  archiveSieve: string;
  setArchiveSieve: (val: string) => void;
  archiveFiltered: ProfileLog[];
  renderPosterCard: (log: ProfileLog, width: number) => React.ReactNode;
  groupByMonth: (items: ProfileLog[], dateKey?: string) => Record<string, ProfileLog[]>;
  /** Has the data landed? A room must not describe itself before it knows. */
  ready?: boolean;
  tier?: string | null;
  /** The TRUE films-per-month, from the server. Absent = draw no counts. */
  monthCounts?: { month: string; count: number }[] | null;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

type ArchiveItem =
  | { type: 'header'; title: string; lead: string; count?: string; weight?: number }
  | { type: 'row'; data: ProfileLog[]; id: string };

const MONTH_INDEX: Record<string, string> = {
  JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', MAY: '05', JUNE: '06',
  JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12',
};

const SIEVES = [
  { id: 'all', label: 'ALL' },
  { id: 'watched', label: 'WATCHED' },
  { id: 'rewatched', label: 'REWATCHED' },
  { id: 'abandoned', label: 'ABANDONED' },
];

export default function ProfileArchiveTab({
  logs,
  isSelf,
  archiveSieve,
  setArchiveSieve,
  archiveFiltered,
  renderPosterCard,
  groupByMonth,
  ready = true,
  tier,
  monthCounts,
  onLoadMore,
  isLoadingMore,
  refreshing = false,
  onRefresh,
  bottomInset
}: ProfileArchiveTabProps) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const grid = useMemo(() => posterColumns(windowWidth, 4), [windowWidth]);

  // The Vault only guards the member's OWN archive, and only when they have
  // explicitly enabled the biometric lock in Settings.
  const biometricLock = useAuthStore((s) => s.user?.preferences?.biometric_lock === true);
  const requiresVault = isSelf && biometricLock;
  const [unlocked, setUnlocked] = useState(false);

  const breatheAnim = useSharedValue(0.2);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      // 20, not -1 — the app's own convention, so the UI thread can idle
      // instead of running a worklet for as long as the room stays open. And
      // it is atmosphere, so it holds still for anyone who has asked the
      // system to stop things moving.
      20, true, undefined, ReduceMotion.System,
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(184,137,26,${breatheAnim.value})`,
    shadowColor: colors.tarnish,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: breatheAnim.value * 0.5,
    shadowRadius: 20,
    elevation: breatheAnim.value * 10
  }));

  const handleUnlocked = useCallback(() => {
    setUnlocked(true);
  }, []);

  /**
   * The TRUE size of each month, and how heavy it was.
   *
   * `items.length` counted whatever had loaded — the app pages fifty rows at a
   * time, so March said 7 when it held 40, and the number climbed as you
   * scrolled. The server sends the real shape of the whole history on every
   * profile load; it was being thrown away.
   *
   * Under a status filter the server's figures cannot speak for what is on
   * screen (it counted every film in March, not every ABANDONED film in March),
   * so `serverKnows` goes false and both the count and the rhythm disappear.
   * A heading with no number is honest. A wrong one is not.
   */
  const months = useMemo(() => {
    const by = new Map<string, number>();
    let heaviest = 0;
    for (const m of monthCounts ?? []) {
      if (!m?.month || typeof m.count !== 'number') continue;
      by.set(m.month, m.count);
      if (m.count > heaviest) heaviest = m.count;
    }
    return { by, heaviest };
  }, [monthCounts]);

  const serverKnows = archiveSieve === 'all' && months.by.size > 0;

  const flashData = useMemo(() => {
    if (archiveFiltered.length === 0) return [];
    const grouped = groupByMonth(archiveFiltered);
    const result: ArchiveItem[] = [];

    Object.entries(grouped).forEach(([month, items]) => {
      // `groupByMonth` keys on "MARCH 2026". The year is set in the display
      // face and the month in the sub — a date on a card catalogue divider,
      // not a heading. Split from the END so a month name can never be
      // mistaken for the year.
      const cut = month.lastIndexOf(' ');
      const name = cut > 0 ? month.slice(0, cut) : month;
      const year = cut > 0 ? month.slice(cut + 1) : '';
      // The server keys months as `YYYY-MM`; this room groups them by name.
      // Rebuilding the key here rather than anywhere else keeps the two forms
      // adjacent, because a silent mismatch would show every month as unknown.
      const key = year && MONTH_INDEX[name] ? `${year}-${MONTH_INDEX[name]}` : '';
      const real = completeCount({ count: months.by.get(key) ?? -1 }, serverKnows);

      result.push({
        type: 'header',
        title: name,
        lead: year,
        count: countLabel(real, 'FILM', 'FILMS'),
        weight: real !== undefined && months.heaviest > 0 ? real / months.heaviest : undefined,
      });
      for (let i = 0; i < items.length; i += 4) {
        result.push({
          type: 'row',
          data: items.slice(i, i + 4),
          id: `${month}-row-${i}`
        });
      }
    });

    return result;
  }, [archiveFiltered, groupByMonth, months, serverKnows]);

  const renderItem = useCallback(({ item }: { item: ArchiveItem }) => {
    if (item.type === 'header') {
      return <RoomRail lead={item.lead} label={item.title} count={item.count} weight={item.weight} />;
    }
    return (
      <View style={[r.gridRow, { gap: grid.gap, marginBottom: 12 }]}>
        {item.data.map(log => (
          <View key={log.id || log.filmId} style={{ width: grid.width }}>
            {renderPosterCard(log, grid.width)}
          </View>
        ))}
      </View>
    );
  }, [renderPosterCard, grid]);

  const ListHeaderComponent = useMemo(() => {
    if (logs.length === 0) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={r.chipScroll} contentContainerStyle={r.chipRow}>
        {SIEVES.map(sv => (
          <RoomChip
            key={sv.id}
            label={sv.label}
            on={archiveSieve === sv.id}
            onPress={() => { setArchiveSieve(sv.id); }}
            gap={8}
            a11y={`Filter the archive by ${sv.label.toLowerCase()}`}
          />
        ))}
      </ScrollView>
    );
  }, [logs.length, archiveSieve, setArchiveSieve]);

  const ListEmptyComponent = useMemo(() => {
    if (logs.length > 0 && archiveFiltered.length > 0) return null;

    // Nothing true can be said about a room whose contents are still in transit.
    if (!ready) return <RoomRetrieving room="the archive" />;

    // A FILTER matched nothing. That is not an empty archive, and telling a
    // member with 200 films that "the Archive is Empty" sends them hunting for
    // a fault in their own account. The only way out offered is the way back.
    if (logs.length > 0) {
      const sieve = SIEVES.find(sv => sv.id === archiveSieve);
      return (
        <RoomEmpty
          invite
          icon={<FilmIcon size={28} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
          title="Nothing under this heading"
          body={`No films in the archive are marked ${(sieve?.label ?? archiveSieve).toLowerCase()}.`}
          actionLabel="SHOW EVERYTHING"
          onAction={() => setArchiveSieve('all')}
        />
      );
    }

    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <FilmIcon size={32} color={colors.sepia} strokeWidth={1} style={r.ownIcon} />
          <Text {...scaledTextProps} style={r.ownTitle}>The Archive Awaits</Text>
          <PressableScale style={r.ownAct} onPress={() => (router.push as any)('/search-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Record a screening">
            <Text {...scaledTextProps} style={r.ownActText}>RECORD A SCREENING</Text>
          </PressableScale>

          {/* The import signpost — the feature already lives in Settings; this
              points a switcher to it at the moment they face an empty shelf.
              Own-profile empty-archive only, so it shares a screen with nothing. */}
          <View style={s.importDividerRow}>
            <View style={s.importDividerLine} />
            <Text {...decorativeTextProps} style={s.importDividerMark}>✦</Text>
            <View style={s.importDividerLine} />
          </View>
          <Text {...scaledTextProps} style={s.importLine}>Your viewing history can travel with you.</Text>
          <PressableScale
            style={s.importBtn}
            onPress={() => (router.push as any)('/settings' as never)}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Import your archive from another service"
          >
            <Text {...scaledTextProps} style={s.importBtnText}>✦  IMPORT YOUR ARCHIVE</Text>
          </PressableScale>
        </Animated.View>
      );
    }

    return (
      <RoomEmpty
        icon={<FilmIcon size={28} color={colors.sepia} strokeWidth={1} style={r.stateIcon} />}
        title="The Archive is Empty"
        body="This member hasn’t filed a screening yet."
      />
    );
  }, [logs.length, archiveFiltered.length, isSelf, ready, archiveSieve, setArchiveSieve, pulseStyle, router]);

  /**
   * Derived, not guessed.
   *
   * The old 200 was a third too small at every width: a row is a poster at 3:2
   * plus its title block plus the gap beneath it. Under-estimating makes
   * FlashList render and re-measure more rows than it needs on every scroll.
   */
  const estimatedItemSize = Math.round(grid.width * 1.5) + 42;

  return (
    <View style={r.container}>
      {requiresVault && !unlocked && <VaultLock onUnlocked={handleUnlocked} />}
      <CinematicFlashList
        estimatedItemSize={estimatedItemSize}
        data={flashData}
        getItemType={(item: ArchiveItem) => item.type}
        renderItem={renderItem}
        keyExtractor={(item: ArchiveItem) => item.type === 'header' ? `header-${item.lead}-${item.title}` : `row-${item.id}`}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={r.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoadingMore
            ? <RoomRetrieving room="more" />
            : flashData.length > 0 ? <RoomFoot tier={tier} /> : null
        }
        bottomInset={bottomInset}
      />
    </View>
  );
}

const s = StyleSheet.create({
  emptyStateSelf: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderRadius: 4, marginTop: 12 },
  importDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginTop: 20, marginBottom: 12, paddingHorizontal: 10 },
  importDividerLine: { flex: 1, height: 1, backgroundColor: colors.sepia, opacity: 0.2 },
  importDividerMark: { fontFamily: fonts.sub, fontSize: 7, color: colors.sepia, opacity: 0.7 },
  importLine: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.bone, opacity: 0.6, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  importBtn: { paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.45)', borderRadius: 2 },
  importBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.sepia },
});
