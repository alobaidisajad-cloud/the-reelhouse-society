import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

const s = StyleSheet.create({
  statCard: { 
    flex: 1, 
    paddingVertical: 16, 
    paddingHorizontal: 4, 
    alignItems: 'center' 
  },
  statValue: {
    // Rye numerals — engraved on the plate, not typed on a form
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.silverScreen,
    lineHeight: 22,
    ...effects.textGlowSepia,
  },
  statLabel: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 1.5,
    color: colors.fog,
    marginTop: 4,
    opacity: 0.8,
  },
  statDivider: {
    width: 1.5,
    height: 32,
    backgroundColor: 'rgba(184,137,26,0.15)'
  },
});

export const StatCard = React.memo(function StatCard({ 
  label, value, onPress, isLast 
}: { 
  label: string; 
  value: string | number; 
  onPress?: () => void; 
  isLast?: boolean;
}) {
  return (
    <>
      <PressableScale 
        style={s.statCard} 
        onPress={() => { if (onPress) { onPress(); } }} 
        disabled={!onPress} 
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} 
        haptic
      >
        <Text style={s.statValue} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>
          {value}
        </Text>
        <Text style={s.statLabel} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>
          {label}
        </Text>
      </PressableScale>
      {!isLast && <View style={s.statDivider} />}
    </>
  );
});

