/**
 * DarkroomMoodBar — the baths: six moods a member can develop by, one chosen at a time. Three
 * across while every name fits its tile whole at the member's size, else two (bathsPerRow); a
 * chosen bath is lit in its own colours, and its words head the sheet below.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';

import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { useTextScale } from '@/src/hooks/useTextScale';
import { MOODS, MOOD_ICONS } from './constants';
import { BATH, ROOM, bathsPerRow, rowsOf } from './sheet';

interface DarkroomMoodBarProps {
  mood: typeof MOODS[number] | null;
  handleSelectMood: (m: typeof MOODS[number]) => void;
}

const NAMES = MOODS.map((m) => m.label);

export const DarkroomMoodBar = React.memo(function DarkroomMoodBar({ mood, handleSelectMood }: DarkroomMoodBarProps) {
  const cols = bathsPerRow(useColumnWidth(), NAMES, useTextScale());
  return (
    <View>
      <Text style={s.eyebrow} {...scaledTextProps} accessibilityRole="header">✦ DEVELOP BY MOOD ✦</Text>
      <View style={s.baths}>
        {rowsOf(MOODS, cols).map((row, r) => (
          <View key={r} style={s.row}>
            {row.map((m, i) => {
              if (!m) return <View key={`none-${i}`} style={s.bathRoom} />;
              const chosen = mood?.label === m.label;
              const Icon = MOOD_ICONS[m.icon];
              return (
                <PressableScale key={m.label} onPress={() => handleSelectMood(m)} haptic="selection" hitSlop={null}
                  style={[s.bathRoom, s.bath, chosen && { backgroundColor: m.color, borderColor: m.accent }]}
                  accessibilityRole="button" accessibilityState={{ selected: chosen }} accessibilityLabel={`${m.label} mood. ${m.sub}`}>
                  {Icon ? <Icon size={16} strokeWidth={1.5} color={chosen ? m.accent : colors.bone} /> : null}
                  <Text style={[s.name, chosen && s.nameChosen]} {...scaledTextProps} numberOfLines={1}>{m.label.toUpperCase()}</Text>
                </PressableScale>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
});

DarkroomMoodBar.displayName = 'DarkroomMoodBar';

const s = StyleSheet.create({
  eyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, textAlign: 'center', marginTop: 20, includeFontPadding: false },
  baths: { marginTop: 10, gap: BATH.gap },
  row: { flexDirection: 'row', gap: BATH.gap },
  bathRoom: { flex: 1, minWidth: 0 },
  bath: {
    minHeight: 58, paddingVertical: 8, paddingHorizontal: BATH.pad, borderRadius: ROOM.radius,
    backgroundColor: colors.soot, borderWidth: BATH.border, borderColor: 'rgba(232,223,208,0.06)',
    alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  name: { fontFamily: fonts.sub, fontSize: BATH.size, letterSpacing: BATH.spacing, color: colors.parchment, includeFontPadding: false },
  nameChosen: { color: colors.silverScreen },
});
