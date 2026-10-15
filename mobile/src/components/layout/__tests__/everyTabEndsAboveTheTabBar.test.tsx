/**
 * Every tab ends above the tab bar.
 *
 * The tab bar is drawn over every tab (`position: 'absolute'`), so a tab that
 * pads only the home indicator's inset leaves its last line under the bar: the
 * signed-out Lobby did, and its two doors sat under it. Each tab is drawn here
 * at three bottom insets (an SE's 0, an older notch phone's 21, a home-indicator
 * iPhone's 34), signed out and signed in, and its scroll must end at
 * useTabContentBottom's value, the same place every time; a centred tab's room
 * must end at the tab bar plus TAB_CONTENT_GAP.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { placesHoldingFoot } from '@/test-utils/bottomEdge';
import {
  SCROLL_END_GAP, TAB_CONTENT_GAP, resetTopBarHeight, tabBarHeight,
} from '@/src/components/layout/navMetrics';
import LobbyScreen from '@/app/(tabs)/index';
import ReelScreen from '@/app/(tabs)/reels';
import DispatchScreen from '@/app/(tabs)/dispatch';
import DarkroomScreen from '@/app/(tabs)/darkroom';
import LoungeScreen from '@/app/(tabs)/lounge';
import ProfileTab from '@/app/(tabs)/profile';

// Each case draws a whole tab at three insets: seconds on a busy machine.
jest.setTimeout(60_000);

let mockInsetBottom = 34;
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: mockInsetBottom, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
}));

let mockSignedIn = true;
jest.mock('@/src/stores/auth', () => {
  // One object for each side of the door, as a store keeps one.
  const member = {
    isAuthenticated: true,
    user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} },
    restoreSession: () => Promise.resolve(),
  };
  const visitor = { isAuthenticated: false, user: null, restoreSession: () => Promise.resolve() };
  const state = () => (mockSignedIn ? member : visitor);
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state()) : state());
  (useAuthStore as unknown as { getState: () => unknown }).getState = state;
  return { useAuthStore };
});

/** The member's own file, as its controller hands it over (zz-memberfile.gen's shape). */
let mockRoom: string | null = null;
jest.mock('@/src/hooks/useProfileController', () => ({
  useProfileController: () => require('./memberFileFixture').memberFile({ activeTab: mockRoom }),
}));

/** The tab, drawn at one bottom inset; its client asks the house nothing. */
const draw = (tab: () => React.ReactElement) => async (insetBottom: number) => {
  mockInsetBottom = insetBottom;
  resetTopBarHeight();
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(
      <QueryClientProvider client={testQueryClient({ queries: { enabled: false } })}>{tab()}</QueryClientProvider>,
    );
  });
  return { tree: r.toJSON(), done: () => r.unmount() };
};

/** A tab's scroll: it ends above the tab bar by the scroll's end gap. */
const scrollEnd = (b: number) => tabBarHeight(b) + SCROLL_END_GAP;
/** A centred tab's room: it ends above the tab bar by the gap it keeps from the top bar. */
const roomEnd = (b: number) => tabBarHeight(b) + TAB_CONTENT_GAP;

const TABS: [string, () => React.ReactElement, () => void, (b: number) => number][] = [
  ['the Lobby, signed out (the welcome’s doors)', () => <LobbyScreen />, () => { mockSignedIn = false; }, scrollEnd],
  ['the Lobby, signed in (the wall)', () => <LobbyScreen />, () => { mockSignedIn = true; }, scrollEnd],
  ['the Reel', () => <ReelScreen />, () => { mockSignedIn = true; }, scrollEnd],
  ['the Dispatch', () => <DispatchScreen />, () => { mockSignedIn = true; }, scrollEnd],
  ['the Darkroom', () => <DarkroomScreen />, () => { mockSignedIn = true; }, scrollEnd],
  ['the Lounge, signed in', () => <LoungeScreen />, () => { mockSignedIn = true; }, scrollEnd],
  ['the Lounge, signed out (the gate)', () => <LoungeScreen />, () => { mockSignedIn = false; }, roomEnd],
  ['the Profile, signed out', () => <ProfileTab />, () => { mockSignedIn = false; }, roomEnd],
  ['the Profile, your file', () => <ProfileTab />, () => { mockSignedIn = true; mockRoom = null; }, scrollEnd],
  ['the Profile, a room of your file', () => <ProfileTab />, () => { mockSignedIn = true; mockRoom = 'ledger'; }, scrollEnd],
  ['the Profile, the passport room', () => <ProfileTab />, () => { mockSignedIn = true; mockRoom = 'passport'; }, scrollEnd],
];

describe.each(TABS)('%s', (_name, tab, arrange, want) => {
  beforeEach(arrange);
  afterEach(() => { mockRoom = null; });

  it('ends above the tab bar at every bottom inset, at the same place', async () => {
    expect(await placesHoldingFoot(draw(tab), want)).toEqual([]);
  });
});

it('the tab bar is the one source of what clears it: tall enough at every inset', () => {
  // The bar's room under its icons is never less than the home indicator's inset.
  for (const b of [0, 21, 34, 48]) expect(tabBarHeight(b)).toBeGreaterThanOrEqual(b + 56);
});
