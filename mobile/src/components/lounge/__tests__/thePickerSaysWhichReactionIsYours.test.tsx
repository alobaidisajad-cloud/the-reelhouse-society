/**
 * thePickerSaysWhichReactionIsYours.test.tsx — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * A message's sheet draws the reaction the member already gave lit among the five, for a tap on
 * it takes it back. A screen reader was told only its name, the same as the four beside it: now
 * it is said chosen, and the rest are said not.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import type { LoungeMessage } from '@/src/stores/lounge';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLocal = require('react');
  const ViewLocal = require('react-native/Libraries/Components/View/View').default;
  return {
    __esModule: true,
    default: (props: Record<string, any>) => (props.visible ? ReactLocal.createElement(ViewLocal, null, props.children) : null),
  };
});
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
jest.mock('@/src/utils/TactileEngine', () => ({ __esModule: true, default: { selection: jest.fn(), mutate: jest.fn() } }));

// eslint-disable-next-line import/first
import { ActionSheet } from '../ActionSheet';

const MESSAGE: LoungeMessage = {
  id: 'm1', lounge_id: 'l1', user_id: 'u2', username: 'marguerite', avatar_url: undefined,
  content: 'Late Spring is a perfect film.', type: 'text', created_at: '2026-10-01T12:00:00Z',
};

it('the reaction the member gave is said chosen in the picker; the four others are not', () => {
  const t = render(
    <ActionSheet
      visible msg={MESSAGE} isSelf={false} canReact canReply
      currentReactions={[{ reaction: 'bravo', count: 3, mine: true }, { reaction: 'panned', count: 1, mine: false }]}
      onClose={jest.fn()} onReply={jest.fn()} onReact={jest.fn()} onDelete={jest.fn()}
      onReport={jest.fn()} onBlock={jest.fn()}
    />,
  );
  expect(t.getByLabelText('BRAVO').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  for (const other of ['ADORED', 'RIVETING', 'QUOTED', 'PANNED']) {
    expect(t.getByLabelText(other).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  }
});
