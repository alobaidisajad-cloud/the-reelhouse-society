/**
 * aSheetFootGivesWayToTheKeys.test.tsx — a sheet's foot, with the keys up (round 14).
 *
 * The share and report sheets kept their home-indicator foot above the keys: on iOS the keyboard
 * covers the indicator, so 34pt of the tightest room stood empty. On iOS the foot gives way to the
 * sheet's own gap as the keys rise; on Android it is kept, as React Native's keyboard height there
 * leaves the navigation bar out and the foot is what clears it.
 */
import { Keyboard, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useSheetFootWhileTyping } from '../useModalKeyboardPadding';
import { SHEET_BOTTOM_GAP } from '@/src/components/layout/navMetrics';

type Handler = (e?: unknown) => void;
let listeners: Record<string, Handler[]>;
const was = Platform.OS;

beforeEach(() => {
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
    (listeners[event] ??= []).push(fn);
    return { remove: () => { listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn); } };
  }) as never);
});
afterEach(() => {
  Platform.OS = was;
  jest.restoreAllMocks();
});

const emit = async (event: string, height = 0) => act(async () => {
  (listeners[event] ?? []).forEach((fn) => fn({ duration: 250, endCoordinates: { height, screenY: 0, screenX: 0, width: 0 } }));
});
/** The foot the hook draws (the jest Reanimated draws a style as it renders). */
const footOf = async (foot: number, keys: number, show: string) => {
  const r = await renderHook(() => useSheetFootWhileTyping(foot));
  await emit(show, keys);
  await r.rerender({});
  return (r.result.current as unknown as { paddingBottom: number }).paddingBottom;
};

describe('on iOS', () => {
  beforeEach(() => { Platform.OS = 'ios'; });

  it('keeps the foot while the keys are down', async () => {
    expect(await footOf(54, 0, 'keyboardWillShow')).toBe(54);
  });

  it('gives the foot to the words while the keys cover the indicator: the gap alone', async () => {
    expect(await footOf(54, 336, 'keyboardWillShow')).toBe(SHEET_BOTTOM_GAP);
  });

  it('eases as the keys rise, never under the gap', async () => {
    expect(await footOf(54, 20, 'keyboardWillShow')).toBe(34);
  });
});

describe('on Android', () => {
  it('keeps the foot: the keyboard height there leaves the navigation bar out', async () => {
    Platform.OS = 'android';
    expect(await footOf(68, 270, 'keyboardDidShow')).toBe(68);
  });
});
