/**
 * ToastOverlay — Cinematic slide-down toast display.
 * Mount once in _layout.tsx. Listens to reelToast emissions.
 * 
 * Dark glass background + sepia accent + auto-dismiss after 2.5s
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import { setToastListener, ToastPayload, ToastType } from '@/src/utils/reelToast';


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
  const [queue, setQueue] = useState<ToastPayload[]>([]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = setToastListener((payload) => {
      // Cap queue at 5 to prevent unbounded memory growth
      setQueue((prev) => [...prev, payload].slice(-5));
    });
    return unsubscribe;
  }, []);

  const toast = queue[0];
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!toast) return;

    // ── Say it out loud on iOS ────────────────────────────────────────────────
    // `accessibilityLiveRegion` below is ANDROID ONLY — React Native's own type
    // declares it `@platform android`. `accessibilityRole="alert"` does not
    // announce by itself on iOS. So every toast in this app — including every
    // error — was silent to VoiceOver on iPhone, and a blind member got no
    // feedback at all when something failed.
    //
    // Announcing here rather than at each call site keeps ONE spoken channel:
    // Android via the live region, iOS via this. Doing it per-screen would mean
    // Android saying everything twice, which is the same defect as the double
    // toasts this batch removes.
    //
    // announceForAccessibility is a no-op when no screen reader is running, so
    // this costs nothing for everyone else and changes nothing visually.
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(toast.message);
    }

    // Slide in
    translateY.value = -80;
    opacity.value = 0;
    
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
    } else {
      translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(1, { duration: 250 });
    }

    // Auto dismiss after 2.5s (or 5s if actionable)
    const duration = toast.action ? 5000 : 2500;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (reducedMotion) {
        opacity.value = 0;
        translateY.value = -80;
      } else {
        opacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) });
        translateY.value = withTiming(-80, { duration: 400 });
      }
      // Phase 2 Remove from queue safely by ID to prevent race conditions during rapid firing
      setTimeout(() => {
        setQueue((prev) => prev.filter(t => t.id !== toast.id));
      }, 450);
    }, duration);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!toast) return null;

  const accent = ACCENT[toast.type];
  const glyph = GLYPH[toast.type];

  return (
    <Animated.View 
      style={[styles.container, { top: insets.top + 12 }, animatedStyle]} 
      pointerEvents="box-none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {/* pointerEvents="auto" only on the pill itself */}
      <View style={[styles.toast, { borderLeftColor: accent, maxWidth: width - 40 }]} pointerEvents="auto">
        <Text style={[styles.glyph, { color: accent }]}>{glyph}</Text>
        <Text style={styles.message} numberOfLines={2}>{toast.message}</Text>
        {toast.action && (
          <Text 
            style={[styles.actionLabel, { color: accent }]} 
            onPress={toast.action.onPress}
            suppressHighlighting
          >
            {toast.action.label}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // top is set dynamically via insets — see inline style
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
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  glyph: {
    fontFamily: fonts.display,
    fontSize: 16,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.parchment,
    letterSpacing: 0.3,
    flex: 1,
    lineHeight: 18,
  },
  actionLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(196,150,26,0.1)',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
  },
});
