import { useEffect } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, cancelAnimation, runOnUI, ReduceMotion } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';

export function useAmbientGlow(baseline = 0.04, peak = 0.08, duration = 3000) {
    const isFocused = useIsFocused();
    const glowOpacity = useSharedValue(baseline);

    useEffect(() => {
        const startAnimation = () => {
            'worklet';
            // A glow that breathes for ever is exactly what the system setting
            // exists to stop. ReduceMotion.System holds it at the baseline for
            // anyone who asked, and changes nothing for everyone else — every
            // screen using this hook inherits that.
            glowOpacity.value = withRepeat(
                withTiming(peak, { duration, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
                -1,
                true
            );
        };

        const stopAnimation = () => {
            'worklet';
            cancelAnimation(glowOpacity);
            glowOpacity.value = baseline;
        };

        if (isFocused) {
            runOnUI(startAnimation)();
        } else {
            runOnUI(stopAnimation)();
        }
        
        return () => {
            runOnUI(stopAnimation)();
        };
    }, [isFocused, glowOpacity, baseline, peak, duration]);

    const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

    return glowStyle;
}
