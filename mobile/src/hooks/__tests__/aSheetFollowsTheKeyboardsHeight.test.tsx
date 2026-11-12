/**
 * aSheetFollowsTheKeyboardsHeight.test.tsx — a Modal's room follows the keyboard as it changes (WORKLIST P4.35).
 *
 * A React Native <Modal> is a window of its own, which neither platform resizes
 * for the keyboard: its sheet or card makes its room from the keyboard's events
 * alone (useModalKeyboardHeight). The keyboard changes height while open: its
 * emoji panel, a keyboard of another maker, the predictive bar. Android says
 * each new height with keyboardDidShow again (RN 0.86's ReactRootView); iOS with
 * keyboardWillShow, and keyboardWillHide when an iPad's keyboard floats or splits
 * and covers no foot. The room is always the last height said; on device the
 * keyboard probes measure it (e2e/run-flows.sh, the recovery card).
 */
import { Keyboard, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useModalKeyboardHeight } from '../useModalKeyboardPadding';

type Handler = (e?: unknown) => void;
let listeners: Record<string, Handler[]>;
const was = Platform.OS;

beforeEach(() => {
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
    (listeners[event] ??= []).push(fn);
    return { remove: () => { listeners[event] = listeners[event].filter((f) => f !== fn); } };
  }) as never);
});
afterEach(() => {
  Platform.OS = was;
  jest.restoreAllMocks();
});

const emit = async (event: string, height = 0) => act(async () => {
  (listeners[event] ?? []).forEach((fn) => fn({ duration: 250, endCoordinates: { height, screenY: 0, screenX: 0, width: 0 } }));
});

describe.each([
  ['android', 'keyboardDidShow', 'keyboardDidHide'],
  ['ios', 'keyboardWillShow', 'keyboardWillHide'],
] as const)('on %s', (os, show, hide) => {
  beforeEach(() => { Platform.OS = os; });

  it('rises by the keyboard, and follows each new height it says while open', async () => {
    const { result } = await renderHook(() => useModalKeyboardHeight());
    expect(result.current.value).toBe(0);
    await emit(show, 300);
    expect(result.current.value).toBe(300);
    // the emoji panel, taller
    await emit(show, 380);
    expect(result.current.value).toBe(380);
    // the letters again, shorter: the room shrinks with them, no gap left behind
    await emit(show, 300);
    expect(result.current.value).toBe(300);
  });

  it('gives the room back when the keyboard covers no foot', async () => {
    const { result } = await renderHook(() => useModalKeyboardHeight());
    await emit(show, 300);
    await emit(hide);
    expect(result.current.value).toBe(0);
  });

  it('listens to its own platform’s events alone, and stops when it goes', async () => {
    const { unmount } = await renderHook(() => useModalKeyboardHeight());
    expect(Object.keys(listeners).sort()).toEqual([show, hide].sort());
    await unmount();
    expect(listeners[show]).toEqual([]);
    expect(listeners[hide]).toEqual([]);
  });
});
