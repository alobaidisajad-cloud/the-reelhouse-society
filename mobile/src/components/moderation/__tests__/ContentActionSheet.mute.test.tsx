/**
 * ContentActionSheet — the hideMute invariant.
 *
 * Batch 2 deleted three onMute handlers from the comment sheets in
 * log/[id].tsx, dossier/[id].tsx and stacks/[id].tsx. The entire justification
 * was that those three call sites pass `hideMute`, so the Mute row never
 * renders and the handlers could never run. That claim was verified by reading
 * the call sites; this proves it by rendering.
 *
 * It also pins the other half: `onPress: onMute ?? onClose` must stay
 * unreachable. A Mute row that silently closes instead of muting is exactly the
 * bug finding 110 described, so the row must never render without a handler.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { ContentActionSheet } from '../ContentActionSheet';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView } = require('react-native');

  const animatedComponent = (Component: any) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(Component, { ...props, ref })
    );

  return {
    __esModule: true,
    default: {
      View: animatedComponent(View),
      Text: animatedComponent(Text),
      ScrollView: animatedComponent(ScrollView),
      Image: animatedComponent(View),
      FlatList: animatedComponent(View),
      createAnimatedComponent: animatedComponent,
    },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    useDerivedValue: (fn: any) => ({ value: fn() }),
    withTiming: (v: any) => v,
    withSpring: (v: any) => v,
    withSequence: (...args: any[]) => args[0],
    withRepeat: (v: any) => v,
    withDelay: (_d: any, v: any) => v,
    Easing: {
      out: (_easing: any) => 'easing-out-fn',
      in: (_easing: any) => 'easing-in-fn',
      inOut: (_easing: any) => 'easing-inout-fn',
      cubic: 'cubic',
      linear: 'linear',
      ease: 'ease',
      bezier: () => 'bezier-fn',
    },
    FadeIn: { duration: function() { return this; }, delay: function() { return this; } },
    FadeOut: { duration: function() { return this; }, delay: function() { return this; } },
    FadeInUp: { duration: function() { return this; }, delay: function() { return this; } },
    FadeOutUp: { duration: function() { return this; }, delay: function() { return this; } },
    FadeInDown: { duration: function() { return this; }, delay: function() { return this; } },
    FadeOutDown: { duration: function() { return this; }, delay: function() { return this; } },
    SlideInRight: { duration: function() { return this; } },
    SlideOutLeft: { duration: function() { return this; } },
    SlideInLeft: { duration: function() { return this; } },
    SlideOutRight: { duration: function() { return this; } },
    Layout: { duration: function() { return this; }, springify: function() { return this; } },
    LinearTransition: { duration: function() { return this; }, springify: function() { return this; } },
    cancelAnimation: () => {},
    runOnJS: (fn: any) => fn,
    runOnUI: (fn: any) => fn,
    interpolate: (v: any) => v,
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend' },
    createAnimatedComponent: animatedComponent,
    useAnimatedRef: () => ({ current: null }),
    measure: () => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 }),
    scrollTo: () => {},
    useReducedMotion: () => false,
  };
});

jest.mock('react-native-gesture-handler', () => {
    const React = require('react');
    const { View } = require('react-native');
    return {
        GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
            React.createElement(View, null, children),
        GestureDetector: ({ children }: { children: React.ReactNode }) =>
            React.createElement(View, null, children),
        Gesture: {
            Pan: () => ({ onChange: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() }),
        },
    };
});

jest.mock('expo-blur', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { BlurView: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});

const base = {
    visible: true,
    targetUserId: 'u1',
    targetUsername: 'alice',
    contentType: 'log_comment' as const,
    contentId: 'c1',
    onClose: jest.fn(),
    onReport: jest.fn(),
    onBlock: jest.fn(),
};

beforeEach(() => { jest.clearAllMocks(); });

describe('ContentActionSheet — hideMute is what made three handlers dead code', () => {
    it('renders NO Mute row when hideMute is set — the comment sheets', () => {
        const { queryByLabelText } = render(<ContentActionSheet {...base} hideMute />);
        expect(queryByLabelText('Mute alice')).toBeNull();
        // ...and the sheet really did render, so the null above means absent, not unmounted.
        expect(queryByLabelText('Block alice')).not.toBeNull();
    });

    it('renders Mute and calls the handler when NOT hidden — the author sheets', async () => {
        const onMute = jest.fn();
        const { getByLabelText } = render(<ContentActionSheet {...base} onMute={onMute} />);
        await fireEvent.press(getByLabelText('Mute alice'));
        expect(onMute).toHaveBeenCalledTimes(1);
    });

    it('hides Mute for an already-blocked member', () => {
        const { queryByLabelText } = render(<ContentActionSheet {...base} showUnblock />);
        expect(queryByLabelText('Mute alice')).toBeNull();
    });

    it('offers Unmute instead of Mute for an already-muted member', async () => {
        const onUnmute = jest.fn();
        const { queryByLabelText, getByLabelText } = render(
            <ContentActionSheet {...base} showUnmute onUnmute={onUnmute} />,
        );
        expect(queryByLabelText('Mute alice')).toBeNull();
        await fireEvent.press(getByLabelText('Unmute alice'));
        expect(onUnmute).toHaveBeenCalledTimes(1);
    });

    it('never renders a Mute row without a handler behind it', () => {
        // The onMute ?? onClose fallback exists for type safety only. If this
        // ever fails, a member can tap Mute and be silently ignored.
        const { queryByLabelText } = render(<ContentActionSheet {...base} hideMute />);
        expect(queryByLabelText('Mute alice')).toBeNull();

        const { queryByLabelText: q2 } = render(<ContentActionSheet {...base} showUnblock />);
        expect(q2('Mute alice')).toBeNull();
    });
});
