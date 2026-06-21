import React, { useEffect, memo } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withRepeat, 
    withSequence, 
    withTiming, 
    Easing 
} from 'react-native-reanimated';
import Svg, { Path, Ellipse, Circle, Rect, G } from 'react-native-svg';
import { colors, fonts } from '@/src/theme/theme';

export type BusterMood = 'neutral' | 'crying' | 'smiling' | 'peeking' | 'thinking' | 'sleeping';

interface BusterProps {
    size?: number;
    message?: string;
    mood?: BusterMood;
    style?: StyleProp<ViewStyle>;
}

/** Resolve Buster's default mood based on time of day — the ghost lives in the app */
function clockMood(): BusterMood {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 6) return 'sleeping';      // Midnight–6am: even ghosts rest
    if (hour >= 6 && hour < 10) return 'peeking';       // Morning: just woke up
    if (hour >= 10 && hour < 17) return 'neutral';      // Midday: at work
    if (hour >= 17 && hour < 22) return 'smiling';      // Evening: prime movie hours
    return 'thinking';                                   // Late night: contemplating cinema
}

const busterColors = {
    body: '#E8DFC8',
    eyes: '#0A0703',
    mouth: '#0A0703',
    tear: '#8B6914',
};

export default memo(function Buster({ size = 120, message, mood, style }: BusterProps) {
    const activeMood = mood ?? clockMood();
    const floatY = useSharedValue(0);

    // Floating animation
    useEffect(() => {
        floatY.value = withRepeat(
            withSequence(
                withTiming(-8, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
                withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) })
            ),
            -1, // Loop forever
            true
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: floatY.value }],
    }));


    const renderMoodFace = () => {
        switch (activeMood) {
            case 'crying':
                return (
                    <G>
                        <Ellipse cx="30" cy="62" rx="4" ry="8" fill={busterColors.tear} opacity={0.7} />
                        <Ellipse cx="70" cy="62" rx="4" ry="8" fill={busterColors.tear} opacity={0.7} />
                        <Path d="M 34 74 Q 50 64 66 74" stroke={busterColors.mouth} strokeWidth="2.5" fill="none" />
                        <Rect x="40" y="68" width="3" height="4" fill={busterColors.mouth} rx="0.5" />
                        <Rect x="47" y="67" width="3" height="5" fill={busterColors.mouth} rx="0.5" />
                        <Rect x="54" y="68" width="3" height="4" fill={busterColors.mouth} rx="0.5" />
                    </G>
                );
            case 'smiling':
                return (
                    <G>
                        <Path d="M 28 66 Q 50 84 72 66" stroke={busterColors.mouth} strokeWidth="2" fill="none" />
                        <Rect x="32" y="67" width="3" height="5" fill={busterColors.mouth} rx="0.3" />
                        <Rect x="37" y="67" width="3" height="7" fill={busterColors.mouth} rx="0.3" />
                        <Rect x="42" y="68" width="3" height="7" fill={busterColors.mouth} rx="0.3" />
                        <Rect x="47" y="68" width="3" height="8" fill={busterColors.mouth} rx="0.3" />
                        <Rect x="52" y="68" width="3" height="7" fill={busterColors.mouth} rx="0.3" />
                        <Rect x="57" y="67" width="3" height="7" fill={busterColors.mouth} rx="0.3" />
                        <Rect x="62" y="67" width="3" height="5" fill={busterColors.mouth} rx="0.3" />
                    </G>
                );
            case 'peeking':
                return (
                    <G>
                        <Path d="M 38 68 Q 50 76 62 66" stroke={busterColors.mouth} strokeWidth="2.5" fill="none" />
                        <Rect x="44" y="68" width="3" height="5" fill={busterColors.mouth} rx="0.5" />
                        <Rect x="49" y="69" width="3" height="4" fill={busterColors.mouth} rx="0.5" />
                    </G>
                );
            case 'thinking':
                return (
                    <G>
                        {/* Slightly pursed mouth — pondering */}
                        <Path d="M 42 70 Q 50 74 58 70" stroke={busterColors.mouth} strokeWidth="2" fill="none" />
                        <Rect x="46" y="70" width="3" height="3" fill={busterColors.mouth} rx="0.5" />
                    </G>
                );
            case 'sleeping':
                return (
                    <G>
                        {/* Peaceful closed-crescent eyes (overrides default eyes) */}
                        {/* tiny "z z z" */}
                        <Path d="M 72 30 L 78 30 L 72 38 L 78 38" stroke={busterColors.tear} strokeWidth="1.5" fill="none" opacity={0.6} />
                        <Path d="M 78 22 L 83 22 L 78 28 L 83 28" stroke={busterColors.tear} strokeWidth="1.2" fill="none" opacity={0.4} />
                        {/* Serene smile */}
                        <Path d="M 40 68 Q 50 74 60 68" stroke={busterColors.mouth} strokeWidth="2" fill="none" />
                    </G>
                );
            case 'neutral':
            default:
                return (
                    <G>
                        <Path d="M 34 68 Q 50 80 66 68" stroke={busterColors.mouth} strokeWidth="2.5" fill="none" />
                        <Rect x="40" y="68" width="4" height="5" fill={busterColors.mouth} rx="0.5" />
                        <Rect x="46" y="69" width="4" height="6" fill={busterColors.mouth} rx="0.5" />
                        <Rect x="52" y="68" width="4" height="5" fill={busterColors.mouth} rx="0.5" />
                        <Rect x="58" y="67" width="3" height="4" fill={busterColors.mouth} rx="0.5" />
                    </G>
                );
        }
    };

    // Sleeping mood: crescent eyes instead of open eyes
    const renderEyes = () => {
        if (activeMood === 'sleeping') {
            return (
                <G>
                    <Path d="M 32 52 Q 38 46 44 52" stroke={busterColors.eyes} strokeWidth="2.5" fill="none" />
                    <Path d="M 56 52 Q 62 46 68 52" stroke={busterColors.eyes} strokeWidth="2.5" fill="none" />
                </G>
            );
        }
        // Thinking mood: eyes look upward
        const eyeY = activeMood === 'thinking' ? '48' : '52';
        const eyeRy = activeMood === 'peeking' ? '5' : '7';
        const pupilY = activeMood === 'thinking' ? '46' : activeMood === 'peeking' ? '51' : '50';
        return (
            <G>
                <Ellipse cx="38" cy={eyeY} rx="6" ry={eyeRy} fill={busterColors.eyes} />
                <Ellipse cx="62" cy={eyeY} rx="6" ry={eyeRy} fill={busterColors.eyes} />
                <Circle cx="40" cy={pupilY} r="2" fill="white" />
                <Circle cx="64" cy={pupilY} r="2" fill="white" />
            </G>
        );
    };

    return (
        <View style={[s.container, style]}>
            <Animated.View style={animatedStyle}>
                <Svg width={size} height={size * 1.4} viewBox="0 0 100 140">
                    {/* Ghostly body */}
                    <Path
                        d="M 10 55 Q 10 10 50 10 Q 90 10 90 55 L 90 100 Q 82 90 74 100 Q 66 110 58 100 Q 50 90 42 100 Q 34 110 26 100 Q 18 90 10 100 Z"
                        fill={busterColors.body}
                        opacity={0.92}
                    />
                    {/* Glow */}
                    <Path
                        d="M 10 55 Q 10 10 50 10 Q 90 10 90 55 L 90 100 Q 82 90 74 100 Q 66 110 58 100 Q 50 90 42 100 Q 34 110 26 100 Q 18 90 10 100 Z"
                        fill="none"
                        stroke="rgba(242,232,160,0.15)"
                        strokeWidth="3"
                    />

                    {/* Eyes — mood-aware via renderEyes() */}
                    {renderEyes()}

                    {/* Mood */}
                    {renderMoodFace()}
                    
                    {/* Props */}
                    {activeMood === 'smiling' && (
                        <Path d="M 42 16 L 44 8 L 50 14 L 56 8 L 58 16 Z" fill="#8B6914" stroke="#F2E8A0" strokeWidth="0.5" />
                    )}
                </Svg>
            </Animated.View>

            {message && (
                <Animated.View style={animatedStyle}>
                    <View style={s.bubble}>
                        <View style={s.bubbleTail} />
                        <Text style={s.bubbleText}>{message}</Text>
                    </View>
                </Animated.View>
            )}
        </View>
    );
});

const s = StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center' },
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
    }
});
