/**
 * NitrateCalendar — Native date picker matching web NitrateCalendar.tsx (214 lines).
 *
 * Features:
 *  - Dark gradient background with sepia border
 *  - Month/Year navigator with chevron arrows
 *  - ISO week grid (Mon-Sun)
 *  - Selected day = gold gradient + glow
 *  - Today = outlined ring
 *  - Future days disabled + dimmed
 *  - Selected date display at bottom
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface NitrateCalendarProps {
    value: string;           // 'YYYY-MM-DD'
    onChange: (v: string) => void;
}

export default function NitrateCalendar({ value, onChange }: NitrateCalendarProps) {
    const selected = value ? new Date(value + 'T12:00:00') : new Date();
    const [viewYear, setViewYear] = useState(selected.getFullYear());
    const [viewMonth, setViewMonth] = useState(selected.getMonth());

    const today = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);

    // Build the grid: ISO week starts on Monday
    const days = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1);
        const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
        let startOffset = first.getDay() - 1;
        if (startOffset < 0) startOffset = 6;

        const cells: (number | null)[] = [];
        for (let i = 0; i < startOffset; i++) cells.push(null);
        for (let d = 1; d <= lastDay; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        return cells;
    }, [viewYear, viewMonth]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    const selectDay = (day: number) => {
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onChange(iso);
    };

    const isFuture = (day: number) => {
        const check = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return check > today;
    };

    // Chunk days into rows of 7
    const rows: (number | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) {
        rows.push(days.slice(i, i + 7));
    }

    return (
        <View style={s.container}>
            {/* Header: Month navigator */}
            <View style={s.header}>
                <TouchableOpacity onPress={prevMonth} style={s.navBtn} activeOpacity={0.6}>
                    <ChevronLeft size={16} color={colors.sepia} />
                </TouchableOpacity>

                <View style={s.headerCenter}>
                    <Text style={s.monthLabel}>{MONTH_NAMES[viewMonth].toUpperCase()}</Text>
                    <Text style={s.yearLabel}>{viewYear}</Text>
                </View>

                <TouchableOpacity onPress={nextMonth} style={s.navBtn} activeOpacity={0.6}>
                    <ChevronRight size={16} color={colors.sepia} />
                </TouchableOpacity>
            </View>

            {/* Day-of-week labels */}
            <View style={s.weekRow}>
                {DAY_LABELS.map(d => (
                    <View key={d} style={s.weekCell}>
                        <Text style={s.weekLabel}>{d}</Text>
                    </View>
                ))}
            </View>

            {/* Day grid */}
            {rows.map((row, ri) => (
                <View key={ri} style={s.dayRow}>
                    {row.map((day, ci) => {
                        if (day === null) return <View key={`e-${ci}`} style={s.dayCell} />;

                        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isSelected = iso === value;
                        const isToday = iso === today;
                        const future = isFuture(day);

                        return (
                            <TouchableOpacity
                                key={ci}
                                disabled={future}
                                onPress={() => selectDay(day)}
                                activeOpacity={0.6}
                                style={[
                                    s.dayCell,
                                    isSelected && s.daySelected,
                                    isToday && !isSelected && s.dayToday,
                                ]}
                            >
                                {isSelected ? (
                                    <LinearGradient
                                        colors={[colors.sepia, '#c29b38']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={s.daySelectedBg}
                                    >
                                        <Text style={[s.dayText, { color: colors.ink, fontFamily: fonts.uiBold }]}>{day}</Text>
                                    </LinearGradient>
                                ) : (
                                    <Text style={[
                                        s.dayText,
                                        future && { color: 'rgba(196,184,152,0.2)' },
                                        isToday && { color: colors.flicker, fontFamily: fonts.uiBold },
                                    ]}>
                                        {day}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}

            {/* Selected date display */}
            {value ? (
                <View style={s.selectedDisplay}>
                    <Text style={s.selectedText}>
                        {new Date(value + 'T12:00:00').toLocaleDateString('en-US', {
                            weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
                        }).toUpperCase()}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: '#100D08',
        borderWidth: 1,
        borderColor: 'rgba(196, 150, 26, 0.25)',
        borderRadius: 6,
        padding: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    navBtn: {
        padding: 6,
        borderRadius: 4,
    },
    headerCenter: {
        alignItems: 'center',
    },
    monthLabel: {
        fontFamily: fonts.ui,
        fontSize: 12,
        letterSpacing: 2,
        color: colors.parchment,
        fontWeight: '600',
    },
    yearLabel: {
        fontFamily: fonts.ui,
        fontSize: 8,
        letterSpacing: 3,
        color: colors.fog,
        marginTop: 2,
    },
    weekRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    weekCell: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 4,
    },
    weekLabel: {
        fontFamily: fonts.ui,
        fontSize: 8,
        letterSpacing: 1,
        color: colors.fog,
        opacity: 0.6,
    },
    dayRow: {
        flexDirection: 'row',
        marginBottom: 2,
    },
    dayCell: {
        flex: 1,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayText: {
        fontFamily: fonts.sub,
        fontSize: 12,
        color: colors.bone,
    },
    daySelected: {
        // Glow handled by LinearGradient child
    },
    daySelectedBg: {
        width: '100%',
        height: '100%',
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.sepia,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    dayToday: {
        borderWidth: 1,
        borderColor: 'rgba(196, 150, 26, 0.35)',
        borderRadius: 999,
        backgroundColor: 'rgba(196, 150, 26, 0.12)',
    },
    selectedDisplay: {
        marginTop: 10,
        alignItems: 'center',
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(196, 150, 26, 0.15)',
    },
    selectedText: {
        fontFamily: fonts.ui,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.sepia,
    },
});
