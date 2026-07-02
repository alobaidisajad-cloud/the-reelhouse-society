// ============================================================
// DarkroomMoodBar — extracted from DarkroomHeader.tsx
// ============================================================
import React from 'react';
import { View, Text, StyleSheet , ScrollView } from 'react-native';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
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
      <PressableScale
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.moodList}
      >
        {MOODS.map(item => renderItem({ item }))}
        <View style={{ width: 16 }} />
      </ScrollView>
    </View>
  );
});

DarkroomMoodBar.displayName = 'DarkroomMoodBar';

// ── Styles — copied PIXEL-PERFECT from DarkroomHeader.tsx ──
const s = StyleSheet.create({
  moodSection: {
    marginBottom: spacing.xl,
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
    color: '#F2ECD8',
    ...effects.textGlowSepia, textShadowRadius: 8
  },
  moodSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    marginTop: 4,
    opacity: 0.6,
  },
  moodSubActive: {
    opacity: 0.9,
    color: colors.flicker,
  },
});
