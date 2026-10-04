/**
 * Buster, the house's resident: an old sheet with two holes cut in it and brass
 * in the dark behind them, Buster Keaton's hat, and one patch where seat F9's
 * armrest wore through.
 *
 * He is drawn once, ahead of time, into a picture for each size and screen
 * density (`busterArt`); the phone draws only his two brass points, which blink
 * and now and then glance aside. Everything that moves is a transform or an
 * opacity, so it runs on the UI thread without redrawing anything; it stops
 * when his screen is hidden, and under Reduce Motion he is simply still.
 *
 * Where he may appear is a register (busterRegister.test.ts): one to a screen,
 * never in a list's rows.
 */
import React, { memo, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import { MS, arrive } from '@/src/theme/motion';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { useSvgId } from '@/src/utils/svgId';
import { BUSTER_ART, type BusterArtKey } from '@/src/components/busterArt';

/** The brass of his eyes, and the bulb's catch of light on it: the drawing's own. */
const BRASS = '#C4961A';
const BULB = '#F6E3A0';

type ArtOf<K> = K extends `${infer M}-${infer S extends number}` ? { mood: M; size: S } : never;
/** A mood and a size the house has a picture of: no other pair type-checks. */
export type BusterPicture = ArtOf<BusterArtKey>;
export type BusterMood = BusterPicture['mood'];

type Art = (typeof BUSTER_ART)[BusterArtKey];
const artOf = ({ mood, size }: BusterPicture): Art => BUSTER_ART[`${mood}-${size}` as BusterArtKey];

/** If a picture never says it has loaded, he is shown anyway after this long. */
const LOAD_GRACE_MS = 600;

/** Whether he may move: his screen is in front and Reduce Motion is off. Both are always asked. */
function useLive(): boolean {
  const focused = useIsFocused();
  const still = useReducedMotion();
  return focused && !still;
}

/** The two brass points, where the measured holes are; the bulb catches the light up and to the right. */
const Points = memo(function Points({ art }: { art: Art }) {
  const { width: w, height: h } = art;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      {art.eyes.map((e, i) => (
        <React.Fragment key={i}>
          <Circle cx={e.x * w} cy={e.y * h} r={e.r * w} fill={BRASS} />
          <Circle cx={(e.x + e.r * 0.24) * w} cy={e.y * h - e.r * 0.24 * w} r={e.r * 0.5 * w} fill={BULB} />
        </React.Fragment>
      ))}
    </Svg>
  );
});

/** The floor under him, soft at the edge; it tightens as he rises. */
const Shadow = memo(function Shadow({ art }: { art: Art }) {
  const id = useSvgId('floor');
  const { width: w, height: h } = art;
  const rx = w * 0.29, ry = w * 0.04;
  const cy = Math.min(art.hem * h + ry * 0.6, h - ry);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={id}>
          <Stop offset="0" stopColor="#000" stopOpacity={0.5} />
          <Stop offset="0.5" stopColor="#000" stopOpacity={0.4} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={art.pivot.x * w} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </Svg>
  );
});

/** Below this share of his height he steps aside rather than shrink further. */
const MIN_FIT = 0.5;

/**
 * Buster, alive: he floats, sways a little, blinks, and glances aside.
 *
 * He arrives only once his picture has loaded and his place is laid out, so a
 * screen never shows him half-drawn. Where a screen is short of room for him and
 * its words together (the keyboard up on a small phone, the largest text),
 * `flexShrink` lets the layout take room from him, and he stands smaller in what
 * is left, above the words; under half his height he steps aside. Given the room
 * back, he grows back.
 */
const Buster = memo(function Buster({ message, style, ...picture }: BusterPicture & {
  /** A line he says, set under him. */
  message?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const art = artOf(picture as BusterPicture);
  const { width: w, height: h } = art;
  const live = useLive();
  const seated = picture.mood === 'seated';
  const hasEyes = art.eyes.length > 0;

  const [loaded, setLoaded] = useState(false);
  // The share of his height the layout gave him: null until laid out. Rounded
  // down to fiftieths, so a keyboard sliding in redraws him a few times, not every frame.
  const [fit, setFit] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const given = e.nativeEvent.layout.height;
    setFit(given >= h - 0.5 ? 1 : Math.max(0, Math.floor((given / h) * 50) / 50));
  }, [h]);
  const laidOut = fit !== null;
  const stands = fit !== null && fit >= MIN_FIT;
  useEffect(() => {
    if (!laidOut) return;
    const grace = setTimeout(() => setLoaded(true), LOAD_GRACE_MS);
    return () => clearTimeout(grace);
  }, [laidOut]);

  const shown = useSharedValue(0);
  useEffect(() => {
    if (loaded && stands) shown.value = withTiming(1, { duration: MS.considered, easing: arrive() });
  }, [loaded, stands, shown]);

  // float 0 → 1 (up), sway 0 → 1 (turned), lid 1 open → 0 shut, glance 0 → 1 (aside)
  const float = useSharedValue(0);
  const sway = useSharedValue(0);
  const lid = useSharedValue(1);
  const glance = useSharedValue(0);
  useEffect(() => {
    const all = [float, sway, lid, glance];
    if (!live) {
      all.forEach(cancelAnimation);
      float.value = 0; sway.value = 0; lid.value = 1; glance.value = 0;
      return;
    }
    const breathe = Easing.inOut(Easing.sin);
    // Seated, he does not float; with his eyes dark (dimmed), there is nothing to blink.
    if (!seated) {
      float.value = withRepeat(withTiming(1, { duration: 2500, easing: breathe }), -1, true);
      sway.value = withRepeat(withTiming(1, { duration: 3500, easing: breathe }), -1, true);
    }
    if (hasEyes) {
      lid.value = withRepeat(withSequence(
        withDelay(5800, withTiming(0, { duration: 90 })),
        withDelay(160, withTiming(1, { duration: 140 })),
      ), -1, false);
      glance.value = withRepeat(withSequence(
        withDelay(7400, withTiming(1, { duration: 700, easing: breathe })),
        withDelay(2300, withTiming(0, { duration: 700, easing: breathe })),
      ), -1, false);
    }
    return () => all.forEach(cancelAnimation);
  }, [live, seated, hasEyes, float, sway, lid, glance]);

  const rise = w * 0.04;
  const glanceBy = w * (3.6 / 152);
  const appear = useAnimatedStyle(() => ({ opacity: shown.value }));
  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: -rise * float.value }, { rotate: `${1.8 * sway.value}deg` }],
  }));
  const floor = useAnimatedStyle(() => ({
    opacity: 1 - 0.36 * float.value,
    transform: [{ scaleX: 1 - 0.14 * float.value }],
  }));
  const eyes = useAnimatedStyle(() => ({
    opacity: lid.value,
    transform: [{ translateX: glanceBy * glance.value }],
  }));

  return (
    <View style={[s.root, style]}>
      <View
        testID={`buster-${picture.mood}`}
        style={[{ width: w, height: h }, s.room]}
        onLayout={onLayout}
        {...UNSPOKEN}
      >
        {(fit === null || stands) && (
          // His whole height, standing on the bottom of the room he was given, scaled into it.
          <Animated.View
            testID="buster-standing"
            style={[{ position: 'absolute', left: 0, bottom: 0, width: w, height: h, transformOrigin: ['50%', '100%', 0], transform: [{ scale: fit ?? 1 }] }, appear]}
          >
            {!seated && <Animated.View style={[StyleSheet.absoluteFill, floor]}><Shadow art={art} /></Animated.View>}
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: [art.pivot.x * w, art.pivot.y * h, 0] }, body]}>
              <Image testID="buster-picture" source={art.picture} style={{ width: w, height: h }} contentFit="fill" onLoad={() => setLoaded(true)} accessible={false} />
              {hasEyes && (
                <Animated.View style={[StyleSheet.absoluteFill, eyes]}><Points art={art} /></Animated.View>
              )}
            </Animated.View>
          </Animated.View>
        )}
      </View>
      {message ? (
        <View style={s.bubble}>
          <View style={s.bubbleTail} />
          <Text style={s.bubbleText}>{message}</Text>
        </View>
      ) : null}
    </View>
  );
});

export default Buster;

/**
 * Buster held still, for the crash screens: no animation, and nothing that asks
 * the navigator anything, so it draws wherever the app has fallen, even above
 * the navigator. The points wait for the picture, so they never show alone.
 */
export function BusterStill(picture: BusterPicture) {
  const art = artOf(picture);
  const [loaded, setLoaded] = useState(false);
  return (
    <View testID={`buster-still-${picture.mood}`} style={{ width: art.width, height: art.height }} {...UNSPOKEN}>
      <Image testID="buster-picture" source={art.picture} style={{ width: art.width, height: art.height }} contentFit="fill" onLoad={() => setLoaded(true)} accessible={false} />
      {loaded && art.eyes.length > 0 ? <Points art={art} /> : null}
    </View>
  );
}

/** How long a wait is before his eyes come up: a quicker answer shows nothing new. */
export const EYES_AFTER_MS = 400;

/** One eye in the dark: a brass point in its own glow. */
const Eye = memo(function Eye() {
  const id = useSvgId('glow');
  return (
    <Svg width={EYE} height={EYE}>
      <Defs>
        <RadialGradient id={id}>
          <Stop offset="0" stopColor={BRASS} stopOpacity={0.55} />
          <Stop offset="0.45" stopColor={BRASS} stopOpacity={0.16} />
          <Stop offset="1" stopColor={BRASS} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={EYE / 2} cy={EYE / 2} r={EYE / 2} fill={`url(#${id})`} />
      <Circle cx={EYE / 2} cy={EYE / 2} r={2.2} fill={BRASS} />
      <Circle cx={EYE / 2 + 0.55} cy={EYE / 2 - 0.55} r={1.05} fill={BULB} />
    </Svg>
  );
});
const EYE = 22;

/**
 * The house waiting: only his eyes, in the dark, slowly brightening and dimming.
 * They come up after EYES_AFTER_MS, so an answer that comes quickly shows nothing
 * at all. With `label`, they are the progress a screen reader is told of; without
 * one, the words beside them say it and the eyes are silent.
 */
export function BusterEyes({ label, style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  const live = useLive();
  const shown = useSharedValue(0);
  const left = useSharedValue(1);
  const right = useSharedValue(1);

  // The wait is a gate, not a motion: Reanimated skips a delay under Reduce Motion
  // unless told otherwise, and the eyes would flash on every quick answer.
  useEffect(() => {
    shown.value = withDelay(EYES_AFTER_MS, withTiming(1, { duration: MS.considered, easing: arrive() }), ReduceMotion.Never);
    return () => cancelAnimation(shown);
  }, [shown]);

  useEffect(() => {
    if (!live) {
      cancelAnimation(left); cancelAnimation(right);
      left.value = 1; right.value = 1;
      return;
    }
    const pulse = () => withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    left.value = pulse();
    right.value = withDelay(300, pulse());
    return () => { cancelAnimation(left); cancelAnimation(right); };
  }, [live, left, right]);

  const appear = useAnimatedStyle(() => ({ opacity: shown.value }));
  const l = useAnimatedStyle(() => ({ opacity: left.value }));
  const r = useAnimatedStyle(() => ({ opacity: right.value }));
  const voice = label
    ? { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel: label }
    : UNSPOKEN;

  return (
    <Animated.View testID="buster-eyes" style={[s.eyes, style, appear]} {...voice}>
      <Animated.View style={l}><Eye /></Animated.View>
      <Animated.View style={r}><Eye /></Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', flexShrink: 1, minHeight: 0 },
  // Gives way first when a screen is short of room: the words keep theirs.
  room: { flexShrink: 1, minHeight: 0 },
  eyes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bubble: {
    marginTop: 10,
    backgroundColor: 'rgba(28,23,16,0.8)',
    borderColor: colors.ash,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: 240,
    alignItems: 'center',
  },
  bubbleTail: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.ash,
  },
  bubbleText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.bone,
    textAlign: 'center',
    lineHeight: 18,
  },
});
