import React, { useRef, useEffect } from 'react';
import { Pressable } from 'react-native';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import TactileEngine from '../utils/TactileEngine';

export function HapticTab(props: BottomTabBarButtonProps) {
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
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
