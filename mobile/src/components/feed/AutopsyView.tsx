/**
 * The Autopsy — filed on the BACK of the archive index card.
 * ──────────────────────────────────────────────────────────
 * AutopsyStrip  — the front-side trigger row: red dot, THE AUTOPSY,
 *                 CONFIDENTIAL stamp, TURN OVER ⟳. Tapping it flips
 *                 the card (owned by ActivityCard).
 * AutopsyBack   — the card's reverse: dashed crimson file border,
 *                 2×3 craft grid (fits any front height), and the
 *                 ✦ RETURN TO THE RECORD row.
 *
 * The old vertical drawer is dead — it shoved the feed down ~250px
 * mid-scroll. The back is painted on the same card: height never moves.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

export interface AutopsyStats {
  [key: string]: number;
}

/**
 * Normalize the JSONB payload into RATED craft axes only, clamped 0–10.
 *
 * AUTOPSY LAW: v2 payloads (`_v >= 2`) contain only axes the user actually
 * filed — a stored 0 there is a deliberate verdict and renders as a real 0.0
 * bar. Legacy payloads wrote 0 for every untouched axis (and the old editor
 * couldn't express a deliberate zero at all), so legacy zeros are UNRATED and
 * are dropped. An empty result means "no autopsy was filed" — hide the section.
 */
export function getAutopsyStats(autopsy?: Record<string, number> | null) {
  if (!autopsy || typeof autopsy !== 'object') return [];
  const isV2 = typeof autopsy._v === 'number' && autopsy._v >= 2;
  const pick = (...candidates: unknown[]) => {
    for (const c of candidates) {
      const n = typeof c === 'number' ? c : c != null ? parseFloat(String(c)) : NaN;
      if (!isNaN(n)) return Math.min(10, Math.max(0, n));
    }
    return null;
  };
  const axes: { key: string; label: string; value: number | null }[] = [
    { key: 'story', label: 'STORY', value: pick(autopsy.story, autopsy.screenplay) },
    { key: 'script', label: 'SCRIPT', value: pick(autopsy.script, autopsy.screenplay) },
    { key: 'acting', label: 'ACTING', value: pick(autopsy.acting, autopsy.direction) },
    { key: 'cinematography', label: 'CINEMATOGRAPHY', value: pick(autopsy.cinematography) },
    { key: 'editing', label: 'EDITING', value: pick(autopsy.editing, autopsy.pacing) },
    { key: 'sound', label: 'SOUND', value: pick(autopsy.sound) },
  ];
  return axes.filter((a): a is { key: string; label: string; value: number } =>
    a.value !== null && (isV2 || a.value > 0)
  );
}

/** True when the payload carries at least one genuinely filed score. */
export function hasRatedAutopsy(autopsy?: Record<string, number> | null): boolean {
  return getAutopsyStats(autopsy).length > 0;
}

/** Front-side strip: the invitation to turn the card over. */
export const AutopsyStrip = React.memo(function AutopsyStrip({ onTurnOver }: { onTurnOver: () => void }) {
  return (
    <PressableScale
      onPress={onTurnOver}
      style={s.stripBtn}
      haptic="selection"
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel="Turn the card over to read the confidential autopsy"
    >
      <View style={s.stripContent}>
        <View style={s.stripDot} />
        <Text style={s.stripTitle}>THE AUTOPSY</Text>
        <Text style={s.stripConfidential}>CONFIDENTIAL</Text>
      </View>
      <Text style={s.stripTurn}>TURN OVER ⟳</Text>
    </PressableScale>
  );
});

/** The back of the card: six craft bars on one baseline plane. */
export const AutopsyBack = React.memo(function AutopsyBack({
  autopsy,
  username,
  onReturn,
}: {
  autopsy?: Record<string, number>;
  username: string;
  onReturn: () => void;
}) {
  const stats = getAutopsyStats(autopsy);

  return (
    <View style={s.backRoot}>
      {/* Confidential file border */}
      <View style={s.backFileBorder} pointerEvents="none" />

      <View style={s.backBody}>
        <View style={s.backHeader}>
          <View style={s.stripDot} />
          <Text style={s.backTitle}>THE AUTOPSY</Text>
          <Text style={s.stripConfidential}>CONFIDENTIAL</Text>
        </View>
        <Text style={s.backFiledBy} numberOfLines={1} ellipsizeMode="tail">
          Craft examination · filed by @{username.toUpperCase()}
        </Text>

        <View style={s.grid}>
          {stats.map(stat => (
            <View key={stat.key} style={s.cell}>
              <View style={s.cellHeader}>
                <Text style={s.cellLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stat.label}</Text>
                <Text style={s.cellValue}>{stat.value === 10 ? '10.0' : stat.value.toFixed(1)}</Text>
              </View>
              <View style={s.track}>
                <View style={s.sprocketStrip} />
                <LinearGradient colors={[colors.sepia, '#5a430d']} style={[s.fill, { width: `${(stat.value / 10) * 100}%` }]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
                  <View style={s.cutMarker} />
                </LinearGradient>
              </View>
            </View>
          ))}
        </View>
      </View>

      <PressableScale
        onPress={onReturn}
        style={s.returnBtn}
        haptic="selection"
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityLabel="Return to the log"
      >
        <Text style={s.returnText}>✦ RETURN TO THE RECORD</Text>
      </PressableScale>
    </View>
  );
});

const s = StyleSheet.create({
  // ── Front strip ──
  stripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,137,26,0.15)',
    backgroundColor: 'rgba(20,15,5,0.4)',
  },
  stripContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  stripDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  stripTitle: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.bone,
    includeFontPadding: false,
  },
  stripConfidential: {
    fontFamily: fonts.sub,
    fontSize: 6,
    letterSpacing: 2,
    color: colors.bone,
    backgroundColor: 'rgba(180,45,45,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(228,60,60,0.5)',
    transform: [{ rotate: '-2deg' }],
    includeFontPadding: false,
  },
  stripTurn: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 2,
    color: colors.sepia,
    opacity: 0.7,
    includeFontPadding: false,
    flexShrink: 0,
    marginLeft: 8,
  },

  // ── The back of the card ──
  backRoot: {
    flex: 1,
    backgroundColor: '#0B0806',
  },
  backFileBorder: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.crimsonBorder,
    borderRadius: 3,
  },
  backBody: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  backTitle: {
    fontFamily: fonts.display,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.parchment,
    includeFontPadding: false,
  },
  backFiledBy: {
    fontFamily: fonts.bodyItalic,
    fontSize: 9,
    color: colors.fog,
    opacity: 0.7,
    marginBottom: 14,
    includeFontPadding: false,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  cell: {
    width: '47%',
  },
  cellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  cellLabel: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 1.5,
    color: colors.fog,
    includeFontPadding: false,
    flexShrink: 1,
  },
  cellValue: {
    fontFamily: fonts.display,
    fontSize: 11,
    color: colors.parchment,
    includeFontPadding: false,
    marginLeft: 6,
  },
  track: {
    height: 10,
    backgroundColor: 'rgba(2,1,1,1)',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  sprocketStrip: {
    ...StyleSheet.absoluteFillObject,
    top: '50%',
    marginTop: -2,
    height: 4,
    borderTopWidth: 4,
    borderColor: '#000',
    borderStyle: 'dashed',
    opacity: 0.15,
    zIndex: 1,
  },
  fill: {
    height: '100%',
    position: 'relative',
  },
  cutMarker: {
    position: 'absolute',
    right: 0,
    top: -2,
    bottom: -2,
    width: 3,
    backgroundColor: colors.bone,
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    borderRadius: 2,
  },
  returnBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,137,26,0.15)',
  },
  returnText: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2.5,
    color: colors.sepia,
    includeFontPadding: false,
  },
});
