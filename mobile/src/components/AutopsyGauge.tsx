/**
 * AutopsyGauge — "THE AUTOPSY" Celluloid Gauge Display
 *
 * Pixel-perfect native port of web RadarChart (UI.tsx L383-448).
 * NOT a radar chart — it's horizontal segmented progress bars styled
 * like vintage film strip gauges with a deep vignette overlay.
 *
 * 6 axes: Story, Script/Dialogue, Acting/Character, Cinematography,
 *         Editing/Pacing, Sound Design/Score
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/theme/theme';

interface AutopsyGaugeProps {
    autopsy: Record<string, number> | null;
}

const AXES = [
    { key: 'story', label: 'STORY' },
    { key: 'script', label: 'SCRIPT / DIALOGUE' },
    { key: 'acting', label: 'ACTING & CHARACTER' },
    { key: 'cinematography', label: 'CINEMATOGRAPHY' },
    { key: 'editing', label: 'EDITING & PACING' },
    { key: 'sound', label: 'SOUND DESIGN & SCORE' },
];

export default function AutopsyGauge({ autopsy }: AutopsyGaugeProps) {
    if (!autopsy) return null;

    // Backwards-compatible data mapping (matches web exactly)
    const data = AXES.map(axis => {
        let value = 0;
        if (axis.key === 'story') value = autopsy.story ?? autopsy.screenplay ?? 0;
        else if (axis.key === 'script') value = autopsy.script ?? autopsy.screenplay ?? 0;
        else if (axis.key === 'acting') value = autopsy.acting ?? autopsy.direction ?? 0;
        else if (axis.key === 'cinematography') value = autopsy.cinematography ?? 0;
        else if (axis.key === 'editing') value = autopsy.editing ?? autopsy.pacing ?? 0;
        else if (axis.key === 'sound') value = autopsy.sound ?? 0;
        return { ...axis, value };
    });

    return (
        <View style={s.container}>
            {/* Deep vintage vignette overlay */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                locations={[0, 1]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0.5 }}
                end={{ x: 0, y: 0 }}
            />

            {/* Header */}
            <View style={s.header}>
                <View style={s.headerLeft}>
                    <Text style={s.headerStar}>✦</Text>
                    <Text style={s.headerTitle}>THE AUTOPSY</Text>
                </View>
                <Text style={s.confidential}>Confidential</Text>
            </View>

            {/* Gauge Bars */}
            <View style={s.gauges}>
                {data.map((item) => (
                    <View key={item.key} style={s.gaugeRow}>
                        {/* Label + Value */}
                        <View style={s.gaugeLabelRow}>
                            <Text style={s.gaugeLabel}>{item.label}</Text>
                            <Text style={s.gaugeValue}>
                                {item.value === 10 ? '10.0' : parseFloat(String(item.value)).toFixed(1)}
                            </Text>
                        </View>

                        {/* Progress Track */}
                        <View style={s.track}>
                            {/* Fill */}
                            <LinearGradient
                                colors={[colors.sepia, '#5a430d']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={[s.trackFill, { width: `${(item.value / 10) * 100}%` as any }]}
                            />
                            {/* Segmented dividers (10 segments) */}
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(seg => (
                                <View
                                    key={seg}
                                    style={[s.trackDivider, { left: `${seg * 10}%` as any }]}
                                />
                            ))}
                        </View>
                    </View>
                ))}
            </View>

            {/* Scanlines overlay (subtle) */}
            <View style={s.scanlines} pointerEvents="none" />
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: colors.ink,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.ash,
        padding: 20,
        marginVertical: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: colors.ash,
        paddingBottom: 12,
        marginBottom: 20,
        position: 'relative',
        zIndex: 1,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerStar: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.bloodReel,
    },
    headerTitle: {
        fontFamily: fonts.display,
        fontSize: 14,
        color: colors.bone,
        letterSpacing: 2,
    },
    confidential: {
        fontFamily: fonts.body,
        fontSize: 9,
        letterSpacing: 3,
        color: colors.fog,
        textTransform: 'uppercase',
    },
    gauges: {
        gap: 18,
        position: 'relative',
        zIndex: 1,
    },
    gaugeRow: {
        gap: 8,
    },
    gaugeLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 2,
    },
    gaugeLabel: {
        fontFamily: fonts.ui,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.fog,
    },
    gaugeValue: {
        fontFamily: fonts.display,
        fontSize: 16,
        lineHeight: 16,
        color: colors.parchment,
        opacity: 0.85,
        letterSpacing: 0.5,
    },
    track: {
        width: '100%',
        height: 8,
        backgroundColor: colors.soot,
        borderWidth: 1,
        borderColor: 'rgba(10, 7, 3, 0.8)',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative',
    },
    trackFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        borderRadius: 0,
    },
    trackDivider: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 3,
        backgroundColor: colors.ink,
    },
    scanlines: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.06,
        // Simulated via repeating thin lines
        borderTopWidth: 1,
        borderTopColor: colors.sepia,
    },
});
