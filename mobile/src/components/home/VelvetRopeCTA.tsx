/**
 * VelvetRopeCTA & ShimmerRule — the front door's second button, and its line (its brass plate's
 * sheen is the shared BrassSheen).
 */
import { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, interpolate, cancelAnimation, useReducedMotion
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

 
export const ShimmerRule = memo(() => {
    const isFocused = useIsFocused();
    const reducedMotion = useReducedMotion();
    const shimmer = useSharedValue(-1);
    // Parked at -1 when hidden or under Reduce Motion: the faint line stays, the highlight rests.
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
    // States its form, `login`: a bare push would reopen whichever form was left.
    return (
       <PressableScale
          style={s.ctaSecondaryNoir}
          // the first door stands 24 above (the front door's gap): half of it, no more
          hitSlop={{ top: 12 }}
          onPress={() => { TactileEngine.destroy(); nav.push('/login', { action: 'login' }); }}
       >
          <Text style={s.ctaSecondaryNoirText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>ALREADY A MEMBER?</Text>
          <ShimmerRule />
       </PressableScale>
    );
});

const s = StyleSheet.create({
  ctaSecondaryNoir: { paddingVertical: 12, paddingHorizontal: 24 },
  ctaSecondaryNoirText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.fogQuiet },
});


VelvetRopeCTA.displayName = 'VelvetRopeCTA';

ShimmerRule.displayName = 'ShimmerRule';
