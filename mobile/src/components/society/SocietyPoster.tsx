/**
 * SocietyPoster — the bill posted in the lobby.
 * ─────────────────────────────────────────────────────────────────────────────
 * A 1924 public notice: printed double rules, stacked type in mixed sizes, and
 * the house's own mark as the rising sun — its rays spread from the eye. The
 * mark is the official logo, untinted and unframed, exactly as SocietySeal
 * shows it: the Society never cages its mark, and it is never redrawn.
 *
 * Every word is the house's own. The joke is in the large type, where a poster
 * keeps it: attendance is free; the better seats are not.
 *
 * When a locked door sent the member here, the slip replaces the joke and says
 * what they reached for — read from the same list the tickets sell from.
 *
 * Read aloud as ONE sentence. The ornaments ("NOTICE Nº 1924") are print, not
 * information, and a screen reader spelling out "number sign" before the page
 * has said what it is would be the poster getting in the way of itself.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, RadialGradient, Stop, Path, G } from 'react-native-svg';

import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps, displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

const LOGO = require('../../../assets/images/reelhouse-logo.png');

/** The mark, and the room its rays are drawn in. */
const MARK = 84;
const MARK_COMPACT = 64;
const RAY_RADIUS = 360;
/** Thirty rays: five degrees of light, seven of dark. */
const RAYS = 30;

export interface ReachedFor {
  name: string;
  detail: string;
  rankName: string;
}

/**
 * Where the mark's top edge sits in the poster: the poster's top padding, the
 * NOTICE row (10pt type with no font padding, 13pt tall), and the mark's own
 * margin — the same numbers the styles below use, so the sun rises from the
 * eye in both sizes.
 */
const RULE_ROW = 13;
export const markTop = (compact: boolean) => (compact ? 8 + RULE_ROW + 2 : 14 + RULE_ROW + 6);

/** The rays as one path — thirty wedges out from the centre. */
function raysPath(cx: number, cy: number): string {
  const step = (Math.PI * 2) / RAYS;
  const half = ((5 / 12) * step) / 2;
  let d = '';
  for (let i = 0; i < RAYS; i++) {
    const a = i * step;
    const x1 = cx + RAY_RADIUS * Math.cos(a - half);
    const y1 = cy + RAY_RADIUS * Math.sin(a - half);
    const x2 = cx + RAY_RADIUS * Math.cos(a + half);
    const y2 = cy + RAY_RADIUS * Math.sin(a + half);
    d += `M${cx},${cy}L${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}Z`;
  }
  return d;
}

export const SocietyPoster = memo(function SocietyPoster({
  reachedFor, compact,
}: {
  reachedFor: ReachedFor | null;
  /** A short screen: the mark and the type step down so a ticket shows first. */
  compact: boolean;
}) {
  const mark = compact ? MARK_COMPACT : MARK;
  const spoken = reachedFor
    ? `The Society requires your attendance. You reached for ${reachedFor.name}. ${reachedFor.detail} It comes with ${reachedFor.rankName}.`
    : 'The Society requires your attendance. Attendance is free, and always will be. The better seats are not.';

  return (
    <View style={s.wrap} accessible accessibilityRole="header" accessibilityLabel={spoken}>
      <View style={s.rule} />
      <View style={[s.poster, compact && s.posterCompact]} {...UNSPOKEN}>
        {/* The rising sun, centred on the mark. Drawn in a square larger than the
            poster and clipped by it, so the rays run off every edge. */}
        <View pointerEvents="none" style={[s.sun, { top: markTop(compact) + mark / 2 - RAY_RADIUS }]}>
          <Svg width={RAY_RADIUS * 2} height={RAY_RADIUS * 2}>
            <Defs>
              <RadialGradient id="rayFade" cx={RAY_RADIUS} cy={RAY_RADIUS} r={RAY_RADIUS} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={colors.sepia} stopOpacity={0} />
                <Stop offset="0.13" stopColor={colors.sepia} stopOpacity={0} />
                <Stop offset="0.18" stopColor={colors.sepia} stopOpacity={0.16} />
                <Stop offset="0.5" stopColor={colors.sepia} stopOpacity={0.06} />
                <Stop offset="0.85" stopColor={colors.sepia} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <G>
              <Path d={raysPath(RAY_RADIUS, RAY_RADIUS)} fill="url(#rayFade)" />
            </G>
          </Svg>
        </View>

        <View style={s.ruleRow}>
          <Text style={s.ruleText} {...deckLabelProps}>NOTICE Nº 1924</Text>
          <Text style={s.ruleText} {...deckLabelProps}>ADMISSION FREE</Text>
        </View>

        <Image source={LOGO} style={[s.mark, compact && s.markCompact, { width: mark, height: mark }]} contentFit="contain" transition={0} />

        <Text style={[s.the, compact && s.theCompact]} {...displayTextProps} maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          The Society
        </Text>
        <View style={s.midRow}>
          <View style={s.midRule} />
          <Text style={[s.mid, compact && s.midCompact]} {...deckLabelProps} maxFontSizeMultiplier={1.2}>REQUIRES YOUR</Text>
          <View style={s.midRule} />
        </View>
        <Text style={[s.big, compact && s.bigCompact]} {...displayTextProps} maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          Attendance.
        </Text>

        {reachedFor ? (
          <View style={s.slip}>
            <Text style={s.slipKey} {...deckLabelProps}>YOU REACHED FOR</Text>
            <Text style={s.slipName} {...displayTextProps} numberOfLines={2}>{reachedFor.name}</Text>
            <Text style={s.slipWhy} {...scaledTextProps}>{reachedFor.detail} It comes with {reachedFor.rankName}.</Text>
          </View>
        ) : (
          <View style={[s.kicker, compact && s.kickerCompact]}>
            <Text style={[s.kickerLine, compact && s.kickerLineCompact]} {...scaledTextProps}>Attendance is free,{'\n'}and always will be.</Text>
            <Text style={[s.kickerTurn, compact && s.kickerTurnCompact]} {...scaledTextProps}>The better seats are not.</Text>
          </View>
        )}
      </View>
      <View style={s.rule} />
    </View>
  );
});

/** The printed double rule: two hairlines and the gap between them. */
const RULE_GAP = 2;

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 8 },
  rule: {
    height: 1 + RULE_GAP + 1,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: colors.sepiaBorderStrong,
  },
  poster: {
    overflow: 'hidden',
    alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22,
  },
  posterCompact: { paddingTop: 8, paddingBottom: 10 },
  sun: { position: 'absolute', left: '50%', marginLeft: -RAY_RADIUS, width: RAY_RADIUS * 2, height: RAY_RADIUS * 2 },

  ruleRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  ruleText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },

  mark: { marginTop: 6 },
  markCompact: { marginTop: 2 },

  the: {
    fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.silverScreen,
    letterSpacing: 1, marginTop: 4, textAlign: 'center', alignSelf: 'stretch',
  },
  theCompact: { fontSize: 28, lineHeight: 33 },
  midRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 2 },
  midRule: { width: 34, height: 1, backgroundColor: colors.tarnish },
  mid: { fontFamily: fonts.sub, fontSize: 14, letterSpacing: 5, color: colors.marqueeGold, includeFontPadding: false },
  midCompact: { fontSize: 12, letterSpacing: 4 },
  big: {
    fontFamily: fonts.display, fontSize: 47, lineHeight: 56, color: colors.silverScreen, letterSpacing: 0.5,
    textAlign: 'center', alignSelf: 'stretch',
    // Printed with a slight misregistration: the red plate a hair below the cream.
    textShadowColor: colors.bloodReel, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1,
  },
  bigCompact: { fontSize: 40, lineHeight: 47 },

  kicker: { marginTop: 14, alignItems: 'center' },
  kickerCompact: { marginTop: 6 },
  kickerLine: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.bone, textAlign: 'center' },
  kickerLineCompact: { fontSize: 14, lineHeight: 19 },
  kickerTurn: { fontFamily: fonts.sub, fontSize: 16, lineHeight: 23, color: colors.parchment, textAlign: 'center', marginTop: 2 },
  kickerTurnCompact: { fontSize: 15, lineHeight: 21 },

  slip: {
    marginTop: 16, alignSelf: 'stretch',
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sepiaBorderStrong,
    backgroundColor: colors.stampGround,
    paddingHorizontal: 14, paddingTop: 11, paddingBottom: 12,
  },
  slipKey: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia, includeFontPadding: false },
  slipName: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, color: colors.parchment, marginTop: 3 },
  slipWhy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.bone, marginTop: 3 },
});
