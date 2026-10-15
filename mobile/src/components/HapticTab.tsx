import React, { useRef, useEffect } from 'react';
import { Pressable } from 'react-native';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import TactileEngine from '../utils/TactileEngine';

/**
 * A tab's button. Given `icon`, it draws that icon once, chosen or not by the
 * tab's own `aria-selected`, in place of React Navigation's `tabBarIcon`. That
 * one draws each icon twice, stacked, and swaps their wrappers' opacity between
 * 0 and 1 on every change of tab. On Android a wrapper at 1 is folded away and
 * one at 0 is made again, both in one update; the update lost the making, and
 * React was destroyed (Unable to find viewState for tag N, Sealed E2E).
 */
export function HapticTab({ icon, ...props }: BottomTabBarButtonProps & { icon?: (focused: boolean) => React.ReactNode }) {
  const isRealTouch = useRef(false);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cleanup timeout on unmount to guarantee zero memory leaks
    return () => {
      if (resetTimeout.current) clearTimeout(resetTimeout.current);
    };
  }, []);

  return (
    <Pressable
      {...(props as any)}
      {...(icon ? { children: icon(props['aria-selected'] === true) } : null)}
      // No reach past its own edges: a tab is a fifth of the screen wide and the
      // bar's full height, and the tabs sit edge to edge. A 10pt reach gave each
      // tab's right edge to its neighbour (opened on the touch DOWN) and took
      // 10pt of the screen above the bar.
      hitSlop={undefined}
      style={(state) => [
        typeof props.style === 'function' ? (props.style as any)(state) : props.style,
        state.pressed && { opacity: 0.85 },
      ]}
      onPressIn={(ev) => {
        if (resetTimeout.current) clearTimeout(resetTimeout.current);
        isRealTouch.current = true;
        
        TactileEngine.selection();
        if (props.onPressIn) {
          props.onPressIn(ev);
        }
        // Navigate instantly on touch down
        if (props.onPress) {
          props.onPress(ev as any);
        }
      }}
      onPressOut={(ev) => {
        if (props.onPressOut) {
          props.onPressOut(ev);
        }
        // Defer reset to catch rapid successive synthetic taps vs real sequences safely
        resetTimeout.current = setTimeout(() => {
          isRealTouch.current = false;
        }, 50);
      }}
      onPress={(ev) => {
        // VoiceOver, TalkBack, and Keyboards synthesize onPress without onPressIn
        if (!isRealTouch.current) {
          if (props.onPress) {
            props.onPress(ev as any);
          }
        }
        isRealTouch.current = false;
        if (resetTimeout.current) clearTimeout(resetTimeout.current);
      }}
    />
  );
}
