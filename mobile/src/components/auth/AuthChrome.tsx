/**
 * AuthChrome.tsx — Shared chrome for every Society admission surface
 * ────────────────────────────────────────────────────────────────────
 * Sign-in, sign-up, email confirmation, credential recovery: four doors
 * into the same 1924 screening room. This module is the one vocabulary
 * they all speak — candlelight halos, typewriter eyebrows with ✦ film
 * ornaments, registration brackets, the founding-year mark.
 *
 * Everything here is decorative, cheap (native gradients / plain Views, zero
 * per-frame JS), and pointerEvents-safe.
 */
import React, { memo } from 'react';
import { Platform, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Canvas, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { Text } from '@/src/components/text';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import { rgbaOf, WASH } from '@/src/theme/light';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

// ── Candlelight halo — a soft radial glow, the projector's warmth ──
// A native background (no bitmap; see roomLightImage in src/theme/light.ts):
// a circle as wide as the square, candlelight at its heart, brass at 42%,
// nothing at its rim. Used behind the seal and behind the unframed icons on
// the confirmation/recovery surfaces. Written as an ellipse of two equal
// radii: React Native 0.81 reads `circle <r> at …` wrongly (the `at` is
// swallowed and the position taken for the size).
export function candlelightImage(size: number, intensity: number): string {
  const r = +(size / 2).toFixed(2);
  return `radial-gradient(ellipse ${r}px ${r}px at 50% 50%, ${rgbaOf(colors.flicker, intensity)} 0%, ` +
    `${rgbaOf(colors.sepia, intensity * 0.32)} 42%, ${rgbaOf(colors.sepia, 0)} 100%)`;
}

export const CandlelightHalo = memo(function CandlelightHalo({
  size,
  intensity = 0.5,
}: {
  size: number;
  intensity?: number;
}) {
  const image = candlelightImage(size, intensity);
  if (Platform.OS !== 'ios') return <View style={{ width: size, height: size, experimental_backgroundImage: image }} pointerEvents="none" />;
  // iOS draws a native gradient without dither: on the iPhone the halo's light held one level for
  // 12 to 40 px at a time, rings on the dark ground (ios-launch 43371370114; Android's is dithered,
  // no run over 2 px). So iOS draws the same light in Skia, dithered: the same stops, the same
  // circle. The native background it stands for rides along as `nativeID`, for the drawings.
  const r = size / 2;
  return (
    <View testID="candlelight-halo" nativeID={image} style={{ width: size, height: size }} pointerEvents="none">
      <Canvas style={{ width: size, height: size }}>
        <Rect x={0} y={0} width={size} height={size} dither>
          <RadialGradient
            c={vec(r, r)}
            r={r}
            colors={[rgbaOf(colors.flicker, intensity), rgbaOf(colors.sepia, intensity * 0.32), rgbaOf(colors.sepia, 0)]}
            positions={[0, 0.42, 1]}
          />
        </Rect>
      </Canvas>
    </View>
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
// Mount as the FIRST child of the screen's root: it carries the room's light.
export const AuthBackdrop = memo(function AuthBackdrop() {
  return (
    <>
      <RoomLight room="default" />
      <LinearGradient
        colors={[colors.ink, '#0B0907', colors.soot]}
        locations={[0, 0.5, 1]}
        style={[StyleSheet.absoluteFill, WASH]}
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
    fontSize: 10,
    letterSpacing: 1.9,
    color: colors.fog,
  },
});
