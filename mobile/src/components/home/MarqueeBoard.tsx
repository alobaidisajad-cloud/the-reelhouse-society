/**
 * MarqueeBoard — The hero marquee centerpiece of the Lobby.
 * ────────────────────────────────────────────────────────────────────
 * Built as a BRASS CABINET — one constructed object, the way a real 1924
 * picture-palace canopy was built:
 *
 *   · Double brass molding (outer frame + cabinet gap + inner molding)
 *   · Four corner studs bolted to the outer frame
 *   · Bulb fascias mounted BETWEEN the moldings, top and bottom
 *   · A keystone chip set centered among the top bulbs
 *   · THE USHER'S CHASE — a single warm peak of light glides along the
 *     top fascia and returns along the bottom, like current in a circuit.
 *
 * Perf: ONE focus-gated chase clock replaces the previous 16 independent
 * infinite bulb loops. Every bulb derives its glow from the same shared
 * value on the UI thread. Reduce-motion → steady warm glow, no motion.
 *
 * Construction note: the OUTER frame must NOT clip (the corner studs sit
 * on its corners); the INNER molding carries overflow:'hidden' to clip
 * the Ken Burns poster inside the rounded cabinet.
 */
import { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  Easing, cancelAnimation, useReducedMotion, type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { supabase } from '@/src/lib/supabase';
import type { TMDBFilm } from './types';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

// One stately lap of the canopy circuit (~5.2s — an usher's pace, not Vegas)
const CHASE_LAP_MS = 5200;

// ── CHASE BULB — brass socket + tungsten core, glow derived from the clock ──
const ChaseBulb = memo(function ChaseBulb({
  phase,
  offset,
  steady,
}: {
  phase: SharedValue<number>;
  offset: number;
  steady: boolean;
}) {
  const coreStyle = useAnimatedStyle(() => {
    if (steady) {
      return { opacity: 0.85, transform: [{ scale: 1 }] };
    }
    // Circular distance from the travelling peak (wraps at the lap seam)
    let d = Math.abs(phase.value - offset);
    if (d > 0.5) d = 1 - d;
    // Warm falloff ≈ 1.2 bulb-widths wide
    const glow = Math.max(0, 1 - d * 6);
    return {
      opacity: 0.3 + glow * 0.7,
      transform: [{ scale: 1 + glow * 0.15 }],
    };
  });

  return (
    <View style={s.bulbSocket}>
      <Animated.View style={[s.bulbCore, coreStyle]} />
    </View>
  );
});

// ── CHASE FASCIA — bulbs mounted on the cabinet molding ──
// Top row runs L→R with the keystone chip set among the bulbs;
// bottom row runs R→L so the light circles the frame like a circuit.
const ChaseFascia = memo(function ChaseFascia({
  phase,
  steady,
  reverse = false,
  keystone = false,
}: {
  phase: SharedValue<number>;
  steady: boolean;
  reverse?: boolean;
  keystone?: boolean;
}) {
  const count = keystone ? 6 : 7;
  const bulbs = Array.from({ length: count }, (_, i) => {
    const offset = reverse ? (count - 1 - i) / count : i / count;
    return <ChaseBulb key={i} phase={phase} offset={offset} steady={steady} />;
  });

  if (keystone) {
    // 3 bulbs · keystone · 3 bulbs — the canopy's centered nameplate
    bulbs.splice(3, 0,
      <View key="keystone" style={s.keystone}>
        <Text style={s.keystoneMark} allowFontScaling={false}>✦</Text>
      </View>
    );
  }

  return (
    <View
      style={[s.fascia, keystone ? s.fasciaTop : s.fasciaBottom]}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      {bulbs}
    </View>
  );
});

// ── BRASS CABINET — frame, studs, moldings, fascias; hosts any board ──
function MarqueeCabinet({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const phase = useSharedValue(0);

  useEffect(() => {
    // The single chase clock — parks completely when the tab loses focus.
    if (isFocused && !reducedMotion) {
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(1, { duration: CHASE_LAP_MS, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(phase);
      phase.value = 0;
    }
    return () => cancelAnimation(phase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, reducedMotion]);

  const steady = !!reducedMotion;

  const inner = (
    <>
      {/* Corner studs — bolted to the outer frame (non-clipping layer) */}
      <View style={[s.stud, s.studTL]} pointerEvents="none" />
      <View style={[s.stud, s.studTR]} pointerEvents="none" />
      <View style={[s.stud, s.studBL]} pointerEvents="none" />
      <View style={[s.stud, s.studBR]} pointerEvents="none" />

      {/* Inner molding — clips the Ken Burns poster inside the cabinet */}
      <View style={s.cabinetInner}>
        <ChaseFascia phase={phase} steady={steady} keystone />
        {children}
        <ChaseFascia phase={phase} steady={steady} reverse />
      </View>
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        style={s.cabinetOuter}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {inner}
      </PressableScale>
    );
  }
  return <View style={s.cabinetOuter}>{inner}</View>;
}

// ── TUNGSTEN IGNITION (Loading State) — inherits the same cabinet ──
const TungstenIgnition = memo(function TungstenIgnition() {
  const flicker = useSharedValue(0.1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      flicker.value = 0.8;
      return;
    }
    flicker.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 50, easing: Easing.linear }),
        withTiming(0.2, { duration: 100, easing: Easing.linear }),
        withTiming(0.9, { duration: 40 }),
        withTiming(0.1, { duration: 300 }),
        withTiming(0.6, { duration: 100, easing: Easing.linear }),
        withTiming(0.15, { duration: 800 })
      ), -1, false
    );
    return () => cancelAnimation(flicker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: flicker.value }));

  return (
    <View style={s.marqueeBoard}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 140 }}>
         <Text style={[s.marqueeEyebrow, { opacity: 0.5 }]}>WARMING UP THE ARC LAMP...</Text>
         <Animated.View style={[{ width: '80%', height: 2, backgroundColor: '#E7C173', marginTop: 16, ...effects.glowSepia }, animStyle]} />
      </View>
    </View>
  );
});

// ── MAIN MARQUEE BOARD ──
export const MarqueeBoard = memo(function MarqueeBoard({ film }: { film: TMDBFilm | null }) {
  const router = useRouter();
  const [localCount, setLocalCount] = useState(0);
  const reducedMotion = useReducedMotion();

  const kenBurns = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      kenBurns.value = 1;
      return;
    }
    if (film) {
      kenBurns.value = withRepeat(
         withSequence(
             withTiming(1.05, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
             withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.ease) })
         ), -1, true
      );
    }
    return () => cancelAnimation(kenBurns);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film]);

  const bgStyle = useAnimatedStyle(() => ({
      transform: [{ scale: kenBurns.value }]
  }));

  useEffect(() => {
    if (!film?.id) return;
    let isMounted = true;
    supabase.from('logs').select('id', { count: 'exact', head: true }).eq('film_id', film.id)
      .then(({ count }) => { if (isMounted) setLocalCount(count ?? 0); });
    return () => { isMounted = false; };
  }, [film?.id]);

  const globalCount = film?.vote_count ?? 0;
  const reviewText = localCount > 0
    ? `${localCount} SOCIETY REVIEW${localCount === 1 ? '' : 'S'}`
    : globalCount > 0
      ? (globalCount > 100 ? `${Math.floor(globalCount / 100) * 100}+ GLOBAL RATINGS` : `${globalCount} GLOBAL RATINGS`)
      : 'AWAITING RATINGS';

  if (!film) return (
    <MarqueeCabinet>
      <TungstenIgnition />
    </MarqueeCabinet>
  );

  const posterBg = film.poster_path ? `${TMDB_IMG_W500}${film.poster_path}` : null;

  return (
    <MarqueeCabinet
      onPress={() => { TactileEngine.mutate(); (router.push as any)(`/film/${film.id}` as any); }}
      accessibilityLabel={`The weekly feature: ${film.title ?? 'Reelhouse'}`}
    >
      <View style={s.marqueeBoard}>
        {posterBg && (
          <AnimatedExpoImage
            source={{ uri: posterBg }}
            style={[s.marqueeBgImg, bgStyle]}
            blurRadius={Platform.OS === 'ios' ? 15 : 10}
            cachePolicy="memory-disk"
            placeholder={{ blurhash: SEPIA_HASH }}
            transition={1200}
            contentFit="cover"
          />
        )}
        <LinearGradient
          colors={['rgba(14,11,8,0.3)', 'rgba(14,11,8,0.7)', 'rgba(14,11,8,0.95)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={['rgba(184,137,26,0.12)', 'transparent']}
          locations={[0, 1]}
          style={s.marqueeSpotlight}
        />

        <View style={s.marqueeContent}>
          <Text style={s.marqueeEyebrow}>✦ THE WEEKLY FEATURE ✦</Text>
          {/* Clamped: this line had no limit and wraps to two centred lines
              today. A longer one would take three and push the film title down
              inside a card that reads as fixed-height. */}
          <Text style={s.marqueeLoreSub} numberOfLines={2}>As decreed by the Programming Committee</Text>

          <View style={s.marqueeTitleWrap}>
            <Text style={s.marqueeTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
              {(film.title ?? 'REELHOUSE').toUpperCase()}
            </Text>
          </View>

          <LinearGradient
            colors={['transparent', colors.sepia, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.marqueeRule}
          />

          <View style={s.marqueeMetaRow}>
            {film.release_date && (
              <View style={s.marqueeYearPill}>
                <Text style={s.marqueeYearText}>{film.release_date.slice(0, 4)}</Text>
              </View>
            )}
            <ReelRating rating={Math.round(film.vote_average ?? 0) / 2} size={14} />
          </View>
          <Text style={s.marqueeReviewCount}>{reviewText}</Text>
        </View>
      </View>
    </MarqueeCabinet>
  );
});

const s = StyleSheet.create({
  // ── The Brass Cabinet ──
  cabinetOuter: {
    marginHorizontal: 16,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.45)',
    padding: 3,
    backgroundColor: '#0B0906',
    ...effects.shadowPrimary,
    // NO overflow:hidden here — the corner studs live on this layer.
  },
  cabinetInner: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.16)',
    overflow: 'hidden',
    backgroundColor: 'rgba(14,11,8,0.9)',
  },
  stud: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.sepia,
    zIndex: 2,
  },
  studTL: { top: -2.5, left: -2.5 },
  studTR: { top: -2.5, right: -2.5 },
  studBL: { bottom: -2.5, left: -2.5 },
  studBR: { bottom: -2.5, right: -2.5 },

  // ── Bulb fascias (mounted between the moldings) ──
  fascia: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 13,
    backgroundColor: '#0C0A07',
  },
  fasciaTop: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(184,137,26,0.2)',
  },
  fasciaBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(184,137,26,0.2)',
  },
  bulbSocket: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.4)',
    backgroundColor: '#0B0906',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulbCore: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    // Warm tungsten core with an amber halo — deliberately hotter than brass.
    backgroundColor: '#FCEBB8',
    shadowColor: colors.marqueeGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 4,
  },
  keystone: {
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.35)',
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 1,
    backgroundColor: colors.ink,
  },
  keystoneMark: {
    fontFamily: fonts.sub,
    fontSize: 8,
    color: colors.sepia,
    includeFontPadding: false,
  },

  // ── The board inside the cabinet ──
  marqueeBoard: {
    minHeight: 180,
    overflow: 'hidden',
    position: 'relative',
  },
  marqueeBgImg: {
    ...StyleSheet.absoluteFillObject,
  },
  marqueeSpotlight: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: '60%',
    borderBottomLeftRadius: 200,
    borderBottomRightRadius: 200,
  },
  marqueeContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flex: 1,
    justifyContent: 'center',
  },
  marqueeEyebrow: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    textAlign: 'center',
    marginBottom: 2,
    // Soft dark shadow keeps the label readable over a bright poster.
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  marqueeLoreSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    textAlign: 'center',
    opacity: 0.72,
    marginBottom: 10,
    fontStyle: 'italic',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  marqueeTitleWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  marqueeTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.parchment,
    textAlign: 'center',
    lineHeight: 34,
    // Soft dark shadow (not a sepia glow) so the title stays legible over ANY
    // poster — bright or dark — regardless of the feature film.
    textShadowColor: 'rgba(0,0,0,0.78)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  marqueeRule: {
    height: 1,
    width: 92,
    alignSelf: 'center',
    marginVertical: 11,
    opacity: 0.7,
  },
  marqueeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
  },
  marqueeYearPill: {
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)',
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  marqueeYearText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.sepia,
  },
  marqueeReviewCount: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2.5,
    color: colors.fog,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.7,
  },
});
