/**
 * aLogIsAskedOfTheScreenInFront.test.tsx — a log's ··· opens one sheet, the front screen's.
 *
 * Every screen that draws logs holds a LogModerationHost, and a tab stays mounted under the
 * screens pushed over it (the Reel, under a film's Log Archive). Both hosts heard the ask and both
 * opened their sheet: two stacked over one log, the second's BLOCK under the first.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { LogModerationHost, askAboutLog } from '../LogModerationHost';

let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({
  ...require('@/test-utils/navigationMock').navigationMock(),
  useIsFocused: () => mockFocused,
}));
jest.mock('../ReportSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const ReactLocal = require('react');
  const RN = require('react-native');
  const pan: Record<string, unknown> = {};
  pan.onChange = () => pan;
  pan.onEnd = () => pan;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: (p: object) => ReactLocal.createElement(RN.View, p),
  };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

const SHEET = 'Report kane to the Tribunal';

beforeEach(() => { mockFocused = true; });

it('a host beneath another screen opens nothing, and opens the sheet once it is in front', async () => {
  mockFocused = false;
  const r = await render(<LogModerationHost />);
  await act(async () => { askAboutLog({ logId: 'l1', userId: 'u2', username: 'kane' }); });
  expect(r.queryByLabelText(SHEET)).toBeNull();
  // The same host, its screen in front again: the ask still stands, and it is this host's now.
  mockFocused = true;
  await r.rerender(<LogModerationHost />);
  expect(r.getByLabelText(SHEET)).toBeTruthy();
  r.unmount();
});

it('the host in front opens the sheet', async () => {
  const r = render(<LogModerationHost />);
  await act(async () => { askAboutLog({ logId: 'l2', userId: 'u2', username: 'kane' }); });
  expect(r.getByLabelText(SHEET)).toBeTruthy();
  r.unmount();
});
