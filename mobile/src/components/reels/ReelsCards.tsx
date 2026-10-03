import React, { memo, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import { AnimatedText } from '@/src/components/text/AnimatedText';
import Animated, {
  SharedValue, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing, interpolate, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useIsFocused } from '@react-navigation/native';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import { StackData, StackFilm } from './types';
import { Heart } from 'lucide-react-native';
import { useMarkCount } from '@/src/stores/markCounts';
import { formatCount } from '@/src/components/dispatch/paper/paperMetrics';
import { counted } from '@/src/components/dispatch/paper/paperText';


const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

// ══════════════════════════════════════════════════════════════
//  PROJECTOR BEAM ATMOSPHERICS (The Reel) - GPU HARDENED
// ══════════════════════════════════════════════════════════════
export const ReelProjectorBeam = memo(function ReelProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const beamSwing = useSharedValue(0.1);
  const flicker = useSharedValue(0.8);
  // Tabs stay mounted: the loops run only while this one is on screen, and resume where they froze.
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(beamSwing);
      cancelAnimation(flicker);
      return;
    }
    beamSwing.value = withRepeat(
      withSequence(
        withTiming(-0.1, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.1, { duration: 12000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
    // A calm 0.92–1.00 flicker: a wider swing strobes on a phone and reads as a glitch.
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.95, { duration: 300 }),
        withTiming(0.98, { duration: 500 }),
        withTiming(0.92, { duration: 200 }),
        withTiming(0.97, { duration: 1600 }),
      ), -1, false
    );
    return () => { cancelAnimation(beamSwing); cancelAnimation(flicker); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const style = useAnimatedStyle(() => {
    // Mathematical GPU Culling: Disable beam layer opacity entirely when scrolled far down
    return {
      opacity: scrollY.value > 600 ? 0 : flicker.value * Math.min(1, Math.max(0, 1 - (scrollY.value / 600))),
      transform: [
        { perspective: 400 },
        { rotateX: '55deg' },
        { rotateZ: `${beamSwing.value * 15}deg` },
        { scaleY: 1.5 },
        { translateY: -height * 0.1 }
      ],
    };
  });

  return (
    <Animated.View style={[st.beamAbsolute, style]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(218,165,32,0.12)', 'rgba(184,137,26,0.04)', 'transparent']}
        locations={[0, 0.4, 0.9]}
        style={[st.beamGradient, { width: width * 1.5, height, borderTopLeftRadius: width, borderTopRightRadius: width }]}
      />
    </Animated.View>
  );
});

// ══════════════════════════════════════════════════════════════
//  TUNGSTEN FILAMENT FILTER CHIP
// ══════════════════════════════════════════════════════════════
/** The space between two filter chips; each reaches half of it, so no tap belongs to both. */
export const FILTER_GAP = 12;
const CHIP_HALO = { top: 10, bottom: 10, left: FILTER_GAP / 2, right: FILTER_GAP / 2 };

export const FilterChip = memo(function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const isFocused = useIsFocused();
  const pulse = useSharedValue(0);
  useEffect(() => {
    // Focus-gated: chips on the hidden tab (both lists stay mounted for the
    // crossfade) and on blurred screens burn zero UI-thread cycles.
    if (active && isFocused) {
      pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = active ? 0.75 : 0;
    }
    return () => cancelAnimation(pulse);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isFocused]);

  const activeStyle = useAnimatedStyle(() => {
    if (!active) return { opacity: 0 };
    return { opacity: interpolate(pulse.value, [0, 1], [0.5, 1]) };
  });

  return (
    <PressableScale
      onPress={onPress}
      style={[st.filterChip, active ? st.filterChipActiveBorder : null]}
      hitSlop={CHIP_HALO}
      accessibilityState={{ selected: active }}
    >
      <View style={st.filterChipInner}>
         <Animated.View style={[StyleSheet.absoluteFillObject, activeStyle]}>
            <LinearGradient colors={['rgba(218,165,32,0.0)', 'rgba(218,165,32,0.4)', 'rgba(218,165,32,0.0)']} start={{x:0, y:0.5}} end={{x:1, y:0.5}} style={StyleSheet.absoluteFillObject} />
         </Animated.View>
      </View>
      <Text style={[st.filterChipText, active && st.filterChipTextActive]}>{label}</Text>
    </PressableScale>
  );
});

// ══════════════════════════════════════════════════════════════
//  STACK CARD — Compact Dossier Card (Parity with Web)
// ══════════════════════════════════════════════════════════════
const PRESET_GRADIENTS: readonly [string, string, ...string[]][] = [
  ['#1a0e05', '#3a2010', '#0D0B09'],
  ['#0D0B09', '#26201A', '#2a1a05'],
  ['#05080a', '#101820', '#1a2010'],
  ['#0a0508', '#1a0f18', '#0a0508'],
];

export const StackCard = memo(function StackCard({ stack, onPress }: { stack: StackData; onPress: () => void }) {
  const posters = (stack.films ?? []).filter((f: StackFilm) => f.poster_path).slice(0, 3);
  const stackIdStr = stack.id ? String(stack.id) : '';
  const refCode = stackIdStr ? `REF: ${stackIdStr.slice(0, 4).toUpperCase()}` : 'REF: 0000';
  
  const hash = stackIdStr ? stackIdStr.charCodeAt(0) : 0;
  const gradientColors = PRESET_GRADIENTS[Math.abs(hash) % PRESET_GRADIENTS.length];
  // Live: certifying on the stack's own page moves this card's number too.
  const certifyCount = useMarkCount('certify', stackIdStr, stack.certifyCount);
  const certifyShown = formatCount(certifyCount ?? 0);

  return (
    <PressableScale
      onPress={onPress}
      style={st.stackCard}
      haptic
      accessibilityLabel={`${stack.title ?? 'A stack'}. ${stack.count ?? 0} ${(stack.count ?? 0) === 1 ? 'film' : 'films'}, curated by @${stack.curator ?? 'society'}. Opens the stack.`}
    >
      <View style={st.stackCardPosterWrap}>
        {posters.length === 0 ? (
          <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={st.stackCardPosterRow}>
            {posters.map((f: StackFilm, i: number) => (
              <View key={i} style={[st.stackCardPosterPanel, { width: `${100 / posters.length}%` }]}>
                <Image
                  source={{ uri: `${TMDB_IMG}${f.poster_path}` }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  placeholder={{ blurhash: SEPIA_HASH }}
                  transition={100}
                />
                {i < posters.length - 1 && (
                  <LinearGradient 
                    colors={['transparent', 'rgba(13,11,9,0.8)']} 
                    start={{ x: 0.8, y: 0 }} end={{ x: 1, y: 0 }} 
                    style={StyleSheet.absoluteFillObject} 
                  />
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      <LinearGradient 
        colors={['rgba(13,11,9,0)', 'rgba(6,5,4,0.9)', 'rgba(6,5,4,1)']} 
        locations={[0, 0.4, 0.9]} 
        style={StyleSheet.absoluteFillObject} 
      />

      <View style={st.stackCardRef}>
        <Text style={st.stackCardRefText}>{refCode}</Text>
      </View>

      <View style={st.stackCardContent}>
        <View style={st.stackCardMetaRow}>
          <Text style={st.stackCardBadgeText}>
            {(stack.count ?? 0)} {(stack.count ?? 0) === 1 ? 'FILM' : 'FILMS'}
          </Text>
          {stack.isRanked && (
            <Text style={[st.stackCertifyText, { color: colors.sepia }]}>✦ RANKED</Text>
          )}
          {/* The certify mark and its count, as every bar in the house draws
              them: the heart, then the number. It was `✦ 3` — the same star
              RANKED wears one word to the left, so the two read as one fact. */}
          {certifyShown ? (
            <View style={st.stackCertify}>
              <Heart size={9} strokeWidth={2.2} color={colors.flicker} />
              <Text style={st.stackCertifyText} accessibilityLabel={counted(certifyCount ?? 0, 'certification', 'certifications')}>
                {certifyShown}
              </Text>
            </View>
          ) : null}
          <View style={st.stackCardMetaDivider} />
        </View>

        {/* One title size across the grid and an honest ellipsis: no shrink-to-fit. */}
        <Text style={st.stackCardTitle} numberOfLines={2} ellipsizeMode="tail">{(stack.title ?? '').toUpperCase()}</Text>

        <View style={st.stackCardCuratorRow}>
          <View style={st.stackCardCuratorDot} />
          <Text style={st.stackCardCuratorName} numberOfLines={1} ellipsizeMode="tail">@{(stack.curator ?? 'society').toUpperCase()}</Text>
        </View>
      </View>
    </PressableScale>
  );
});

// ════════════════════════════════════════════════════════════════
//  TUNGSTEN SPOOLING (God-Tier Loading sequence)
// ════════════════════════════════════════════════════════════════
export const TungstenSpooling = memo(function TungstenSpooling() {
  const flicker = useSharedValue(0.4);
  useEffect(() => {
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 50 }),
        withTiming(0.4, { duration: 100 }),
        withTiming(0.9, { duration: 30 }),
        withTiming(0.3, { duration: 250 }),
        withTiming(0.8, { duration: 80 })
      ), -1, true
    );
    return () => cancelAnimation(flicker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: flicker.value }));
  return (
    <View style={st.spoolingWrap}>
      <Animated.View style={[style, st.spoolingIconWrap]}>
        <Buster size={40} mood="thinking" />
      </Animated.View>
      <AnimatedText style={[style, st.spoolingText]}>
         SPOOLING
      </AnimatedText>
    </View>
  );
});

const st = StyleSheet.create({
  filterChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)',
    backgroundColor: 'rgba(30,25,20,0.5)',
  },
  // Solid fogQuiet: an unselected filter reads as unselected, not disabled.
  filterChipText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fogQuiet },
  filterChipTextActive: { color: colors.sepia, opacity: 1 },

  stackCard: {
    // The app's 1px brass dossier frame.
    flex: 1, backgroundColor: colors.inkwell,
    borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: 5, overflow: 'hidden',
    height: 220,
    marginBottom: 14,
    position: 'relative',
    ...effects.shadowPrimary, ...effects.flat,
  },
  stackCardPosterWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 0,
    opacity: 0.8,
  },
  stackCardPosterPanel: {
    height: '100%',
  },
  stackCardPosterRow: { flexDirection: 'row', width: '100%', height: '100%' },
  stackCardRef: {
    position: 'absolute',
    top: 8, right: 8,
    backgroundColor: 'rgba(6,5,4,0.8)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)',
    zIndex: 10,
  },
  stackCardRefText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.parchment,
  },
  stackCardContent: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 12,
    zIndex: 10,
  },
  stackCardMetaRow: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 
  },
  stackCardBadgeText: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.sepia
  },
  stackCertify: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stackCertifyText: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.flicker
  },
  stackCardMetaDivider: {
    flex: 1, height: 1, backgroundColor: 'rgba(184,137,26,0.3)',
    marginLeft: 4,
  },
  stackCardTitle: {
    fontFamily: fonts.display, fontSize: 16, color: colors.parchment,
    lineHeight: 18, marginBottom: 8,
  },
  stackCardCuratorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stackCardCuratorDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia,
    opacity: 0.8,
  },
  stackCardCuratorName: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.fog
  },
  beamAbsolute: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    zIndex: 0,
  },
  beamGradient: {

  },
  filterChipActiveBorder: {
    borderColor: 'rgba(218,165,32,0.6)',
  },
  filterChipInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: 'hidden',
  },
  spoolingWrap: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spoolingIconWrap: {
    padding: 30,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)',
    borderRadius: 100,
    borderStyle: 'dashed',
  },
  spoolingText: {
    marginTop: 24,
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 6,
    color: colors.sepia,
    ...effects.textGlowSepia,
  },
});


