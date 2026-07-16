import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring, interpolate, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ReelSection } from './types';
import { isAuteurPlusTier } from '@/src/utils/tier';


// ══════════════════════════════════════════════════════════════
//  INTERLOCKING GEAR TAB (Mechanical Segment Control)
// ══════════════════════════════════════════════════════════════

export const InterlockingGearTabs = memo(({ activeTab, onTabSwitch }: { activeTab: ReelSection, onTabSwitch: (t: ReelSection) => void }) => {
  const position = useSharedValue(activeTab === 'logs' ? 0 : 1);

  useEffect(() => {
    position.value = withSpring(activeTab === 'logs' ? 0 : 1, { mass: 1, damping: 14, stiffness: 120 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const { width } = useWindowDimensions();

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(position.value, [0, 1], [0, (width - 34) / 2]) }]
  }));

  return (
    <View style={st.tabsContainer}>
      <Animated.View style={[StyleSheet.absoluteFillObject, st.tabsActiveBg, pillStyle]} />
      <PressableScale style={st.tabButton} onPress={() => onTabSwitch('logs')} haptic="light" accessibilityLabel="Logs tab" accessibilityState={{ selected: activeTab === 'logs' }}>
        <Text style={[st.tabText, { color: activeTab === 'logs' ? colors.parchmentDim : colors.fog, opacity: activeTab === 'logs' ? 1 : 0.6 }]}>LOGS</Text>
      </PressableScale>
      <PressableScale style={st.tabButton} onPress={() => onTabSwitch('stacks')} haptic="light" accessibilityLabel="Stacks tab" accessibilityState={{ selected: activeTab === 'stacks' }}>
        <Text style={[st.tabText, { color: activeTab === 'stacks' ? colors.parchmentDim : colors.fog, opacity: activeTab === 'stacks' ? 1 : 0.6 }]}>STACKS</Text>
      </PressableScale>
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  SHARED REEL HEADER
//  `variant` = which list this header instance lives in (both lists
//  stay mounted for the crossfade). The status row renders on BOTH
//  variants at identical height — the tab bar never jumps between
//  tabs. Logs pulse LIVE; the stacks archive holds a steady lamp.
// ══════════════════════════════════════════════════════════════
export const SharedReelHeader = memo(function SharedReelHeader({
  section, variant, logCount, stackCount, userRole, onTabSwitch,
}: {
  section: ReelSection;
  variant: ReelSection;
  logCount: number;
  stackCount: number;
  userRole?: string;
  onTabSwitch: (t: ReelSection) => void;
}) {
  const isFocused = useIsFocused();
  const isLogsVariant = variant === 'logs';
  // Only the visible logs header runs the pulse — the hidden twin idles.
  const shouldPulse = isFocused && isLogsVariant && section === 'logs';

  const livePulse = useSharedValue(0.4);
  useEffect(() => {
    if (shouldPulse) {
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
  }, [shouldPulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: livePulse.value }));

  const statusText = isLogsVariant
    ? `LIVE · ${logCount > 0 ? `${logCount} LOG${logCount === 1 ? '' : 'S'}` : 'AWAITING SIGNAL'}`
    : `ARCHIVE · ${stackCount > 0 ? `${stackCount} STACK${stackCount === 1 ? '' : 'S'}` : 'AWAITING CURATORS'}`;

  return (
    <>
      {/* Section Header */}
      <View style={st.sectionHeaderWrap}>
        <Text style={st.headerTitle} accessibilityRole="header">The Reel</Text>

        {/* Decorative Est. 1924 rule */}
        <View style={st.headerEstRow}>
          <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
          <Text style={st.headerEst}>EST. 1924</Text>
          <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
        </View>

        {/* Status row — ALWAYS rendered: identical header height on both tabs */}
        <View style={st.liveRow}>
          <Animated.View style={[
            st.liveDot,
            isLogsVariant && isAuteurPlusTier(userRole) ? st.liveDotAuteur : st.liveDotDefault,
            isLogsVariant ? pulseStyle : st.liveDotSteady,
          ]} />
          <Text style={st.liveText}>
            {statusText}
          </Text>
        </View>
      </View>

      {/* Section Tabs (Mechanical Slider) */}
      <InterlockingGearTabs activeTab={section} onTabSwitch={onTabSwitch} />
    </>
  );
});

const st = StyleSheet.create({
  tabsContainer: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 24,
    backgroundColor: 'rgba(18,14,9,0.5)', borderRadius: 4, borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.15)', height: 46, position: 'relative'
  },
  tabsActiveBg: {
    width: '50%', backgroundColor: 'rgba(18,14,9,0.95)', borderColor: 'rgba(184,137,26,0.4)',
    borderWidth: 1, borderRadius: 4, ...effects.shadowSurface, elevation: 5
  },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 5 },

  sectionHeaderWrap: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  headerTitle: {
    fontFamily: fonts.display, fontSize: 36, color: colors.silverScreen, marginBottom: 4,
    ...effects.textGlowSepia, textShadowRadius: 25, textShadowColor: 'rgba(184,137,26, 0.4)', letterSpacing: 2
  },
  headerEstRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, marginBottom: 4,
  },
  headerEstLine: { width: 32, height: StyleSheet.hairlineWidth },
  headerEst: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 5, color: colors.sepia, opacity: 0.55 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, minHeight: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotDefault: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotAuteur: { backgroundColor: colors.crimson, shadowColor: colors.crimson, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotSteady: { opacity: 0.8 },
  liveText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.fog, opacity: 0.65 },
});


InterlockingGearTabs.displayName = 'InterlockingGearTabs';
