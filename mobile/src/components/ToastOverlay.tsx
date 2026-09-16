/**
 * ToastOverlay — Cinematic slide-down toast display.
 * Mount once in _layout.tsx. Listens to reelToast emissions.
 * 
 * Dark glass background + sepia accent + auto-dismiss after 2.5s (5s when the
 * toast carries an action — see "A TOAST THAT ASKS FOR A RESPONSE" below).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform, AccessibilityInfo, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
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
    // A toast that CARRIES AN ACTION is not announced here. It is drawn in a
    // FullWindowOverlay on iOS (see the render below), and that component moves
    // VoiceOver's focus onto itself when it mounts — which reads the message and
    // lands the member one swipe from the button. Announcing as well would say
    // the sentence twice, the defect this batch's other half exists to prevent.
    // The house's refusal doors (showTierDoor) are the callers that carry one.
    if (Platform.OS === 'ios' && !toast.action) {
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
  const action = toast.action;

  /**
   * ── A TOAST THAT ASKS FOR A RESPONSE ─────────────────────────────────────────
   * Nothing carried an action until the house's refusal doors did, and the
   * first real caller showed this path had never been laid out for use:
   *
   *   · THE SENTENCE WAS CUT. The label sat in the same row as the message.
   *     Measured from the fonts' own advance widths, the widest label takes
   *     186pt, leaving a 375pt phone's message 73pt for two lines — every one of
   *     the six refusal sentences was truncated, on every phone size, including
   *     430pt. The label now takes its own row; the longest sentence needs three
   *     lines at the smallest phone at ×1.35, so four are allowed.
   *   · THE BUTTON WAS UNREADABLE. It wore the toast's accent, and an error's is
   *     bloodReel: 1.25–1.49:1 on this ground. It is champagne now, 5.4–6.5:1.
   *   · IT WAS A 26pt TARGET WITH NO ROLE. A Pressable with a button role, a
   *     44pt reach, and a spoken label without the ✦ ("black four pointed star").
   *   · ON iOS IT WAS BEHIND THE SCREEN IT WAS RAISED ON. The writing desk and
   *     the share sheet are presented modally — native view controllers above
   *     the root, where this overlay lives. A FullWindowOverlay draws above them.
   *     It claims touches only inside its own children (RNSFullWindowOverlay.mm,
   *     pointInside/hitTest), so the app beneath stays usable. Its
   *     accessibility container is MODAL BY DEFAULT, which would shut VoiceOver
   *     inside an empty overlay; it is turned off, and the overlay exists only
   *     while an actionable toast is on screen.
   *
   * A plain toast is drawn exactly as before.
   */
  const pill = (
    <Animated.View
      style={[styles.container, { top: insets.top + 12 }, animatedStyle]}
      pointerEvents="box-none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {/* pointerEvents="auto" only on the pill itself */}
      <View
        style={[styles.toast, action && styles.toastWithAction, { borderLeftColor: accent, maxWidth: width - 40 }]}
        pointerEvents="auto"
      >
        {action ? (
          <>
            <View style={styles.messageRow}>
              <Text style={[styles.glyph, { color: accent }]} {...UNSPOKEN}>{glyph}</Text>
              {/* The spoken message names the button too. VoiceOver focus lands
                  HERE when the overlay mounts, and a member who hears only the
                  sentence has five seconds to act on a control they were never
                  told exists. One element, read once — never a second announce. */}
              <Text
                style={styles.message}
                numberOfLines={4}
                {...scaledTextProps}
                accessibilityLabel={`${toast.message}. ${spokenLabel(action.label)}, available.`}
              >
                {toast.message}
              </Text>
            </View>
            <Pressable
              onPress={action.onPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={spokenLabel(action.label)}
              style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
            >
              <Text style={styles.actionLabel} numberOfLines={1} {...scaledTextProps}>{action.label}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.glyph, { color: accent }]} {...UNSPOKEN}>{glyph}</Text>
            <Text style={styles.message} numberOfLines={2}>{toast.message}</Text>
          </>
        )}
      </View>
    </Animated.View>
  );

  if (action && Platform.OS === 'ios') {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        {pill}
      </FullWindowOverlay>
    );
  }
  return pill;
}

/** "✦ ASCEND THE RANKS" is read as "Ascend the ranks" — no star, no shouting. */
export function spokenLabel(label: string): string {
  const words = label.replace(/^[^A-Za-z]+/, '').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
  // ── The toast that asks for a response ──
  toastWithAction: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionChip: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(196,150,26,0.1)',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
  },
  actionChipPressed: {
    backgroundColor: 'rgba(196,150,26,0.2)',
  },
  actionLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    // Brass, whatever the toast's type: measured 5.4–6.5:1 on this ground,
    // where an error's bloodReel was 1.25–1.49:1.
    color: colors.champagne,
  },
});
