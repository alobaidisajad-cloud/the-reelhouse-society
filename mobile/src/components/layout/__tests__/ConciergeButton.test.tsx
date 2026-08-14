/**
 * ConciergeButton.test.tsx
 * ─────────────────────────────────────────────────────────────
 * Pins the defect that killed the button this one replaces.
 *
 * The old FAB fired `router.push` from inside
 * `InteractionManager.runAfterInteractions`, which drains almost immediately —
 * a whole 160ms before its own sheet finished closing. On iOS a native Modal
 * and a router modal route are both presented view controllers, and asking for
 * the second while the first is still on screen is a conflict UIKit does not
 * forgive.
 *
 * So the contract held here is narrow and behavioural: choosing a door must
 * NOT navigate on the press itself, and must ALWAYS navigate once the sheet is
 * gone — including when the platform's dismissal callback never arrives,
 * because a menu item that silently does nothing is the worse failure.
 *
 * NOTE ON `await`: in this repo's jest environment a state update triggered by
 * fireEvent does not flush synchronously — proved with a plain conditional
 * <Text>, so it is environmental rather than anything about this component.
 * Every interaction below is awaited. Drop the await and these tests go green
 * against a component that renders nothing, which is worth knowing before
 * copying this file.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockPush = jest.fn();

// The Modal is stood in for so its props are reachable. React Native's Modal is
// a composite, and RNTL v14 only walks host elements — there is no public way
// to read `onDismiss` off the real one. The stand-in keeps the only behaviour
// these tests lean on: children exist exactly while `visible`.
const mockModal: { props: Record<string, any> } = { props: {} };
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLocal = require('react');
  const ViewLocal = require('react-native/Libraries/Components/View/View').default;
  return {
    __esModule: true,
    default: (props: Record<string, any>) => {
      mockModal.props = props;
      return props.visible ? ReactLocal.createElement(ViewLocal, null, props.children) : null;
    },
  };
});

// The shared mock's `withTiming` drops its completion callback, and this
// component's whole close sequence hangs off that callback. Overridden here
// rather than in jest.setup.ts: making every withTiming in the app fire its
// callback synchronously is a behaviour change across 156 suites, and this is
// the only file that needs it.
jest.mock('react-native-reanimated', () => {
  const ReactLocal = require('react');
  const RN = require('react-native');
  const animated = (C: any) =>
    ReactLocal.forwardRef((p: any, ref: any) => ReactLocal.createElement(C, { ...p, ref }));
  return {
    __esModule: true,
    default: { View: animated(RN.View), Text: animated(RN.Text), createAnimatedComponent: animated },
    createAnimatedComponent: animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withSpring: (v: any) => v,
    withTiming: (v: any, _cfg: any, cb?: (finished: boolean) => void) => { cb?.(true); return v; },
    runOnJS: (fn: any) => fn,
    useReducedMotion: () => false,
    Easing: { in: () => () => 0, out: () => () => 0, inOut: () => () => 0, quad: 'quad' },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

// Imported below the mocks on purpose: reading top-to-bottom, the stand-ins are
// in place before the component that consumes them. Jest hoists jest.mock
// regardless, so this is about legibility, not correctness.
// eslint-disable-next-line import/first
import { ConciergeButton } from '../ConciergeButton';

/** Opens the sheet and runs onShow, as the platform would. */
async function open(api: ReturnType<typeof render>) {
  await fireEvent.press(api.getByLabelText('Create'));
  await act(async () => { mockModal.props.onShow?.(); });
}

/**
 * Real time, not fake. The component's backstop is a 450ms timer and the
 * interactions here must be awaited (see the note at the top); driving both
 * with fake timers deadlocks the await. 600ms of real waiting across three
 * tests is cheaper than that fight.
 */
const waitPastBackstop = () =>
  act(async () => { await new Promise((r) => setTimeout(r, 600)); });

describe('ConciergeButton', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockModal.props = {};
  });

  it('offers both doors', async () => {
    const api = render(<ConciergeButton />);
    await open(api);
    expect(api.getByText('Log a Film')).toBeTruthy();
    expect(api.getByText('Curate a Stack')).toBeTruthy();
  });

  it('does NOT navigate on the press itself', async () => {
    const api = render(<ConciergeButton />);
    await open(api);

    await fireEvent.press(api.getByLabelText('Log a film'));

    // This is the exact window the old FAB pushed in, and lost: the close has
    // been asked for, but the platform has not yet reported the sheet gone.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates once the platform reports the sheet dismissed', async () => {
    const api = render(<ConciergeButton />);
    await open(api);

    await fireEvent.press(api.getByLabelText('Log a film'));
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => { mockModal.props.onDismiss?.(); });
    expect(mockPush).toHaveBeenCalledWith('/log-modal');
  });

  it('still navigates when the dismissal callback never arrives', async () => {
    const api = render(<ConciergeButton />);
    await open(api);

    await fireEvent.press(api.getByLabelText('Curate a stack'));
    expect(mockPush).not.toHaveBeenCalled();

    // No onDismiss. The backstop has to carry it, or the item is dead.
    await waitPastBackstop();
    expect(mockPush).toHaveBeenCalledWith('/list-modal');
  });

  it('never navigates twice, however the two paths race', async () => {
    const api = render(<ConciergeButton />);
    await open(api);

    await fireEvent.press(api.getByLabelText('Log a film'));
    await act(async () => { mockModal.props.onDismiss?.(); });
    await waitPastBackstop();

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('closing without choosing navigates nowhere', async () => {
    const api = render(<ConciergeButton />);
    await open(api);

    await act(async () => { mockModal.props.onRequestClose?.(); });
    await act(async () => { mockModal.props.onDismiss?.(); });
    await waitPastBackstop();

    expect(mockPush).not.toHaveBeenCalled();
  });
});
