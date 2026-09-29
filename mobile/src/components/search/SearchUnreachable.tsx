/**
 * SearchUnreachable — what a search says when the catalogue could not be asked.
 *
 * In the search room's own words (the Search modal said them first), the same
 * in every box that searches, with the house's one TRY AGAIN. It stands where
 * "no films found" would, because that is exactly what it must never be
 * mistaken for.
 */
import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/src/components/text';
import TryAgain from '@/src/components/TryAgain';
import { colors, fonts } from '@/src/theme/theme';

export default function SearchUnreachable({ onRetry, style }: { onRetry?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.wrap, style]}>
      <Text style={s.label}>THE TELEGRAPH IS DOWN</Text>
      <Text style={s.sub}>Unable to reach the archives. Check your connection and try again.</Text>
      {onRetry && <TryAgain onPress={onRetry} style={s.retrySpace} />}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, gap: 10 },
  label: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog, textAlign: 'center' },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.fogQuiet, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
  retrySpace: { marginTop: 4 },
});
