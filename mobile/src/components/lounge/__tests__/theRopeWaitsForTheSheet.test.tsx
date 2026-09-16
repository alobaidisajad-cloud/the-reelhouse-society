/**
 * theRopeWaitsForTheSheet.test.tsx — the Society never opens under a sheet.
 * ─────────────────────────────────────────────────────────────────────────────
 * The create-a-salon sheet is React Native's own <Modal>, which draws above the
 * entire navigator. Flipping "private" without the Auteur rank called the rope
 * straight away — so the Society page opened UNDERNEATH a sheet that was still
 * on screen, and the member saw nothing happen at all.
 *
 * The contract is about ORDER, so that is what is measured: at the instant the
 * Society is asked for, is the sheet still mounted? Timing-based assertions
 * would pass or fail with the machine; this cannot.
 *
 * Real time and awaited interactions, for the reason ConciergeButton.test.tsx
 * records: in this environment a state update from fireEvent does not flush
 * synchronously, and fake timers deadlock the await.
 */
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

// ── is the sheet on screen right now ────────────────────────────────────────
let mockSheetMounted = false;
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLocal = require('react');
  const ViewLocal = require('react-native/Libraries/Components/View/View').default;
  function ModalStandIn(props: Record<string, any>) {
    ReactLocal.useEffect(() => {
      mockSheetMounted = true;
      return () => { mockSheetMounted = false; };
    }, []);
    return props.visible ? ReactLocal.createElement(ViewLocal, null, props.children) : null;
  }
  return { __esModule: true, default: ModalStandIn };
});

// The shared mock drops withTiming's completion callback, and the sheet's whole
// close hangs off it. Local, and switchable, so both the ordinary close and the
// backstop (a close animation that never completes) can be driven.
let mockAnimationsFinish = true;
jest.mock('react-native-reanimated', () => {
  const ReactLocal = require('react');
  const RN = require('react-native');
  const animated = (C: any) =>
    ReactLocal.forwardRef((p: any, ref: any) => ReactLocal.createElement(C, { ...p, ref }));
  return {
    __esModule: true,
    default: { View: animated(RN.View), createAnimatedComponent: animated },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (v: any, _cfg: any, cb?: (finished: boolean) => void) => {
      if (mockAnimationsFinish) cb?.(true);
      return v;
    },
    runOnJS: (fn: any) => fn,
    Easing: { in: () => () => 0, out: () => () => 0, cubic: () => 0 },
  };
});

jest.mock('react-native-gesture-handler', () => {
  const ReactLocal = require('react');
  const RN = require('react-native');
  const pan: Record<string, any> = {};
  pan.onChange = () => pan;
  pan.onEnd = () => pan;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: any) => children,
    GestureHandlerRootView: (p: any) => ReactLocal.createElement(RN.View, p),
  };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@/src/hooks/useModalKeyboardPadding', () => ({ useModalKeyboardPadding: () => ({}) }));
jest.mock('@/src/utils/TactileEngine', () => ({ __esModule: true, default: { selection: jest.fn(), mutate: jest.fn() } }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn() } }));
jest.mock('@/src/components/PressableScale', () => {
  const RN = require('react-native');
  return { __esModule: true, default: RN.Pressable };
});
jest.mock('@/src/stores/lounge', () => ({
  useLoungeStore: (sel: (s: any) => any) => sel({ createLounge: jest.fn() }),
}));

let mockHeld = false;
const mockOpen = jest.fn();
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: () => ({ held: mockHeld, rank: 'auteur', standing: 'stranger', open: () => mockOpen() }),
}));

// eslint-disable-next-line import/first
import { CreateLoungeSheet } from '../CreateLoungeSheet';

/** The lounge tab, as far as the sheet can tell: it owns `visible`. */
function Corridor() {
  const [visible, setVisible] = useState(true);
  return (
    <>
      <CreateLoungeSheet visible={visible} onClose={() => setVisible(false)} />
      <Pressable accessibilityLabel="Establish" onPress={() => setVisible(true)}><Text>ESTABLISH</Text></Pressable>
    </>
  );
}

const PRIVATE_SWITCH = /Make this a private screening room/;
// Measured, not guessed: the backstop clears the sheet at ~500ms and the trip
// lands on a later frame, after 550ms and before 850ms in this environment.
// 1200ms is a margin, not a claim about the device.
const waitPastBackstop = () => act(async () => { await new Promise((r) => setTimeout(r, 1200)); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

/** Records, at the moment of asking, whether the sheet was still up. */
let sheetUpWhenAsked: boolean[] = [];

beforeEach(() => {
  mockHeld = false;
  mockAnimationsFinish = true;
  mockSheetMounted = false;
  sheetUpWhenAsked = [];
  mockOpen.mockReset().mockImplementation(() => { sheetUpWhenAsked.push(mockSheetMounted); });
});

describe('the rope waits for the sheet', () => {
  it('opens the Society only once the sheet has left the screen', async () => {
    const api = render(<Corridor />);
    expect(mockSheetMounted).toBe(true);

    await fireEvent(api.getByLabelText(PRIVATE_SWITCH), 'valueChange', true);
    await settle();

    // Asked for exactly once, and at that instant the sheet was gone. Before
    // the fix this was `[true]`: the Society opened beneath a visible sheet.
    expect(sheetUpWhenAsked).toEqual([false]);
  });

  it('still gets there when the close animation never completes', async () => {
    // A switch that silently does nothing is the worse failure. The backstop
    // must clear the sheet and then travel — never travel under it.
    mockAnimationsFinish = false;
    const api = render(<Corridor />);

    await fireEvent(api.getByLabelText(PRIVATE_SWITCH), 'valueChange', true);
    await settle();
    expect(mockOpen).not.toHaveBeenCalled();

    await waitPastBackstop();
    // A second turn, and not a longer first one: inside a single act() React
    // holds the backstop's unmount until the act ends, so the trip that is
    // scheduled AFTER the unmount cannot land inside the same act. Measured —
    // one 1200ms act failed where 550ms + 300ms in separate acts passed.
    await settle();
    expect(sheetUpWhenAsked).toEqual([false]);
  });

  it('the salon they were naming is still there when they come back', async () => {
    const api = render(<Corridor />);
    await fireEvent.changeText(api.getByLabelText('Salon name'), 'The Noir Corner');
    await fireEvent.changeText(api.getByLabelText('Salon description'), 'Wet streets, bad men.');

    await fireEvent(api.getByLabelText(PRIVATE_SWITCH), 'valueChange', true);
    await settle();
    expect(mockOpen).toHaveBeenCalledTimes(1);

    // Back from the Society, into the same corridor, and open the sheet again.
    await fireEvent.press(api.getByLabelText('Establish'));
    await settle();
    expect(api.getByLabelText('Salon name').props.value).toBe('The Noir Corner');
    expect(api.getByLabelText('Salon description').props.value).toBe('Wet streets, bad men.');
  });

  it('an Auteur flipping the switch is not sent anywhere — the sheet stays', async () => {
    mockHeld = true;
    const api = render(<Corridor />);
    await fireEvent(api.getByLabelText(/Make this a private screening room/), 'valueChange', true);
    await settle();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockSheetMounted).toBe(true);
  });
});
