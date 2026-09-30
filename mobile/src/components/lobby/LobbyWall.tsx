/**
 * THE LOBBY WALL — a member's Lobby: a wall of bills.
 * ─────────────────────────────────────────────────────────────────────────────
 *   the masthead        the room's name, today's number, the hour's line
 *   I   Now Showing     this week's film as a one-sheet, the bill beside it
 *   II  Featured Log    printed on paper    ┐ side by side where each holds
 *   III Featured Stack  printed on brass    ┘ its words, else one above the other
 *   IV  Featured Filings the Dispatch's bill: three columns, always
 *   V   Take Your Rank  the ranks the member does not hold
 *
 * The edition is the house's, chosen once a day (get_lobby). The page is laid
 * out by arithmetic before it is drawn (planWall): nothing is measured after,
 * so nothing moves when it arrives — and every state has a shape of its own:
 * first open (still shapes), a refresh that failed over a kept wall (one quiet
 * line), a wall never seen that cannot be reached (the house's own notice), the
 * programme unreachable (the case says so), and a house with nothing yet to
 * feature (each bill says so, and opens the door to be the first).
 */
import React, { memo, useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { EmptyOffline } from '@/src/components/EmptyStates';
import { rankOf } from '@/src/components/RankBadge';
import { useAuthStore } from '@/src/stores/auth';
import { useLineScale, useTextScale } from '@/src/hooks/useTextScale';
import { navBarHeight, tabBarHeight } from '@/src/components/layout/navMetrics';
import { colors, fonts } from '@/src/theme/theme';
import { EDGE_LIT } from '@/src/theme/light';
import { Masthead } from './Masthead';
import { FeatureRow } from './FeatureRow';
import { LogBill, StackBill, VacantLogBill, VacantStackBill } from './PairBills';
import { FilingsBill } from './FilingsBill';
import { RankBill } from './RankBill';
import { HouseLine } from './parts';
import { planWall, WALL, type WallPlan } from './measure';
import { SIGNOFF, STATES } from './words';
import { PROGRAMME_KEY, WALL_KEY, useFeature, useLobbyWall, useProgramme } from './wallRead';

/** The wall's shapes before anything has arrived: where each bill will hang, laid out as they will be, still. */
const Skeleton = memo(function Skeleton({ plan }: { plan: WallPlan }) {
  return (
    <View style={s.skeleton} accessible accessibilityLabel="The Lobby is being hung">
      <View style={[s.pair, !plan.pairs && s.pairStacked]}>
        <View style={[s.skel, s.skelHalf, plan.pairs && s.skelBeside]} />
        <View style={[s.skel, s.skelHalf, plan.pairs && s.skelBeside]} />
      </View>
      <View style={[s.skel, s.skelFilings]} />
    </View>
  );
});

/** A refresh that failed over a kept wall: the wall stays; one line says so. */
const RefreshFailed = memo(function RefreshFailed({ plan, onRetry }: { plan: WallPlan; onRetry: () => void }) {
  return (
    <View style={[s.refresh, plan.refreshStacked && s.refreshStacked]}>
      <View style={s.refreshWords}>
        {STATES.refreshFailed.map((l) => <HouseLine key={l} type="refresh" text={l} room={plan.refreshWordsRoom} style={s.refreshLine} />)}
      </View>
      <PressableScale style={s.refreshDoor} onPress={onRetry} haptic="selection" accessibilityRole="button" accessibilityLabel="Try again">
        <HouseLine type="cta" text={STATES.tryAgain} room={plan.refreshDoorRoom} style={s.refreshDoorText} spoken={false} />
      </PressableScale>
    </View>
  );
});

export const LobbyWall = memo(function LobbyWall() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useTextScale();
  const lineScale = useLineScale();
  const visible = height - navBarHeight(insets.top) - tabBarHeight(insets.bottom);
  const plan = planWall({ width, visible, scale, lineScale });

  const queryClient = useQueryClient();
  const wall = useLobbyWall(true);
  const programme = useProgramme(true);
  const feature = useFeature(programme.data?.feature ?? null);
  const viewer = useAuthStore((st) => rankOf(st.user));
  const admin = useAuthStore((st) => st.user?.role === 'admin');

  const retryWall = useCallback(() => { void queryClient.refetchQueries({ queryKey: WALL_KEY }); }, [queryClient]);
  const retryProgramme = useCallback(() => { void queryClient.refetchQueries({ queryKey: PROGRAMME_KEY }); }, [queryClient]);

  // unreachable, or answered with no film at all: never a shape that waits forever
  const programmeDark = (programme.isError && !programme.data) || (programme.data !== undefined && !programme.data.feature);
  // the wall was read once and kept, and the last reading failed: say so, keep the wall
  const keptButStale = wall.isError && wall.data !== undefined;
  const w = wall.data;

  return (
    <View style={[s.wall, { width: plan.wallW }]}>
      <Masthead wallW={plan.wallW} now={new Date()} />
      {keptButStale ? <RefreshFailed plan={plan} onRetry={retryWall} /> : null}
      <FeatureRow
        plan={plan}
        sheet={feature.data ?? null}
        bill={programme.data?.bill ?? []}
        dark={programmeDark}
        onRetry={retryProgramme}
      />
      {w === undefined ? (
        wall.isError ? <EmptyOffline onRetry={retryWall} /> : <Skeleton plan={plan} />
      ) : (
        <>
          <View style={[s.pair, !plan.pairs && s.pairStacked]}>
            {w.log ? <LogBill log={w.log} plan={plan} scale={scale} admin={admin} /> : <VacantLogBill plan={plan} />}
            {w.stack ? <StackBill stack={w.stack} plan={plan} scale={scale} admin={admin} /> : <VacantStackBill plan={plan} />}
          </View>
          <FilingsBill filings={w.filings} plan={plan} admin={admin} />
        </>
      )}
      <RankBill plan={plan} viewer={viewer} />
      <Text style={s.signoff} numberOfLines={1}>{SIGNOFF}</Text>
    </View>
  );
});

const s = StyleSheet.create({
  wall: { alignSelf: 'center', gap: WALL.gap },
  pair: { flexDirection: 'row', gap: WALL.gap, alignItems: 'stretch' },
  pairStacked: { flexDirection: 'column' },
  skeleton: { gap: WALL.gap },
  skel: { backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.sepiaBorder },
  skelHalf: { minHeight: 320 },
  skelBeside: { flex: 1 },
  skelFilings: { height: 360 },
  refresh: {
    ...EDGE_LIT,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: WALL.refreshGap,
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.sepiaBorder, paddingHorizontal: 12, minHeight: 44,
  },
  refreshStacked: { flexDirection: 'column', paddingVertical: 6 },
  refreshWords: { flexShrink: 1, minWidth: 0, paddingVertical: 5 },
  refreshLine: { color: colors.bone, lineHeight: 15.5 },
  refreshDoor: { minHeight: 44, justifyContent: 'center', paddingHorizontal: WALL.refreshDoorPad },
  refreshDoorText: { color: colors.sepia },
  signoff: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.fogQuiet, textAlign: 'center', paddingTop: 4 },
});
