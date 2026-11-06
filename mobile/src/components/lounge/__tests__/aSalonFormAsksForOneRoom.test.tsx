/**
 * aSalonFormAsksForOneRoom.test.tsx — the founding form names its room once.
 * ─────────────────────────────────────────────────────────────────────────────
 * create_lounge founds the room the form names (p_id) once, and answers with it
 * again for its founder. So the form must name the same room on every tap until
 * one is made, or a lost answer and a tap again found a second room of the same
 * name; and a new room once one is made, or the next salon is answered with the
 * last.
 *
 * Real time and awaited interactions, as theRopeWaitsForTheSheet.test.tsx does.
 */
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  function ModalStandIn(props: Record<string, any>) {
    const ViewLocal = require('react-native/Libraries/Components/View/View').default;
    return props.visible ? require('react').createElement(ViewLocal, null, props.children) : null;
  }
  return { __esModule: true, default: ModalStandIn };
});
// The shared mock drops withTiming's completion callback, and the sheet's close hangs off it.
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
    withTiming: (v: any, _cfg: any, cb?: (finished: boolean) => void) => { cb?.(true); return v; },
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
const mockCreateLounge = jest.fn();
jest.mock('@/src/stores/lounge', () => ({
  useLoungeStore: (sel: (s: any) => any) => sel({ createLounge: mockCreateLounge }),
}));
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: () => ({ held: true, rank: 'auteur', standing: 'member', open: jest.fn() }),
}));

// eslint-disable-next-line import/first
import { CreateLoungeSheet } from '../CreateLoungeSheet';

/** The lounge tab, as far as the sheet can tell: it owns `visible`. */
function Corridor() {
  const [visible, setVisible] = useState(true);
  return (
    <>
      <Pressable accessibilityLabel="Establish" onPress={() => setVisible(true)}><Text>ESTABLISH</Text></Pressable>
      <CreateLoungeSheet visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The room each founding named, in order. */
const named = () => mockCreateLounge.mock.calls.map((c) => c[3]);

async function found(api: ReturnType<typeof render>, name: string) {
  await fireEvent.changeText(api.getByLabelText('Salon name'), name);
  await fireEvent.press(api.getByLabelText('Establish salon'));
  await settle();
}

beforeEach(() => mockCreateLounge.mockReset());

describe('the founding form', () => {
  it('names the same room on a tap again after an answer was lost', async () => {
    mockCreateLounge.mockResolvedValueOnce(null).mockResolvedValueOnce('room-1');
    const api = render(<Corridor />);
    await found(api, 'The Noir Corner');
    await found(api, 'The Noir Corner');
    expect(named()).toHaveLength(2);
    expect(named()[0]).toMatch(UUID);
    expect(named()[1]).toBe(named()[0]);
  });

  it('names the same room after a close, as it keeps the words', async () => {
    mockCreateLounge.mockResolvedValue(null);
    const api = render(<Corridor />);
    await found(api, 'The Noir Corner');
    await fireEvent.press(api.getByLabelText('Cancel'));
    await settle();
    await fireEvent.press(api.getByLabelText('Establish'));
    await settle();
    await found(api, 'The Noir Corner');
    expect(named()).toHaveLength(2);
    expect(named()[1]).toBe(named()[0]);
  });

  it('names a new room once one is made', async () => {
    mockCreateLounge.mockResolvedValueOnce('room-1').mockResolvedValueOnce('room-2');
    const api = render(<Corridor />);
    await found(api, 'The Noir Corner');
    // Founded: the sheet has gone, and its words with it.
    expect(api.queryByLabelText('Salon name')).toBeNull();
    await fireEvent.press(api.getByLabelText('Establish'));
    await settle();
    expect(api.getByLabelText('Salon name').props.value).toBe('');
    await found(api, 'The Silent Hour');
    expect(named()).toHaveLength(2);
    expect(named()[1]).toMatch(UUID);
    expect(named()[1]).not.toBe(named()[0]);
  });
});
