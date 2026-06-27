import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring, interpolate, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ReelSection } from './types';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';


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
        <Text style={[st.tabText, { color: activeTab === 'logs' ? '#E4DFCC' : colors.fog, opacity: activeTab === 'logs' ? 1 : 0.6 }]}>LOGS</Text>
      </PressableScale>
      <PressableScale style={st.tabButton} onPress={() => onTabSwitch('stacks')} haptic="light" accessibilityLabel="Stacks tab" accessibilityState={{ selected: activeTab === 'stacks' }}>
        <Text style={[st.tabText, { color: activeTab === 'stacks' ? '#E4DFCC' : colors.fog, opacity: activeTab === 'stacks' ? 1 : 0.6 }]}>STACKS</Text>
      </PressableScale>
    </View>
  );
});

// ══════════════════════════════════════════════════════════════
//  SHARED REEL HEADER (Extracted for stable hook lifecycle)
// ══════════════════════════════════════════════════════════════
export const SharedReelHeader = memo(function SharedReelHeader({
  section, logCount, userRole, onTabSwitch,
}: {
  section: ReelSection;
  logCount: number;
  userRole?: string;
  onTabSwitch: (t: ReelSection) => void;
}) {
  const livePulse = useSharedValue(0.4);
  useEffect(() => {
    livePulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1000 }), withTiming(0.4, { duration: 1000 })),
      -1,
      true
    );
    return () => cancelAnimation(livePulse);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: livePulse.value }));

  return (
    <>
      {/* Section Header */}
      <View style={st.sectionHeaderWrap}>
        <Text style={st.headerEyebrow}>✦ THE REELHOUSE SOCIETY ✦</Text>
        <Text style={st.headerTitle} accessibilityRole="header">The Reel</Text>

        {/* Decorative Est. 1924 rule */}
        <View style={st.headerEstRow}>
          <LinearGradient colors={['transparent', colors.sepia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
          <Text style={st.headerEst}>EST. 1924</Text>
          <LinearGradient colors={[colors.sepia, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.headerEstLine} />
        </View>

        {section === 'logs' && (
          <View style={st.liveRow}>
            <Animated.View style={[
              st.liveDot,
              isAuteurPlusTier(userRole) ? st.liveDotAuteur
                : isArchivistPlusTier(userRole) ? st.liveDotArchivist
                : st.liveDotDefault,
              pulseStyle
            ]} />
            <Text style={st.liveText}>
              LIVE · {logCount > 0 ? `${logCount} LOG${logCount === 1 ? '' : 'S'}` : 'AWAITING SIGNAL'}
            </Text>
          </View>
        )}
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
  tabText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 6, fontWeight: '700' },

  sectionHeaderWrap: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  headerEyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 12, color: colors.sepia, opacity: 0.6, marginBottom: 8, fontWeight: '700' },
  headerTitle: { 
    fontFamily: fonts.display, fontSize: 36, color: '#F2ECD8', marginBottom: 4,
    ...effects.textGlowSepia, textShadowRadius: 25, textShadowColor: 'rgba(184,137,26, 0.4)', letterSpacing: 2
  },
  headerEstRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, marginBottom: 4,
  },
  headerEstLine: { width: 32, height: StyleSheet.hairlineWidth },
  headerEst: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 8, color: colors.sepia, opacity: 0.5, fontWeight: '700' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotDefault: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotArchivist: { backgroundColor: colors.sepia, shadowColor: colors.sepia, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveDotAuteur: { backgroundColor: 'rgba(180,45,45,1)', shadowColor: 'rgba(125,31,31,1)', shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  liveText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 4, color: colors.fog, opacity: 0.65 },
});


InterlockingGearTabs.displayName = 'InterlockingGearTabs';