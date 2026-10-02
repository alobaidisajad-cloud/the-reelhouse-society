/**
 * theKeyboardHasRoom.test.tsx — on Android, the app ends where the keyboard begins.
 *
 * Edge-to-edge stopped Android resizing the window, and every screen was written
 * for the resize. KeyboardRoom is that resize, at the root. On the device the
 * keyboard probe (e2e/keyboard-room.mjs) measures it; this holds the arithmetic:
 * RN's height stops at the navigation bar and the keyboard's top does not, and
 * Reanimated's height, when it follows a keyboard that changed height, wins.
 */
import React from 'react';
import { Keyboard, Platform, Text, View } from 'react-native';
import { act, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { KeyboardRoom } from '../KeyboardRoom';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 48, left: 0, right: 0 }),
}));

type Handler = (e?: unknown) => void;
let listeners: Record<string, Handler[]>;
const was = Platform.OS;
let reaction: ((now: number, before: number | undefined) => void) | null;
let prepare: (() => number) | null;
const keyboard = { height: { value: 0 }, state: { value: 0 } };

beforeEach(() => {
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
    (listeners[event] ??= []).push(fn);
    return { remove: () => { listeners[event] = listeners[event].filter((f) => f !== fn); } };
  }) as never);
  reaction = null;
  prepare = null;
  keyboard.height.value = 0;
  keyboard.state.value = Reanimated.KeyboardState.UNKNOWN;
  (Reanimated.useAnimatedKeyboard as jest.Mock).mockImplementation(() => keyboard);
  (Reanimated.useAnimatedReaction as jest.Mock).mockImplementation((p, r) => { prepare = p; reaction = r; });
  Platform.OS = 'android';
});

afterEach(() => {
  Platform.OS = was;
  jest.restoreAllMocks();
  (Reanimated.useAnimatedKeyboard as jest.Mock).mockReset();
  (Reanimated.useAnimatedReaction as jest.Mock).mockReset();
});

const emit = async (event: string, height = 0) => act(async () => {
  (listeners[event] ?? []).forEach((fn) => fn({ endCoordinates: { height, screenY: 0, screenX: 0, width: 0 } }));
});
/** Reanimated settling on a state, as its reaction would see it. */
const settle = async (state: number, height: number) => act(async () => {
  const before = prepare?.();
  keyboard.state.value = state;
  keyboard.height.value = height;
  reaction?.(prepare!(), before);
});

function draw() {
  const r = render(<KeyboardRoom><Text>page</Text></KeyboardRoom>);
  // The drawn root: on Android it is the room's own View.
  const room = () => {
    const top = r.toJSON() as { type: string; props: { style?: unknown } };
    expect(top.type).toBe('View');
    return Object.assign({}, ...[top.props.style].flat(Infinity).filter(Boolean));
  };
  return { r, room };
}

describe('on Android', () => {
  it('fills the screen while no keyboard is up', async () => {
    const { room } = draw();
    expect(room().flex).toBe(1);
    expect(room().paddingBottom).toBeUndefined();
  });

  it('ends at the keyboard’s top: RN’s height plus the navigation bar it stops at', async () => {
    const { room } = draw();
    await emit('keyboardDidShow', 300);
    expect(room().paddingBottom).toBe(348);
  });

  it('gives the room back when the keyboard goes', async () => {
    const { room } = draw();
    await emit('keyboardDidShow', 300);
    await emit('keyboardDidHide');
    expect(room().paddingBottom).toBeUndefined();
  });

  it('follows a keyboard that grew while open, which RN does not report', async () => {
    const { room } = draw();
    await emit('keyboardDidShow', 300);
    await settle(Reanimated.KeyboardState.OPEN, 420);
    expect(room().paddingBottom).toBe(420);
  });

  it('never takes less room than RN said, if Reanimated is behind', async () => {
    // With system animations off the insets animation may never settle on OPEN.
    const { room } = draw();
    await emit('keyboardDidShow', 300);
    await settle(Reanimated.KeyboardState.OPENING, 120);
    expect(room().paddingBottom).toBe(348);
  });

  it('and gives everything back on hide, whatever Reanimated last said', async () => {
    const { room } = draw();
    await emit('keyboardDidShow', 300);
    await settle(Reanimated.KeyboardState.OPEN, 420);
    await emit('keyboardDidHide');
    expect(room().paddingBottom).toBeUndefined();
  });

  it('stops listening when it goes', async () => {
    const { r } = draw();
    // It was listening, so none left after is the unmount's doing.
    expect(listeners.keyboardDidShow.length).toBeGreaterThan(0);
    r.unmount();
    expect(listeners.keyboardDidShow).toEqual([]);
    expect(listeners.keyboardDidHide).toEqual([]);
  });
});

describe('on iOS', () => {
  it('adds nothing: iOS never resized a window, and its screens make their own room', async () => {
    Platform.OS = 'ios';
    const r = render(<View testID="outer"><KeyboardRoom><Text>page</Text></KeyboardRoom></View>);
    // The outer View's one child is the page's Text: no View between them.
    const outer = r.toJSON() as { children: { type: string }[] };
    expect(outer.children.map((c) => c.type)).toEqual(['Text']);
    expect(Keyboard.addListener).not.toHaveBeenCalled();
  });
});

describe('the app is inside it', () => {
  it('wraps the whole root, the toasts and the banner too', async () => {
    const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
    const { join } = jest.requireActual('path') as typeof import('path');
    const { stripComments } = jest.requireActual('@/test-utils/readCode');
    const root = stripComments(readFileSync(join(__dirname, '..', '..', '..', 'app', '_layout.tsx'), 'utf8'));
    const inside = root.slice(root.indexOf('<KeyboardRoom>'), root.indexOf('</KeyboardRoom>'));
    for (const part of ['<Stack', '<ToastHost layer="root"', '<OfflineBanner']) expect(inside).toContain(part);
    expect(root.indexOf('<GestureHandlerRootView')).toBeLessThan(root.indexOf('<KeyboardRoom>'));
  });
});
