import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';

const AnimatedView = Animated.createAnimatedComponent(View);

export function RadarChart({ autopsy, size = 120 }: { autopsy: Record<string, number> | null; size?: number }) {
    const data = useMemo(() => {
        if (!autopsy) return null;
        const entries = Object.entries(autopsy).filter(([, v]) => typeof v === 'number');
        if (entries.length < 3) return null;
        
        // Normalize values to 0-1 (assuming 0-10 scale)
        return entries.map(([label, value]) => ({
            label: label.toUpperCase().slice(0, 3), // Abbreviate label
            value: Math.max(0, Math.min(10, value)) / 10
        }));
    }, [autopsy]);

    if (!autopsy) return null;

    if (!data) {
        return (
            <View style={[styles.fallback, { width: size, height: size, borderRadius: size/2 }]}>
                <Text style={styles.fallbackText}>INSUFFICIENT DATA</Text>
            </View>
        );
    }

    const padding = 24; // Space for labels
    const innerSize = size - padding * 2;
    const center = size / 2;
    const radius = innerSize / 2;
    const numAxes = data.length;

    const getCoordinates = (value: number, index: number) => {
        const angle = (Math.PI * 2 * index) / numAxes - Math.PI / 2;
        return {
            x: center + radius * value * Math.cos(angle),
            y: center + radius * value * Math.sin(angle)
        };
    };

    // Calculate polygon points
    const points = data.map((d, i) => {
        const { x, y } = getCoordinates(d.value, i);
        return `${x},${y}`;
    }).join(' ');

    const gridLevels = [0.33, 0.66, 1];

    return (
        <AnimatedView entering={FadeIn.duration(800)} style={{ width: size, height: size }}>
            <Svg width={size} height={size}>
                {/* Background Grid Circles */}
                {gridLevels.map(level => (
                    <Circle
                        key={`grid-${level}`}
                        cx={center}
                        cy={center}
                        r={radius * level}
                        stroke="rgba(184,137,26,0.15)"
                        strokeWidth="1"
                        fill="none"
                    />
                ))}

                {/* Axes */}
                {data.map((_, i) => {
                    const { x, y } = getCoordinates(1, i);
                    return (
                        <Line
                            key={`axis-${i}`}
                            x1={center}
                            y1={center}
                            x2={x}
                            y2={y}
                            stroke="rgba(184,137,26,0.1)"
                            strokeWidth="1"
                        />
                    );
                })}

                {/* Data Polygon */}
                <Polygon
                    points={points}
                    fill="rgba(184,137,26,0.25)"
                    stroke={colors.sepia}
                    strokeWidth="1.5"
                />

                {/* Data Points */}
                {data.map((d, i) => {
                    const { x, y } = getCoordinates(d.value, i);
                    return (
                        <Circle
                            key={`point-${i}`}
                            cx={x}
                            cy={y}
                            r={2.5}
                            fill={colors.parchment}
                        />
                    );
                })}

                {/* Labels */}
                {data.map((d, i) => {
                    const { x, y } = getCoordinates(1.18, i); // Push labels further out
                    return (
                        <SvgText
                            key={`label-${i}`}
                            x={x}
                            y={y}
                            fill={colors.fog}
                            fontSize="8"
                            fontFamily={fonts.sub}
                            textAnchor="middle"
                            alignmentBaseline="middle"
                        >
                            {d.label}
                        </SvgText>
                    );
                })}
            </Svg>
        </AnimatedView>
    );
}

const styles = StyleSheet.create({
    fallback: {
        backgroundColor: 'rgba(11,10,8,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(184,137,26,0.2)'
    },
    fallbackText: {
        fontFamily: fonts.sub,
        fontSize: 8,
        color: colors.fog,
        letterSpacing: 1
    }
});
