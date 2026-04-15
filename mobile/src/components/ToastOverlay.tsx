/**
 * ToastOverlay — Cinematic slide-down toast display.
 * Mount once in _layout.tsx. Listens to reelToast emissions.
 * 
 * Dark glass background + sepia accent + auto-dismiss after 2.5s
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '@/src/theme/theme';
import { setToastListener, ToastPayload, ToastType } from '@/src/utils/reelToast';

const { width: SCREEN_W } = Dimensions.get('window');

const ACCENT: Record<ToastType, string> = {
  success: colors.sepia,
  error: colors.bloodReel || '#6b1a0a',
  info: colors.bone,
};

const GLYPH: Record<ToastType, string> = {
  success: '✦',
  error: '✕',
  info: '◈',
};

export function ToastOverlay() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setToastListener((payload) => {
      setToast(payload);

      // Slide in
      translateY.value = -80;
      opacity.value = 0;
      translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(1, { duration: 250 });

      // Auto dismiss after 2.5s
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) });
        translateY.value = withTiming(-80, { duration: 400 });
      }, 2500);
    });
    return () => setToastListener(null);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!toast) return null;

  const accent = ACCENT[toast.type];
  const glyph = GLYPH[toast.type];

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="none">
      <View style={[styles.toast, { borderLeftColor: accent }]}>
        <Text style={[styles.glyph, { color: accent }]}>{glyph}</Text>
        <Text style={styles.message} numberOfLines={2}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(11,10,8,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.15)',
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: SCREEN_W - 40,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  glyph: {
    fontFamily: 'Rye_400Regular',
    fontSize: 16,
  },
  message: {
    fontFamily: 'SpecialElite_400Regular',
    fontSize: 13,
    color: colors.parchment,
    letterSpacing: 0.3,
    flex: 1,
    lineHeight: 18,
  },
});
