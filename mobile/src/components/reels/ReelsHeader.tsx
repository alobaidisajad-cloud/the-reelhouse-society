import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring, interpolate, cancelAnimation } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ReelSection } from './types';
import { isAuteurPlusTier } from '@/src/utils/tier';


// ══════════════════════════════════════════════════════════════
//  INTERLOCKING GEAR TAB (Mechanical Segment Control)
//
//  The live lamp lives HERE, on the LOGS tab, rather than in a
//  status row of its own. The wire is what's live, so the light
//  belongs on it — and a row that only said "LIVE" was a row
//  spent narrating what the lamp already shows.
// ══════════════════════════════════════════════════════════════

export const InterlockingGearTabs = memo(({ activeTab, onTabSwitch, pulse, auteur }: {
  activeTab: ReelSection,
  onTabSwitch: (t: ReelSection) => void,
  /** Only the VISIBLE logs header breathes — the hidden twin holds a steady lamp. */
  pulse: boolean,
  auteur: boolean,
}) => {
  const position = useSharedValue(activeTab === 'logs' ? 0 : 1);

  useEffect(() => {
    position.value = withSpring(activeTab === 'logs' ? 0 : 1, { mass: 1, damping: 14, stiffness: 120 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const livePulse = useSharedValue(0.8);
  useEffect(() => {
    if (pulse) {
      livePulse.value = withRepeat(
        withSequence(withTiming(1, { duration: 1000 }), withTiming(0.4, { duration: 1000 })),
        -1,
        true
      );
    } else {
      cancelAnimation(livePulse);
      livePulse.value = 0.8;
    }
    return () => cancelAnimation(livePulse);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: livePulse.value }));

  const { width } = useWindowDimensions();

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(position.value, [0, 1], [0, (width - 34) / 2]) }]
  }));

  return (
    <View style={st.tabsContainer}>
      <Animated.View style={[StyleSheet.absoluteFillObject, st.tabsActiveBg, pillStyle]} />
      <PressableScale hitSlop={{ top: 15, bottom: 15, left: 0, right: 0 }} style={st.tabButton} onPress={() => onTabSwitch('logs')} haptic="light" accessibilityLabel="Logs tab" accessibilityState={{ selected: activeTab === 'logs' }}>
        <View style={st.tabInner}>
          <Animated.View style={[st.liveDot, auteur ? st.liveDotAuteur : st.liveDotDefault, pulseStyle]} />
          <Text style={[st.tabText, { color: activeTab === 'logs' ? colors.parchmentDim : colors.fog, opacity: activeTab === 'logs' ? 1 : 0.75 }]}>LOGS</Text>
        </View>
      </PressableScale>
      <PressableScale hitSlop={{ top: 15, bottom: 15, left: 0, right: 0 }} style={st.tabButton} onPress={() => onTabSwitch('stacks')} haptic="light" accessibilityLabel="Stacks tab" accessibilityState={{ selected: activeTab === 'stacks' }}>
        <Text style={[st.tabText, { color: activeTab === 'stacks' ? colors.parchmentDim : colors.fog, opacity: activeTab === 'stacks' ? 1 : 0.75 }]}>STACKS</Text>
      </PressableScale>
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  SHARED REEL HEADER
//  `variant` = which list this header instance lives in (both lists
//  stay mounted for the crossfade). Both variants render the SAME
//  elements, so the header is identical in height on either tab and
//  the control below it never jumps.
//
//  There is deliberately no count here. Both feeds are paginated —
//  the old "LIVE · 40 LOGS" was reading the PAGE SIZE, so it said 40
//  whether the society had 41 logs or a million, and climbed as you
//  scrolled. Recency would have been just as wrong: on a
//  reverse-chronological timeline the newest item's age is already
//  printed on the first card. The header carries state, not statistics.
// ══════════════════════════════════════════════════════════════
export const SharedReelHeader = memo(function SharedReelHeader({
  section, variant, userRole, onTabSwitch,
}: {
  section: ReelSection;
  variant: ReelSection;
  userRole?: string;
  onTabSwitch: (t: ReelSection) => void;
}) {
  const isFocused = useIsFocused();
  const shouldPulse = isFocused && variant === 'logs' && section === 'logs';

  return (
    <>
      <View style={st.sectionHeaderWrap}>
        <Text style={st.headerTitle} accessibilityRole="header">The Reel</Text>
      </View>

      <InterlockingGearTabs
        activeTab={section}
        onTabSwitch={onTabSwitch}
        pulse={shouldPulse}
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
    backgroundColor: 'rgba(18,14,9,0.5)', borderRadius: 4, borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.15)', height: 46, position: 'relative'
  },
  tabsActiveBg: {
    width: '50%', backgroundColor: 'rgba(18,14,9,0.95)', borderColor: 'rgba(184,137,26,0.4)',
    borderWidth: 1, borderRadius: 4, ...effects.shadowSurface, elevation: 5
  },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  // 0.60 measured 3.04:1 on ink; 0.75 gives 4.16:1. The inactive tab should read
  // as unselected, not as unavailable.
  tabText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 5 },

  sectionHeaderWrap: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTitle: {
    fontFamily: fonts.display, fontSize: 36, color: colors.silverScreen, marginBottom: 4,
    ...effects.textGlowSepia, textShadowRadius: 25, textShadowColor: 'rgba(184,137,26, 0.4)', letterSpacing: 2
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotDefault: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotAuteur: { backgroundColor: colors.crimson, shadowColor: colors.crimson, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
});


InterlockingGearTabs.displayName = 'InterlockingGearTabs';
