/**
 * The breakdown in the Reel's frame: an Auteur's six scores read at a glance, one row of them
 * under a rule that carries its name and the mean. Where a label cannot hold its sixth of the
 * row at the member's text size (an SE at its largest), the row is two rows of three: planned
 * from the labels' own widths, never cut. Tapping it opens the log, where the whole report is.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { lineWidth } from '@/src/components/lobby/measure';
import { getAutopsyStats } from './scores';

const LABEL = { size: 10, spacing: 0.4 } as const;
const GAP = 6;

const score = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Three to a row where a label cannot hold its share of six. */
export function breakdownColumns(labels: string[], width: number, scale: number): number {
  const sixth = (width - GAP * 5) / 6;
  return labels.some((l) => lineWidth(l, 'elite', LABEL.size, scale, LABEL.spacing) > sixth) ? 3 : 6;
}

export const Breakdown = React.memo(function Breakdown({ autopsy, width, scale, accent }: {
  autopsy: Record<string, number> | undefined;
  /** The frame's inner width, the row's whole room. */
  width: number;
  scale: number;
  accent: string;
}) {
  const stats = getAutopsyStats(autopsy);
  if (!stats.length) return null;
  const mean = stats.reduce((sum, s) => sum + s.value, 0) / stats.length;
  const cols = breakdownColumns(stats.map((s) => s.label), width, scale);
  // Whole points: six cells that sum to the row's width exactly wrap the last under Yoga's rounding.
  const cell = Math.floor((width - GAP * (cols - 1)) / cols);
  return (
    <View style={st.wrap} accessible accessibilityLabel={`Breakdown, ${score(Math.round(mean * 10) / 10)} out of 10. ${stats.map((s) => `${s.label.toLowerCase()}, ${score(s.value)} out of 10`).join('. ')}.`}>
      <View style={st.rule}>
        <Text style={[st.ruleText, { color: accent }]} {...scaledTextProps}>BREAKDOWN · {score(Math.round(mean * 10) / 10)}</Text>
        <View style={st.ruleLine} />
      </View>
      <View style={st.grid}>
        {stats.map((s) => (
          <View key={s.key} style={[st.cell, { width: cell }]}>
            <Text style={st.label} {...scaledTextProps} numberOfLines={1}>{s.label}</Text>
            <Text style={st.value} {...scaledTextProps}>{score(s.value)}</Text>
            <View style={st.track}><View style={[st.fill, { width: `${s.value * 10}%`, backgroundColor: accent }]} /></View>
          </View>
        ))}
      </View>
    </View>
  );
});

const st = StyleSheet.create({
  wrap: { marginTop: 14 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.2, includeFontPadding: false },
  ruleLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.sepiaBorder },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 8, marginTop: 8 },
  cell: { gap: 3 },
  label: { fontFamily: fonts.sub, fontSize: LABEL.size, letterSpacing: LABEL.spacing, color: colors.bone, includeFontPadding: false },
  value: { fontFamily: fonts.display, fontSize: 14, lineHeight: 16, color: colors.parchmentBright, includeFontPadding: false },
  track: { height: 2, marginTop: 1, backgroundColor: colors.sepiaFaint },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
