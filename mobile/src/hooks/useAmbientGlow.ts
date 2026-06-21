import { useEffect } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, cancelAnimation, runOnUI } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';

export function useAmbientGlow(baseline = 0.04, peak = 0.08, duration = 3000) {
    const isFocused = useIsFocused();
    const glowOpacity = useSharedValue(baseline);

    useEffect(() => {
        const startAnimation = () => {
            'worklet';
            glowOpacity.value = withRepeat(
                withTiming(peak, { duration, easing: Easing.inOut(Easing.ease) }),
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
