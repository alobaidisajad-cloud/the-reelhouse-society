/**
 * theSheetOffersOnlyWhatCanWork.test.tsx — a message's sheet offers no door
 * that cannot open.
 * ─────────────────────────────────────────────────────────────────────────────
 * A member who has left keeps their words, but their id is gone. The sheet
 * still offered REPORT and BLOCK on those words: a report with no member to
 * report, and a block that blocked nobody. It also read "BLOCK @" with no name
 * when the author's name had not loaded.
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
jest.mock('@/src/components/PressableScale', () => {
  const RN = require('react-native');
  return { __esModule: true, default: RN.Pressable };
});

// eslint-disable-next-line import/first
import { ActionSheet } from '../ActionSheet';

const message = (over: Partial<LoungeMessage>) => ({
  id: 'm1', lounge_id: 'l1', user_id: 'u2', username: 'marguerite', avatar_url: null,
  content: 'Late Spring is a perfect film.', type: 'text', created_at: '2026-10-01T12:00:00Z',
  ...over,
}) as LoungeMessage;

const sheet = (msg: LoungeMessage) => render(
  <ActionSheet
    visible msg={msg} isSelf={false} canReact={false} currentReactions={[]}
    onClose={jest.fn()} onReply={jest.fn()} onReact={jest.fn()} onDelete={jest.fn()}
    onReport={jest.fn()} onBlock={jest.fn()}
  />,
);

it('offers a departed member’s words to copy and answer, and nothing that needs a member', () => {
  const t = sheet(message({ user_id: null, username: '[deleted]' }));
  expect(t.getByText('COPY TEXT')).toBeTruthy();
  expect(t.queryByText('REPORT MESSAGE')).toBeNull();
  expect(t.queryByText(/^BLOCK/)).toBeNull();
});

it('names the member it would block', () => {
  const t = sheet(message({}));
  expect(t.getByText('REPORT MESSAGE')).toBeTruthy();
  expect(t.getByText('BLOCK @MARGUERITE')).toBeTruthy();
});

it('never reads "BLOCK @" with no name after it', () => {
  const t = sheet(message({ username: '' }));
  expect(t.getByText('BLOCK THIS MEMBER')).toBeTruthy();
  expect(t.queryByText('BLOCK @')).toBeNull();
});
