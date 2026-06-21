import React, { memo, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors } from '@/src/theme/theme';
import { useNotificationStore } from '@/src/stores/notificationStore';

interface NotificationBadgeProps {
  style?: ViewStyle;
  pulseCount?: number;
}

// ── Breathtaking Nitrate Noir Breathing Ember ──
export const NotificationBadge = memo(function NotificationBadge({
  style,
  pulseCount = 4,
}: NotificationBadgeProps) {
  // 1. Subscribe to exact count
  const unreadCount = useNotificationStore((s) => s._unreadCount);
  const prevCount = useRef(unreadCount);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    // 2. Only increment key (restarting animation) if count strictly INCREASED
    if (unreadCount > prevCount.current) {
      setPulseKey((k) => k + 1);
    }
    prevCount.current = unreadCount;
  }, [unreadCount]);

  // 3. Invisible Worker Guard: fully unmount when no notifications
  if (unreadCount === 0) return null;

  return <ActiveNotificationBadge key={pulseKey} style={style} pulseCount={pulseCount} />;
});

const ActiveNotificationBadge = memo(function ActiveNotificationBadge({
  style,
  pulseCount = 4,
}: NotificationBadgeProps) {
  const alpha = useSharedValue(0.4);

  useEffect(() => {
    // Finite pulse sequence (battery guard)
    alpha.value = withRepeat(
      withTiming(1, { duration: 1800 }),
      pulseCount,
      true
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: alpha.value,
    transform: [{ scale: 1 + (alpha.value - 0.4) * 0.15 }],
  }));

  return (
    <Animated.View style={[styles.badgeDot, style, animatedStyle]} pointerEvents="none">
      <View style={styles.badgeDotInner} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  badgeDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.bloodReel,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bloodReel,
  },
});
