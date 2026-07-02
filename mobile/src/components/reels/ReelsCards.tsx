import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
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


const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

// ══════════════════════════════════════════════════════════════
//  PROJECTOR BEAM ATMOSPHERICS (The Reel) - GPU HARDENED
// ══════════════════════════════════════════════════════════════
export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const beamSwing = useSharedValue(0.1);
  const flicker = useSharedValue(0.8);

  useEffect(() => {
    beamSwing.value = withRepeat(
      withSequence(
        withTiming(-0.1, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.1, { duration: 12000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0.85, { duration: 100 }),
        withTiming(0.95, { duration: 250 }),
        withTiming(0.7, { duration: 50 }),
        withTiming(0.9, { duration: 1200 }),
      ), -1, false
    );
    return () => { cancelAnimation(beamSwing); cancelAnimation(flicker); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
  ['#1a0e05', '#3a2010', '#0a0703'],
  ['#0a0a0a', '#1c1710', '#2a1a05'],
  ['#05080a', '#101820', '#1a2010'],
  ['#0a0508', '#1a0f18', '#0a0508'],
];

export const StackCard = memo(function StackCard({ stack, onPress }: { stack: StackData; onPress: () => void }) {
  const posters = (stack.films ?? []).filter((f: StackFilm) => f.poster_path).slice(0, 3);
  const stackIdStr = stack.id ? String(stack.id) : '';
  const refCode = stackIdStr ? `REF: ${stackIdStr.slice(0, 4).toUpperCase()}` : 'REF: 0000';
  
  const hash = stackIdStr ? stackIdStr.charCodeAt(0) : 0;
  const gradientColors = PRESET_GRADIENTS[Math.abs(hash) % PRESET_GRADIENTS.length];

  return (
    <PressableScale onPress={onPress} style={st.stackCard} haptic>
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
                    colors={['transparent', 'rgba(10,10,10,0.8)']} 
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
        colors={['rgba(15,12,8,0)', 'rgba(5,3,2,0.9)', 'rgba(5,3,2,1)']} 
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
          {stack.certifyCount > 0 && (
            <Text style={st.stackCertifyText}>✦ {stack.certifyCount}</Text>
          )}
          <View style={st.stackCardMetaDivider} />
        </View>

        <Text style={st.stackCardTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{(stack.title ?? '').toUpperCase()}</Text>

        <View style={st.stackCardCuratorRow}>
          <View style={st.stackCardCuratorDot} />
          <Text style={st.stackCardCuratorName} numberOfLines={1} ellipsizeMode="tail">@{(stack.curator ?? 'society').toUpperCase()}</Text>
        </View>
      </View>
    </PressableScale>
  );
});

// ════════════════════════════════════════════════════════════════
//  BRASS SHEEN (For Primary Call to Action)
// ════════════════════════════════════════════════════════════════
 
export const BrassSheen = memo(() => {
    const sheen = useSharedValue(-2);
    useEffect(() => {
       sheen.value = withRepeat(
         withTiming(2, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
         -1, false
       );
       return () => cancelAnimation(sheen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const sheenStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(sheen.value, [-2, 2], [-200, 300]) }]
    }));
    return (
       <View style={st.sheenWrap}>
          <Animated.View style={[st.sheenAnim, sheenStyle]}>
             <LinearGradient colors={['transparent', '#FFF', 'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
       </View>
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
      <Animated.Text style={[style, st.spoolingText]}>
         SPOOLING
      </Animated.Text>
    </View>
  );
});

const st = StyleSheet.create({
  filterChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)',
    backgroundColor: 'rgba(18,14,9,0.5)',
  },
  filterChipText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog, opacity: 0.6 },
  filterChipTextActive: { color: colors.sepia, opacity: 1 },

  stackCard: {
    // App-standard 1px brass dossier frame (was a heavy 2px umber slab).
    flex: 1, backgroundColor: '#050402',
    borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: 5, overflow: 'hidden',
    height: 220,
    marginBottom: 14,
    position: 'relative',
    ...effects.shadowPrimary,
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
    backgroundColor: 'rgba(5,3,2,0.8)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)',
    zIndex: 10,
  },
  stackCardRefText: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 2,
    color: colors.parchment,
    opacity: 0.8,
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
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia
  },
  stackCertifyText: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.flicker, opacity: 0.9
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
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog
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
  sheenWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  sheenAnim: {
    width: '150%',
    height: '100%',
    opacity: 0.15,
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


BrassSheen.displayName = 'BrassSheen';
