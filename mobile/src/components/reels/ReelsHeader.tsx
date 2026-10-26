import React, { memo, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { arrive, MS } from '@/src/theme/motion';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ReelSection } from './types';
import { isAuteurPlusTier } from '@/src/utils/tier';
import { EDGE_LIT } from '@/src/theme/light';


// ══════════════════════════════════════════════════════════════
//  INTERLOCKING GEAR TAB (Mechanical Segment Control)
//
//  The live lamp lives HERE, on the LOGS tab, rather than in a
//  status row of its own. The wire is what's live, so the light
//  belongs on it — and a row that only said "LIVE" was a row
//  spent narrating what the lamp already shows.
// ══════════════════════════════════════════════════════════════

export const InterlockingGearTabs = memo(({ activeTab, onTabSwitch, auteur }: {
  activeTab: ReelSection,
  onTabSwitch: (t: ReelSection) => void,
  auteur: boolean,
}) => {
  const position = useSharedValue(activeTab === 'logs' ? 0 : 1);

  useEffect(() => {
    position.value = withTiming(activeTab === 'logs' ? 0 : 1, { duration: MS.base, easing: arrive() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const { width } = useWindowDimensions();

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(position.value, [0, 1], [0, (width - 34) / 2]) }]
  }));

  return (
    <View style={st.tabsContainer}>
      <Animated.View style={[StyleSheet.absoluteFill, st.tabsActiveBg, pillStyle]} />
      <PressableScale hitSlop={null} style={st.tabButton} onPress={() => onTabSwitch('logs')} haptic="light" accessibilityLabel="Logs tab" accessibilityState={{ selected: activeTab === 'logs' }}>
        <View style={st.tabInner}>
          {/* Lit and still: a lamp that blinked every second was the Reel's light read as noise. */}
          <View style={[st.liveDot, auteur ? st.liveDotAuteur : st.liveDotDefault]} />
          {/* The tab you are not on is quieter by its ink, never drawn see-through. */}
          <Text style={[st.tabText, { color: activeTab === 'logs' ? colors.parchmentDim : colors.fogQuiet }]}>LOGS</Text>
        </View>
      </PressableScale>
      <PressableScale hitSlop={null} style={st.tabButton} onPress={() => onTabSwitch('stacks')} haptic="light" accessibilityLabel="Stacks tab" accessibilityState={{ selected: activeTab === 'stacks' }}>
        <Text style={[st.tabText, { color: activeTab === 'stacks' ? colors.parchmentDim : colors.fogQuiet }]}>STACKS</Text>
      </PressableScale>
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  SHARED REEL HEADER
//  Each list draws its own (both stay mounted for the crossfade), and
//  both draw the SAME elements, so the header is identical in height on
//  either tab and the control below it never jumps.
//
//  There is deliberately no count here. Both feeds are paginated —
//  the old "LIVE · 40 LOGS" was reading the PAGE SIZE, so it said 40
//  whether the society had 41 logs or a million, and climbed as you
//  scrolled. Recency would have been just as wrong: on a
//  reverse-chronological timeline the newest item's age is already
//  printed on the first card. The header carries state, not statistics.
// ══════════════════════════════════════════════════════════════
export const SharedReelHeader = memo(function SharedReelHeader({
  section, userRole, onTabSwitch,
}: {
  section: ReelSection;
  userRole?: string;
  onTabSwitch: (t: ReelSection) => void;
}) {
  return (
    <>
      <View style={st.sectionHeaderWrap}>
        <Text style={st.headerTitle} accessibilityRole="header">The Reel</Text>
      </View>

      <InterlockingGearTabs
        activeTab={section}
        onTabSwitch={onTabSwitch}
        auteur={isAuteurPlusTier(userRole)}
      />
    </>
  );
});

const st = StyleSheet.create({
  tabsContainer: {
    // 16 rather than 24 below: with the Est. rule and the status row gone the
    // masthead is tighter, and the old gap left the tabs floating.
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 16,
    backgroundColor: 'rgba(30,25,20,0.5)', borderRadius: 4, borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.15)', height: 46, position: 'relative'
  },
  tabsActiveBg: { ...EDGE_LIT,
    width: '50%', backgroundColor: colors.soot, borderColor: 'rgba(184,137,26,0.4)',
    borderWidth: 1, borderRadius: 4, ...effects.shadowFloat, elevation: 5
  },
  // A whole 46pt target with no halo, which would reach the filter chips below.
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tabText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 5 },

  sectionHeaderWrap: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTitle: {
    fontFamily: fonts.display, fontSize: 36, color: colors.silverScreen,
    ...effects.textGlowSepia, textShadowRadius: 25, textShadowColor: 'rgba(184,137,26, 0.4)', letterSpacing: 2,
    // The glow's room inside the box a phone cuts it at; the margins keep the layout.
    padding: 25, margin: -25, marginBottom: 4 - 25,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotDefault: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotAuteur: { backgroundColor: colors.crimson, shadowColor: colors.crimson, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
});


InterlockingGearTabs.displayName = 'InterlockingGearTabs';
