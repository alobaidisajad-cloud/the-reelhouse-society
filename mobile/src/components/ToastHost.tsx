/**
 * ToastHost — where a toast is drawn. Never whether, never for how long.
 * ─────────────────────────────────────────────────────────────────────────────
 * The toast itself lives in `toastBus`: the queue, the clock, the one spoken
 * announcement. This file only draws it, and it can be drawn from three kinds
 * of place — exactly one of which draws at any moment (see toastBus):
 *
 *   <ToastHost layer="root" />   once, in the root layout
 *   screenLayout={toastScreenLayout}
 *                                on every Stack, so each route hosts its own —
 *                                a route presented as a modal draws its toasts
 *                                ABOVE itself rather than behind, on iOS
 *   <ToastHost />                inside every React Native <Modal>, for the same
 *                                reason (theToastIsDrawnOnTop enforces both)
 *
 * The pill: dark glass, a sepia/blood/bone accent by type, slides down and away
 * — or simply appears and goes, for a member who has asked for less motion.
 */
import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform, AccessibilityInfo, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import type { Stack } from 'expo-router';
import { scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { colors, fonts } from '@/src/theme/theme';
import {
  getToastSnapshot,
  nextToastHostId,
  registerToastHost,
  subscribeToToasts,
  toastHostsChanged,
  type ToastPayload,
  type ToastTier,
  type ToastType,
} from '@/src/utils/toastBus';

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

/** How many screen layers enclose this point — 0 outside every navigator. */
const ScreenDepth = createContext(0);

type Focusable = {
  isFocused(): boolean;
  addListener(type: 'focus' | 'blur', callback: () => void): () => void;
};

/** One host: a place registered with the bus, drawing only when it is chosen. */
function useHost(tier: ToastTier, depth: number, navigation?: Focusable) {
  const [id] = useState(nextToastHostId);
  useEffect(() => {
    const release = registerToastHost(id, {
      tier,
      depth,
      isFocused: navigation ? () => navigation.isFocused() : undefined,
    });
    // Focus decides which screen may draw, and focus moves without anything
    // mounting — a modal dismissed, a card popped. Tell the bus when it does.
    const offFocus = navigation?.addListener('focus', toastHostsChanged);
    const offBlur = navigation?.addListener('blur', toastHostsChanged);
    return () => {
      offFocus?.();
      offBlur?.();
      release();
    };
  }, [id, tier, depth, navigation]);
  const snap = useSyncExternalStore(subscribeToToasts, getToastSnapshot);
  return snap.host === id && snap.toast ? snap : null;
}

/**
 * Put one inside every React Native <Modal>. A modal is a separate native
 * layer on both platforms — a presented view controller on iOS, a dialog window
 * on Android — so anything drawn outside it is drawn beneath it.
 *
 * `layer="root"` is the root layout's own, and there is exactly one.
 */
export function ToastHost({ layer = 'sheet' }: { layer?: 'sheet' | 'root' }) {
  const depth = useContext(ScreenDepth);
  const showing = useHost(layer, depth);
  if (!showing?.toast) return null;
  return <ToastPill key={showing.toast.id} toast={showing.toast} leaving={showing.leaving} slide={showing.arrived} />;
}

type ScreenLayout = NonNullable<React.ComponentProps<typeof Stack>['screenLayout']>;

/**
 * A Stack's `screenLayout`: every route hosts the toasts raised while it is the
 * one on top. A route presented as a modal on iOS is a view controller above the
 * root, so this is what puts its toasts in front of it instead of behind.
 */
export const toastScreenLayout: ScreenLayout = ({ children, navigation, options }) => (
  <ToastScreen navigation={navigation} presentation={options.presentation}>{children}</ToastScreen>
);

const PRESENTED = new Set(['modal', 'transparentModal', 'containedModal', 'containedTransparentModal', 'fullScreenModal', 'formSheet', 'pageSheet']);
/** iOS draws these as a card that starts below the status bar, not full height. */
const IOS_SHEETS = new Set(['modal', 'formSheet', 'pageSheet']);

function ToastScreen({ children, navigation, presentation }: {
  children: React.ReactNode;
  navigation: Focusable;
  presentation: string | undefined;
}) {
  const depth = useContext(ScreenDepth) + 1;
  const showing = useHost('screen', depth, navigation);
  const pill = showing?.toast ? (
    <ToastPill
      key={showing.toast.id}
      toast={showing.toast}
      leaving={showing.leaving}
      slide={showing.arrived}
      inSheet={Platform.OS === 'ios' && IOS_SHEETS.has(presentation ?? '')}
    />
  ) : null;

  /**
   * ── A PRESENTED ROUTE IS ITS OWN WORLD TO VOICEOVER — TOAST INCLUDED ──────
   * Five modal routes set `accessibilityViewIsModal` on their own root view, so
   * VoiceOver would not wander onto the screen beneath. But that flag makes
   * VoiceOver ignore the root's SIBLINGS — and a toast drawn here is exactly
   * that sibling, so the flag would have hidden every toast on those routes
   * from a blind member.
   *
   * So the layer carries the flag instead, around the screen AND its toast, for
   * every presented route alike (it is inert on Android). The routes no longer
   * set it themselves; theToastIsDrawnOnTop keeps it that way.
   */
  if (PRESENTED.has(presentation ?? '')) {
    return (
      <ScreenDepth.Provider value={depth}>
        <View style={styles.layer} accessibilityViewIsModal>
          {children}
          {pill}
        </View>
      </ScreenDepth.Provider>
    );
  }
  return (
    <ScreenDepth.Provider value={depth}>
      {children}
      {pill}
    </ScreenDepth.Provider>
  );
}

function ToastPill({ toast, leaving, slide, inSheet = false }: {
  toast: ToastPayload;
  leaving: boolean;
  /** Slide in — false when the toast was handed here mid-display. */
  slide: boolean;
  /** Drawn in an iOS sheet, whose top is not the screen's. */
  inSheet?: boolean;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const animate = slide && !reducedMotion;
  const translateY = useSharedValue(animate ? -80 : 0);
  const opacity = useSharedValue(animate ? 0 : 1);
  const messageRef = useRef<Text>(null);

  useEffect(() => {
    if (!animate) return;
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
    opacity.value = withTiming(1, { duration: 250 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!leaving) return;
    if (reducedMotion) {
      opacity.value = 0;
      translateY.value = -80;
    } else {
      opacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) });
      translateY.value = withTiming(-80, { duration: 400 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  /**
   * ── A TOAST THAT ASKS FOR A RESPONSE, SPOKEN ─────────────────────────────────
   * It is not announced (toastBus). VoiceOver's focus is moved onto the message
   * instead, once it has faded in far enough to be focusable, and the message's
   * spoken label names the button: the member hears the sentence and the action
   * once, and is one swipe from pressing it. Android's live region reads the
   * same label, so it is not moved there — that would say it twice.
   */
  useEffect(() => {
    if (Platform.OS !== 'ios' || !toast.action) return;
    const wait = setTimeout(() => {
      if (messageRef.current) AccessibilityInfo.sendAccessibilityEvent(messageRef.current, 'focus');
    }, animate ? 300 : 50);
    return () => clearTimeout(wait);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const accent = ACCENT[toast.type];
  const glyph = GLYPH[toast.type];
  const action = toast.action;

  /**
   * ── A TOAST THAT ASKS FOR A RESPONSE, LAID OUT ───────────────────────────────
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
   */
  return (
    <Animated.View
      style={[styles.container, { top: (inSheet ? 0 : insets.top) + 12 }, animatedStyle]}
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
              {/* The spoken message names the button too. VoiceOver focus is
                  moved HERE, and a member who hears only the sentence has five
                  seconds to act on a control they were never told exists. One
                  element, read once — never a second announce. */}
              <Text
                ref={messageRef}
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
}

/** "✦ ASCEND THE RANKS" is read as "Ascend the ranks" — no star, no shouting. */
export function spokenLabel(label: string): string {
  const words = label.replace(/^[^A-Za-z]+/, '').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
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
    backgroundColor: colors.ink,
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
