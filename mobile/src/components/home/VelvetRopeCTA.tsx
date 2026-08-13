/**
 * VelvetRopeCTA & BrassSheen — Unauthenticated Lobby Welcome Screen CTAs.
 */
import { memo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, interpolate, cancelAnimation, useReducedMotion
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

 
export const ShimmerRule = memo(() => {
    const isFocused = useIsFocused();
    const reducedMotion = useReducedMotion();
    const shimmer = useSharedValue(-1);
    // ShimmerRule is not only the logged-out CTA's underline — FeaturedCritique
    // renders it on the authenticated Lobby too, so this `-1` loop was running
    // forever on every other tab for the rest of the session. Parked at -1, the
    // rule keeps its faint base line and simply loses the travelling highlight.
    useEffect(() => {
       if (!isFocused || reducedMotion) {
         cancelAnimation(shimmer);
         shimmer.value = -1;
         return;
       }
       shimmer.value = -1;
       shimmer.value = withRepeat(
         withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
         -1, false
       );
       return () => cancelAnimation(shimmer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocused, reducedMotion]);
    const shimmerStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(shimmer.value, [-1, 1], [-100, 300]) }]
    }));
    return (
       <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(184,137,26,0.1)', overflow: 'hidden' }}>
          <Animated.View style={[{ width: 60, height: '100%' }, shimmerStyle]}>
             <LinearGradient colors={['transparent', 'rgba(218,165,32,0.8)', 'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
       </View>
    );
});

 
export const VelvetRopeCTA = memo(() => {
    const router = useRouter();

    return (
       <PressableScale
          style={s.ctaSecondaryNoir}
          onPress={() => { TactileEngine.destroy(); (router.push as any)('/login' as any); }}
       >
          <Text style={s.ctaSecondaryNoirText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>ALREADY A MEMBER?</Text>
          <ShimmerRule />
       </PressableScale>
    );
});

 
export const BrassSheen = memo(() => {
    const isFocused = useIsFocused();
    const reducedMotion = useReducedMotion();
    const sheen = useSharedValue(-2);
    // Same parking as ShimmerRule. The sheen is a decorative highlight sweeping
    // across the brass plate; parked off-frame at -2 the plate reads exactly as
    // it does between sweeps, so nothing is lost but the motion.
    useEffect(() => {
       if (!isFocused || reducedMotion) {
         cancelAnimation(sheen);
         sheen.value = -2;
         return;
       }
       sheen.value = -2;
       sheen.value = withRepeat(
         withTiming(2, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
         -1, false
       );
       return () => cancelAnimation(sheen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocused, reducedMotion]);
    const sheenStyle = useAnimatedStyle(() => ({
       transform: [{ translateX: interpolate(sheen.value, [-2, 2], [-200, 300]) }]
    }));
    return (
       <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
          <Animated.View style={[{ width: '150%', height: '100%', opacity: 0.15 }, sheenStyle]}>
             <LinearGradient colors={['transparent', '#FFF', 'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
       </View>
    );
});

const s = StyleSheet.create({
  ctaSecondaryNoir: { paddingVertical: 12, paddingHorizontal: 24 },
  ctaSecondaryNoirText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.bone, opacity: 0.65 },
});


BrassSheen.displayName = 'BrassSheen';

VelvetRopeCTA.displayName = 'VelvetRopeCTA';

ShimmerRule.displayName = 'ShimmerRule';
