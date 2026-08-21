import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import Svg, { Rect, G, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { Flame } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import PressableScale from '../PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';

interface CalendarGridLog {
  watchedDate?: string;
  createdAt?: string;
}

interface Props {
  logs: CalendarGridLog[];
  isSelf?: boolean;
}

const WEEKS = 52;
const DAYS_PER_WEEK = 7;
const CELL_SIZE = 10;
const CELL_GAP = 3;
const SVG_WIDTH = WEEKS * (CELL_SIZE + CELL_GAP);
const SVG_HEIGHT = DAYS_PER_WEEK * (CELL_SIZE + CELL_GAP);

export default function NitrateCalendarGrid({ logs, isSelf }: Props) {
  const router = useRouter();
  
  const flickerAnim = useSharedValue(0.6);
  useEffect(() => {
    if (logs.length === 0 && isSelf) {
      flickerAnim.value = withRepeat(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
    } else {
      // Explicitly cancel orphaned animations to prevent UI thread leaks
      cancelAnimation(flickerAnim);
      flickerAnim.value = 1;
    }
    return () => cancelAnimation(flickerAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length, isSelf]);

  const flickerStyle = useAnimatedStyle(() => ({
    opacity: flickerAnim.value,
  }));

  // Generate contribution data for the last 52 weeks
  const gridData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Map logs to counts per day
    const countsMap = new Map<string, number>();
    logs.forEach(log => {
      const dayRaw = log.watchedDate || log.createdAt;
      let key = '';
      if (typeof dayRaw === 'string') {
        if (dayRaw.includes('T')) {
          // Extract exact YYYY-MM-DD from UTC string to ensure universal chronological accuracy
          key = dayRaw.substring(0, 10);
        } else {
          const match = dayRaw.match(/^(\d{4}-\d{2}-\d{2})/);
          if (match) {
            key = match[1];
          } else {
            const dateObj = new Date(dayRaw);
            if (!isNaN(dateObj.getTime())) {
              key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            }
          }
        }
      }
      if (!key) return;

      countsMap.set(key, (countsMap.get(key) || 0) + 1);
    });

    // Build grid (cols: weeks, rows: days)
    const weeksData = [];
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (WEEKS * 7));

    for (let w = 0; w < WEEKS; w++) {
      const week = [];
      for (let d = 0; d < DAYS_PER_WEEK; d++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (w * 7) + d);
        
        const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const count = countsMap.get(key) || 0;
        
        week.push({ date: key, count });
      }
      weeksData.push(week);
    }
    
    return weeksData;
  }, [logs]);

  const getColor = (count: number) => {
    if (count === 0) return 'rgba(184,137,26,0.05)';
    if (count === 1) return 'rgba(184,137,26,0.3)';
    if (count === 2) return 'rgba(184,137,26,0.6)';
    if (count === 3) return 'rgba(240,232,176,0.8)';
    return colors.flicker; // 4+
  };

  return (
    <Animated.View entering={FadeInUp.duration(600).delay(300)} style={s.container}>
      <View style={s.header}>
        <Text {...scaledTextProps} style={s.title}>CINEMATIC RHYTHM</Text>
        <Text {...scaledTextProps} style={s.subtitle}>{logs.length} FILMS THIS YEAR</Text>
      </View>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <View style={s.gridWrapper}>
          <Svg width={SVG_WIDTH} height={SVG_HEIGHT}>
            <Defs>
              <SvgLinearGradient id="hot" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.flicker} stopOpacity="1" />
                <Stop offset="1" stopColor={colors.sepia} stopOpacity="1" />
              </SvgLinearGradient>
            </Defs>
            <G>
              {gridData.map((week, wIndex) => (
                <G key={`w-${wIndex}`} x={wIndex * (CELL_SIZE + CELL_GAP)}>
                  {week.map((day, dIndex) => {
                    const fill = getColor(day.count);
                    return (
                      <Rect
                        key={`d-${wIndex}-${dIndex}`}
                        y={dIndex * (CELL_SIZE + CELL_GAP)}
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                        rx={2}
                        ry={2}
                        fill={fill}
                        stroke={day.count > 0 ? 'rgba(0,0,0,0.2)' : 'transparent'}
                        strokeWidth={1}
                      />
                    );
                  })}
                </G>
              ))}
            </G>
          </Svg>
          
          <View style={s.legend}>
            <Text {...scaledTextProps} style={s.legendText}>LESS</Text>
            <View style={[s.legendBox, { backgroundColor: getColor(0) }]} />
            <View style={[s.legendBox, { backgroundColor: getColor(1) }]} />
            <View style={[s.legendBox, { backgroundColor: getColor(3) }]} />
            <View style={[s.legendBox, { backgroundColor: getColor(5) }]} />
            <Text {...scaledTextProps} style={s.legendText}>MORE</Text>
          </View>
        </View>
      </ScrollView>

      {logs.length === 0 && isSelf && (
        <Animated.View style={[s.ctaContainer, flickerStyle]}>
          <PressableScale style={s.ctaBtn} onPress={() => (router.push as any)('/search-modal' as never)} haptic accessibilityRole="button" accessibilityLabel="Ignite the timeline — log a film">
            <Flame size={14} color={colors.flicker} style={{ marginRight: 8 }} />
            <Text {...scaledTextProps} style={s.ctaText}>IGNITE THE TIMELINE</Text>
          </PressableScale>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    marginVertical: 16,
    backgroundColor: 'rgba(10, 7, 3, 0.4)',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)',
    borderRadius: 8,
    paddingVertical: 16,
  },
  header: { paddingHorizontal: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.fog },
  subtitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.sepia },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 8 },
  gridWrapper: { position: 'relative' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 12, alignSelf: 'flex-end', gap: 4 },
  legendText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog, marginHorizontal: 4 },
  legendBox: { width: 8, height: 8, borderRadius: 1.5 },
  ctaContainer: { marginTop: 16, alignItems: 'center' },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(242,232,160,0.05)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(242,232,160,0.2)' },
  ctaText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.flicker },
});
