import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/theme/theme';

/**
 * FilmSectionHeader — the single, shared section header for the film page.
 * A slim brass index-bar (sepia→flicker) + a crisp label + a hairline rule
 * that fades to transparent. Left-aligned & scannable (dossier idiom), but
 * crafted to read elite. One source of truth so the sections can never drift.
 */
export const FilmSectionHeader = memo(function FilmSectionHeader({ label }: { label: string }) {
  return (
    <View style={s.header}>
      <LinearGradient
        colors={[colors.sepia, colors.flicker]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={s.bar}
      />
      <Text style={s.label} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
      <LinearGradient
        colors={[colors.sepiaBorderStrong, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.rule}
      />
    </View>
  );
});

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  bar: {
    width: 2.5,
    height: 12,
    borderRadius: 1.5,
    marginRight: 10,
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  label: { fontFamily: fonts.uiBold, fontSize: 10.5, letterSpacing: 3, color: colors.sepia },
  rule: { flex: 1, height: 1, marginLeft: 12 },
});
