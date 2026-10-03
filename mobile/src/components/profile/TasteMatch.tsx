import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { EDGE_LIT } from '@/src/theme/light';
import { TryAgainLine } from '@/src/components/TryAgain';
import { tasteMatchOf, useTasteMatch } from './tasteMatchRead';

interface TasteMatchProps {
  /** The member whose file this is. */
  userId: string;
  theirUsername: string;
}

/** How alike the viewer and this member are, read over both whole records. */
export function TasteMatch({ userId, theirUsername }: TasteMatchProps) {
  const read = useTasteMatch(userId);

  if (read.isLoading || read.isError) {
    return (
      <View style={s.container}>
        <Text {...scaledTextProps} style={s.header}>TASTE COMPATIBILITY</Text>
        <Text {...scaledTextProps} style={s.description}>
          {read.isError ? 'Your records could not be compared just now.' : 'Comparing your records…'}
        </Text>
        {read.isError ? <TryAgainLine onPress={() => { void read.refetch(); }} /> : null}
      </View>
    );
  }
  // A record the viewer may not read, or too little on either side: nothing to compare.
  const match = read.data ? tasteMatchOf(read.data.mine, read.data.theirs) : null;
  if (match === null) return null;
  const label = match >= 80 ? 'KINDRED SPIRITS' : match >= 60 ? 'SIMILAR TASTES' : match >= 40 ? 'PARALLEL REELS' : 'DIVERGENT PATHS';
  const color = match >= 80 ? colors.sepia : match >= 60 ? colors.flicker : match >= 40 ? colors.bone : colors.fog;

  return (
    <View style={s.container}>
      <Text {...scaledTextProps} style={s.header}>TASTE COMPATIBILITY</Text>

      <Text {...scaledTextProps} style={[s.percentage, { color, textShadowColor: `${color}40` }]}>
        {match}%
      </Text>

      <Text {...scaledTextProps} style={[s.label, { color }]}>{label}</Text>

      <Text {...scaledTextProps} style={s.description} numberOfLines={2} adjustsFontSizeToFit>
        You and <Text {...scaledTextProps} style={{ color: colors.bone }}>@{theirUsername}</Text> share a {match}% cinematic overlap
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { ...EDGE_LIT,
    backgroundColor: colors.soot,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,137,26,0.2)',
    borderRadius: 4,
    padding: 20,
    alignItems: 'center',
    marginVertical: 16,
  },
  header: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.fog,
    marginBottom: 12,
  },
  percentage: {
    fontFamily: fonts.display,
    fontSize: 48,
    lineHeight: 56,
    marginBottom: 4,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  label: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
  },
  description: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.fog,
    lineHeight: 18,
    textAlign: 'center',
  },
});
