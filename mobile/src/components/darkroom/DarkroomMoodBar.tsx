// ============================================================
// DarkroomMoodBar — extracted from DarkroomHeader.tsx
// ============================================================
import React from 'react';
import { View, Text, StyleSheet , ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { MOODS, MOOD_ICONS } from './constants';

interface DarkroomMoodBarProps {
  mood: typeof MOODS[number] | null;
  handleSelectMood: (m: typeof MOODS[number]) => void;
}

export const DarkroomMoodBar = React.memo(function DarkroomMoodBar({
  mood, handleSelectMood,
}: DarkroomMoodBarProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const keyExtractor = React.useCallback((v: typeof MOODS[number]) => v.label, []);

  const renderItem = React.useCallback(({ item }: { item: typeof MOODS[number] }) => {
    const active = mood?.label === item.label;
    return (
      <PressableScale hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }}
        onPress={() => handleSelectMood(item)}
        style={[s.moodCard, active && { backgroundColor: item.color, borderColor: item.accent }]}
        haptic="medium"
        accessibilityLabel={`Mood: ${item.label}${active ? ', selected' : ''}`}
      >
        {(() => {
          const IconComp = MOOD_ICONS[item.icon];
          return IconComp ? <IconComp size={16} color={active ? item.accent : colors.bone} strokeWidth={1.5} /> : null;
        })()}
        <View style={{ flexShrink: 1 }}>
          <Text style={[s.moodLabel, active && s.moodLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.label}</Text>
          <Text style={[s.moodSub, active && s.moodSubActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.sub}</Text>
        </View>
      </PressableScale>
    );
  }, [mood?.label, handleSelectMood]);

  return (
    <View style={s.moodSection}>
      <Text style={s.sectionEyebrow}>✦ DEVELOP BY MOOD ✦</Text>
      {/* The row runs off the right edge, and a card sliced mid-word reads as
          broken rather than scrollable. This is a darkroom: the safelight falls
          off toward the walls, so the row now dissolves into the dark instead
          of being cut by it — the same treatment the Lobby ticker uses. Right
          edge only, since a symmetric fade would dim the first card at rest for
          no reason, and pointerEvents none so it never eats a swipe. */}
      <View style={s.moodScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.moodList}
        >
          {MOODS.map(item => renderItem({ item }))}
          <View style={{ width: 16 }} />
        </ScrollView>
        <LinearGradient
          colors={['transparent', colors.ink]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.moodEdgeFade}
          pointerEvents="none"
        />
      </View>
    </View>
  );
});

DarkroomMoodBar.displayName = 'DarkroomMoodBar';

// ── Styles — copied PIXEL-PERFECT from DarkroomHeader.tsx ──
const s = StyleSheet.create({
  moodSection: {
    marginBottom: 20,
  },
  moodScrollWrap: {
    position: 'relative',
  },
  moodEdgeFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
    // moodCard spreads effects.shadowSurface, which carries elevation: 10.
    // Android paints by elevation rather than JSX order, so without this the
    // cards covered the gradient entirely and the fade did not exist on
    // Android — shipped that way, and found only by auditing the Lounge fade
    // that repeated the same mistake.
    elevation: 12,
    zIndex: 12,
    // Elevation also DRAWS a shadow on Android. This strip wants the z-order,
    // not the mark, so the shadow is cleared explicitly.
    shadowColor: 'transparent',
  },
  sectionEyebrow: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
    textAlign: 'center',
    marginBottom: 10,
  },
  moodList: {
    gap: 8,
    paddingHorizontal: 4,
  },
  moodCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(10,8,5,0.8)',
    borderColor: 'rgba(184,137,26,0.15)',
    minWidth: 140,
    ...effects.shadowSurface,
  },
  moodLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.bone,
    textTransform: 'uppercase',
  },
  moodLabelActive: {
    color: colors.silverScreen,
    ...effects.textGlowSepia, textShadowRadius: 8
  },
  moodSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    marginTop: 4,
    // 0.6 measured 3.04:1 — this line is what tells you what a mood MEANS
    // ("Heavy, profound stories"), so it earns AA. 0.8 = 4.59:1.
    opacity: 0.8,
  },
  moodSubActive: {
    opacity: 0.9,
    color: colors.flicker,
  },
});
