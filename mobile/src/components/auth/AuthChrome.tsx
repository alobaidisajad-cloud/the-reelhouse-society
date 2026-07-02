/**
 * AuthChrome.tsx — Shared chrome for every Society admission surface
 * ────────────────────────────────────────────────────────────────────
 * Sign-in, sign-up, email confirmation, credential recovery: four doors
 * into the same 1924 screening room. This module is the one vocabulary
 * they all speak — candlelight halos, typewriter eyebrows with ✦ film
 * ornaments, registration brackets, the founding-year mark.
 *
 * Everything here is decorative, cheap (static SVG / plain Views, zero
 * per-frame JS), and pointerEvents-safe.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';

// ── Candlelight halo — a soft radial glow, the projector's warmth ──
// Static SVG (rendered once, never re-painted). Used behind the seal
// and behind the unframed icons on the confirmation/recovery surfaces.
export const CandlelightHalo = memo(function CandlelightHalo({
  size,
  intensity = 0.5,
}: {
  size: number;
  intensity?: number;
}) {
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id="candleHalo" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={colors.flicker} stopOpacity={intensity} />
          <Stop offset="42%" stopColor={colors.sepia} stopOpacity={intensity * 0.32} />
          <Stop offset="100%" stopColor={colors.sepia} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} fill="url(#candleHalo)" />
    </Svg>
  );
});

// ── Film-strip perforations — the frame edges of the admission reel ──
function FilmPerforations({ side }: { side: 'left' | 'right' }) {
  const holes = Array.from({ length: 18 });
  return (
    <View
      style={[perf.strip, side === 'left' ? perf.left : perf.right]}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      {holes.map((_, i) => (
        <View key={i} style={perf.hole} />
      ))}
    </View>
  );
}

// ── Full backdrop — nitrate gradient + perforations, one call ──
export const AuthBackdrop = memo(function AuthBackdrop() {
  return (
    <>
      <LinearGradient
        colors={[colors.ink, '#0B0907', colors.soot]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <FilmPerforations side="left" />
      <FilmPerforations side="right" />
    </>
  );
});

// ── Society eyebrow — ✦ ─── LABEL ─── ✦ ──────────────────────────────
// Bulletproof centering: both rules are flex:1 (capped), so they absorb
// slack symmetrically; the label is single-line and shrinks-to-fit, so
// it can NEVER wrap or drift off center — on any device, any label.
export function SocietyEyebrow({
  label,
  style,
}: {
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[eb.row, style]}>
      <Text style={eb.star} allowFontScaling={false}>✦</Text>
      <View style={eb.rule} />
      <Text
        style={eb.label}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
      <View style={eb.rule} />
      <Text style={eb.star} allowFontScaling={false}>✦</Text>
    </View>
  );
}

// ── Unframed icon in candlelight — for confirmation / recovery ──
// The Society never cages its marks: no border circle, halo only.
export function HaloIcon({
  icon: Icon,
  iconSize = 30,
  haloSize = 120,
  style,
}: {
  icon: LucideIcon;
  iconSize?: number;
  haloSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Layout footprint is smaller than the glow so the halo bleeds
  // gracefully into surrounding whitespace without pushing content.
  const box = Math.round(haloSize * 0.55);
  return (
    <View style={[{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: haloSize,
          height: haloSize,
          top: (box - haloSize) / 2,
          left: (box - haloSize) / 2,
        }}
      >
        <CandlelightHalo size={haloSize} intensity={0.38} />
      </View>
      <Icon size={iconSize} color={colors.sepia} strokeWidth={1.5} />
    </View>
  );
}

// ── Registration brackets — archival document corner marks ──
export const RegistrationBrackets = memo(function RegistrationBrackets({
  inset = 8,
  size = 12,
  color = colors.sepiaBorderStrong,
}: {
  inset?: number;
  size?: number;
  color?: string;
}) {
  const dim = { width: size, height: size, borderColor: color };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[rb.corner, dim, { top: inset, left: inset, borderTopWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[rb.corner, dim, { top: inset, right: inset, borderTopWidth: 1, borderRightWidth: 1 }]} />
      <View style={[rb.corner, dim, { bottom: inset, left: inset, borderBottomWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[rb.corner, dim, { bottom: inset, right: inset, borderBottomWidth: 1, borderRightWidth: 1 }]} />
    </View>
  );
});

// ── Founding mark — ─── EST. 1924 ─── ──
export function Est1924({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[est.row, style]}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={est.rule} />
      <Text style={est.text} allowFontScaling={false}>EST. 1924</Text>
      <View style={est.rule} />
    </View>
  );
}

// ── Styles ──
const perf = StyleSheet.create({
  strip: {
    position: 'absolute', top: 0, bottom: 0, width: 18,
    justifyContent: 'space-evenly', alignItems: 'center',
    opacity: 0.08,
  },
  left: { left: 0 },
  right: { right: 0 },
  hole: {
    width: 8, height: 8, borderRadius: 1.5,
    backgroundColor: colors.parchment,
  },
});

const eb = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
  },
  star: {
    fontFamily: fonts.sub,
    fontSize: 10,
    color: colors.sepia,
  },
  rule: {
    flex: 1,
    maxWidth: 26,
    height: 1,
    backgroundColor: colors.sepiaBorderStrong,
  },
  label: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
    textTransform: 'uppercase',
    flexShrink: 1,
    textAlign: 'center',
  },
});

const rb = StyleSheet.create({
  corner: { position: 'absolute' },
});

const est = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
    opacity: 0.7,
  },
  rule: {
    width: 18,
    height: 1,
    backgroundColor: colors.ash,
  },
  text: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 3,
    color: colors.fog,
  },
});
