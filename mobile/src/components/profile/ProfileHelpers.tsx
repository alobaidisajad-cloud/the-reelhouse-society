import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
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
    fontFamily: fonts.mono, 
    fontSize: 18, 
    color: '#F2ECD8', 
    lineHeight: 22, 
    ...effects.textGlowSepia, 
    fontWeight: '700' 
  },
  statLabel: { 
    fontFamily: fonts.ui, 
    fontSize: 8, 
    letterSpacing: 1.5, 
    color: colors.fog, 
    marginTop: 4, 
    opacity: 0.8 
  },
  statDivider: { 
    width: 1.5, 
    height: 32, 
    backgroundColor: 'rgba(184,137,26,0.15)' 
  },
  sectionLabelWrap: { 
    alignItems: 'center', 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 6, 
    marginBottom: 12 
  },
  sectionLabelText: {
    fontFamily: fonts.sub,
    fontSize: 9.5,
    letterSpacing: 2,
    color: colors.sepia,
    textAlign: 'center',
    ...effects.textGlowSepia,
  },
  goldDivider: { 
    height: 1, 
    backgroundColor: 'rgba(184,137,26,0.2)', 
    marginBottom: 14 
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

export const SectionLabel = React.memo(function SectionLabel({ text }: { text: string }) {
  return (
    <View style={s.sectionLabelWrap}>
      <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
      <Text style={s.sectionLabelText}>{text}</Text>
      <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
    </View>
  );
});

export const GoldDivider = React.memo(function GoldDivider() {
  return <View style={s.goldDivider} />;
});
