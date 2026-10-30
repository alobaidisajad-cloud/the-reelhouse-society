/**
 * PressableScale — Tactile press-in/out wrapper.
 * Replaces flat activeOpacity with a physical 3D pressure feel.
 * Runs entirely on the UI thread via Reanimated.
 */
import React, { memo, useRef, useState } from 'react';
import {
  Pressable, StyleSheet, View, ViewStyle, StyleProp, AccessibilityRole, AccessibilityState,
  AccessibilityActionInfo, AccessibilityActionEvent, LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import TactileEngine from '../utils/TactileEngine';
import { arrive, MS } from '../theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps {
  onPress?: () => void;
  onPressIn?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Scale when pressed in. Default 0.96 for visceral depth */
  pressedScale?: number;
  /** Fire a haptic on press. Can be boolean or specific impact style */
  haptic?: boolean | 'light' | 'medium' | 'heavy' | 'selection';
  disabled?: boolean;
  hitSlop?: null | number | { top?: number; bottom?: number; left?: number; right?: number };
  /** Delay before onLongPress fires (default 600ms per HIG) */
  delayLongPress?: number;
  /** Debounce interaction to prevent double-push route flooding */
  debounceMs?: number;
  /** VoiceOver / TalkBack role */
  accessibilityRole?: AccessibilityRole;
  /** VoiceOver / TalkBack label */
  accessibilityLabel?: string;
  /** Additional hint for assistive tech */
  accessibilityHint?: string;
  /** Accessibility state (selected, disabled, etc.) */
  accessibilityState?: AccessibilityState;
  /** False, with importantForAccessibility "no", for a ground a screen reader skips. */
  accessible?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  /** Named actions a screen reader offers, e.g. what a long press opens. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  /** Testing identifier for Maestro/E2E */
  testID?: string;
  /**
   * What a slip on this control costs: it destroys, commits or spends, or it is the way out.
   * Its own box is then at least 48pt a side, grown invisibly (see `grownFor`).
   */
  touch?: TouchWeight;
  /**
   * Grown to 48 the same way though a slip on it costs nothing: a control drawn too small for a
   * finger, or in a row too short for its halo to reach 48 (the size sweep, DECISIONS 4 tier B).
   * 'vertical' or 'horizontal' grows it one way only: a control in a row of others grows along the
   * side they are not on, or it would reach into its neighbour.
   */
  room?: boolean | RoomAxis;
}

/** The one way a control given room grows (PressableScale's `room`). */
export type RoomAxis = 'vertical' | 'horizontal';

/** A control whose slip costs something (DECISIONS 4: tier A). */
export type TouchWeight = 'destructive' | 'commit' | 'wayOut';

/** Material's 48dp, which also clears Apple's 44pt: a weighted control's own box. */
export const TOUCH_FLOOR = 48;

const num = (v: unknown): v is number => typeof v === 'number';

/** Style keys that place a box among its siblings: they stay on the grown box. */
const PLACING = ['position', 'top', 'right', 'bottom', 'left', 'start', 'end', 'zIndex', 'alignSelf', 'flex', 'flexGrow',
  'flexShrink', 'flexBasis'] as const;
const SIZES = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const;
type Side = 'Top' | 'Bottom' | 'Left' | 'Right';
type Axis = 'Vertical' | 'Horizontal';
const SIDES: [Side, Axis][] = [['Top', 'Vertical'], ['Bottom', 'Vertical'], ['Left', 'Horizontal'], ['Right', 'Horizontal']];
const relative = (v: unknown) => typeof v === 'string' && v.endsWith('%');
const sideOf = (own: ViewStyle, key: 'margin' | 'padding', s: Side, axis: Axis) => own[`${key}${s}`] ?? own[`${key}${axis}`] ?? own[key] ?? 0;

/**
 * The axes a weighted control may grow on. Not one already at the floor by its style (a size or a
 * minimum of 48 or more), one sized as a share of its parent (the growth would come out of its
 * content), or one whose margin or padding is not a number (auto, a percentage: there is nothing
 * to take the growth back from, or add it to), nor the axis a control given room one way is not
 * given. The size sweep names a control left under 48 on an axis it may not grow on.
 */
export function touchAxes(own: ViewStyle, only?: RoomAxis): Record<Axis, boolean> {
  const may = (axis: Axis, size: unknown, min: unknown) => !relative(size)
    && !(num(size) && size >= TOUCH_FLOOR) && !(num(min) && min >= TOUCH_FLOOR)
    && SIDES.every(([s, a]) => a !== axis || (num(sideOf(own, 'margin', s, a)) && num(sideOf(own, 'padding', s, a))));
  return {
    Vertical: only !== 'horizontal' && may('Vertical', own.height, own.minHeight),
    Horizontal: only !== 'vertical' && may('Horizontal', own.width, own.minWidth),
  };
}

/** A control that draws on its own box: a fill, a border, a shadow. */
const drawsGround = (own: ViewStyle) => !!own.backgroundColor || !!own.shadowColor || (num(own.elevation) && own.elevation > 0)
  || Object.entries(own).some(([k, v]) => /^border\w*Width$/.test(k) && num(v) && v > 0);

/** `at`: the axes now at the floor (grown to it, or measured there), where a halo would only reach into a neighbour. */
type Grown = { outer: ViewStyle; inner: ViewStyle | null; by: Record<Axis, number>; at: Record<Axis, boolean> };

/**
 * A weighted control grown to the floor without moving a pixel (DECISIONS 4.4): padding on each
 * side of an axis under 48, and a margin less by the same, so every neighbour stays where it was
 * and the box a finger, VoiceOver and TalkBack read is 48. The content's size is the style's where
 * it names one, else what was measured (`seen`); unmeasured, nothing is grown yet. A control that
 * draws on its own box keeps that drawing on an inner box at its own size, the outer one only
 * placing and growing it; one that draws nothing grows in place. Null: no axis may grow.
 */
export function grownFor(own: ViewStyle, seen: { w: number; h: number } | null, only?: RoomAxis): Grown | null {
  const axes = touchAxes(own, only);
  if (!axes.Vertical && !axes.Horizontal) return null;
  const content = { Vertical: num(own.height) ? own.height : seen?.h ?? null, Horizontal: num(own.width) ? own.width : seen?.w ?? null };
  const by = { Vertical: 0, Horizontal: 0 };
  const at = { Vertical: axes.Vertical && content.Vertical !== null, Horizontal: axes.Horizontal && content.Horizontal !== null };
  for (const axis of ['Vertical', 'Horizontal'] as const) {
    const c = content[axis];
    if (axes[axis] && c !== null) by[axis] = Math.max(0, (TOUCH_FLOOR - c) / 2);
  }
  const each = (key: 'margin' | 'padding', sum: (v: number, g: number) => number) => Object.fromEntries(SIDES.map(([s, axis]) => {
    const v = sideOf(own, key, s, axis);
    return [`${key}${s}`, num(v) ? sum(v, by[axis]) : v];
  })) as ViewStyle;
  const rest = Object.fromEntries(Object.entries(own).filter(([k]) => !/^(margin|padding)/.test(k))) as ViewStyle;
  if (!drawsGround(own)) {
    // Nothing is drawn on the box: its padding grows, and every size it names grows with it (a
    // box's size, its minimum and its maximum take in its padding), so the content stays the size
    // it was and the box really grows.
    const sized = Object.fromEntries(SIZES.filter((k) => num(own[k]))
      .map((k) => [k, (own[k] as number) + 2 * by[/[wW]idth/.test(k) ? 'Horizontal' : 'Vertical']]));
    return {
      outer: { ...rest, ...each('padding', (v, g) => v + g), ...each('margin', (v, g) => v - g), ...sized },
      inner: null,
      by,
      at,
    };
  }
  // The inner box stretches across the outer one, as the control filled the width its parent gave
  // it (not when it names its own). It never grows along: in a box with no height of its own, Yoga
  // grows a growing child to all the room above it (a 45pt plate drew 1019 tall, and pushed the
  // screen's words off its top), and a 38pt disc drew 38×44.
  const outerKeys = new Set<string>([...PLACING, ...SIZES.filter((k) => relative(own[k]))]);
  const pick = (keep: boolean) => Object.fromEntries(Object.entries(rest).filter(([k]) => outerKeys.has(k) === keep)) as ViewStyle;
  return {
    outer: { ...pick(true), ...each('margin', (v, g) => v - g), ...each('padding', (_v, g) => g) },
    inner: {
      ...pick(false), ...each('padding', (v) => v),
      ...(num(own.width) ? null : { alignSelf: 'stretch' }),
    },
    by,
    at,
  };
}

function PressableScale({
  onPress,
  onPressIn,
  onLongPress,
  style,
  children,
  pressedScale = 0.96,
  haptic = false,
  disabled = false,
  hitSlop,
  delayLongPress = 600,
  debounceMs = 400,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  accessible,
  importantForAccessibility,
  accessibilityActions,
  onAccessibilityAction,
  testID,
  touch,
  room = false,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const lastPressRef = useRef<number>(0);

  // A halo of 15 on each side the caller leaves out, but only on an axis under
  // the 48pt floor: on a big control a halo only reaches into its neighbour, and
  // both platforms give an overlap to the LATER control. A halo buys a finger
  // reach, never accessibility size (it is not in either platform's
  // accessibility frame): a small control is fixed with minHeight / minWidth.
  const own: ViewStyle = StyleSheet.flatten(style) ?? {};
  // A weighted control is grown to the floor once its content is measured (an axis already
  // there is not); its halo then goes, as on any control at the floor. Its content is its own
  // box less the growth it was given.
  const [seen, setSeen] = useState<{ w: number; h: number } | null>(null);
  const only = typeof room === 'string' && !touch ? room : undefined;
  const grown = touch || room ? grownFor(own, seen, only) : null;
  const big = (...v: unknown[]) => v.some((n) => typeof n === 'number' && n >= 48);
  const across = big(own.width, own.minWidth) || grown?.at.Horizontal ? 0 : 15;
  const down = big(own.height, own.minHeight) || grown?.at.Vertical ? 0 : 15;
  // Measured again only when the box changed for a reason of its own (its words, the text size):
  // never on the layout its own growth caused (a box its parent holds would read as content that
  // shrank, and grow again, without end), and never on one where nothing moved.
  const laid = useRef<{ w: number; h: number; by: { Vertical: number; Horizontal: number } } | null>(null);
  const measure = grown ? (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const last = laid.current;
    laid.current = { w: width, h: height, by: grown.by };
    const grew = !!last && (last.by.Vertical !== grown.by.Vertical || last.by.Horizontal !== grown.by.Horizontal);
    const still = !!last && Math.abs(width - last.w) < 0.5 && Math.abs(height - last.h) < 0.5;
    if (grew || still) return;
    const w = width - 2 * grown.by.Horizontal;
    const h = height - 2 * grown.by.Vertical;
    // A measure that grows nothing new draws nothing new: a long list does not draw each row twice.
    const next = grownFor(own, { w, h }, only)?.by;
    if (next && next.Vertical === grown.by.Vertical && next.Horizontal === grown.by.Horizontal) return;
    setSeen((was) => (was && Math.abs(was.w - w) < 0.5 && Math.abs(was.h - h) < 0.5 ? was : { w, h }));
  } : undefined;
  const normalizedHitSlop = hitSlop === null ? null : typeof hitSlop === 'number' ? hitSlop : {
    top: hitSlop?.top ?? down,
    bottom: hitSlop?.bottom ?? down,
    left: hitSlop?.left ?? across,
    right: hitSlop?.right ?? across,
  };
  // Grown to the floor on an axis, a control's halo there, even one the caller set, would only
  // reach into a neighbour: it goes.
  const halo = !grown || normalizedHitSlop === null || (!grown.by.Vertical && !grown.by.Horizontal) ? normalizedHitSlop : (() => {
    const s = typeof normalizedHitSlop === 'number'
      ? { top: normalizedHitSlop, bottom: normalizedHitSlop, left: normalizedHitSlop, right: normalizedHitSlop } : normalizedHitSlop;
    return {
      top: grown.by.Vertical ? 0 : s.top, bottom: grown.by.Vertical ? 0 : s.bottom,
      left: grown.by.Horizontal ? 0 : s.left, right: grown.by.Horizontal ? 0 : s.right,
    };
  })();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      testID={testID}
      disabled={disabled}
      hitSlop={halo}
      delayLongPress={delayLongPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
      accessible={accessible}
      importantForAccessibility={importantForAccessibility}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPressIn={() => {
        // Feel on every touch, even inside the debounce: only onPress is debounced.

        // Down at once, and stopped: the house's press has no spring in it.
        scale.value = withTiming(pressedScale, { duration: MS.strike, easing: arrive() });
        
        // Haptics triggered on finger-down (mechanical click emulation)
        if (haptic === 'selection') TactileEngine.selection();
        else if (haptic === true || haptic === 'light') TactileEngine.navigate();
        else if (haptic === 'medium') TactileEngine.mutate();
        else if (haptic === 'heavy') TactileEngine.destroy();
        
        onPressIn?.();
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: MS.quick, easing: arrive() });
      }}
      onPress={() => {
        if (debounceMs > 0) {
          const now = Date.now();
          if (now - lastPressRef.current < debounceMs) return;
          lastPressRef.current = now;
        }
        onPress?.();
      }}
      onLongPress={onLongPress ? () => {
        if (haptic && haptic !== 'selection') {
          TactileEngine.destroy();
        }
        onLongPress();
      } : undefined}
      style={[grown ? grown.outer : style, animatedStyle]}
      onLayout={measure}
    >
      {grown?.inner ? <View style={grown.inner}>{children}</View> : children}
    </AnimatedPressable>
  );
}

const MemoizedPressableScale = memo(PressableScale);
MemoizedPressableScale.displayName = 'PressableScale';
export default MemoizedPressableScale;

