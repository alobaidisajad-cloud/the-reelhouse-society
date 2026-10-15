/**
 * Every tab starts below the top bar, as the bar measured itself.
 *
 * The bar is drawn over every tab (`headerTransparent`), so a tab that sums its
 * own top disagrees with it: at a 59pt inset such a sum put the Lounge's title
 * and the member's name under the bar. Each tab is drawn here with the bar, at
 * three top insets, signed out and signed in, and its content must start at the
 * bar's height plus TAB_CONTENT_GAP: first as the bar is built (its first
 * frame), then as the bar measures itself, at a height no sum could reach.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { INSETS, placesAt, topValues } from '@/test-utils/topEdge';
import {
  TAB_CONTENT_GAP, navBarHeight, resetTopBarHeight,
} from '@/src/components/layout/navMetrics';
import { TopNavBar } from '@/src/components/layout/TopNavBar';
import LobbyScreen from '@/app/(tabs)/index';
import ReelScreen from '@/app/(tabs)/reels';
import DispatchScreen from '@/app/(tabs)/dispatch';
import DarkroomScreen from '@/app/(tabs)/darkroom';
import LoungeScreen from '@/app/(tabs)/lounge';
import ProfileTab from '@/app/(tabs)/profile';

// Each case draws a whole tab and its bar at three insets: seconds on a busy machine.
jest.setTimeout(60_000);

let mockInsetTop = 59;
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: mockInsetTop, bottom: 34, left: 0, right: 0 }),
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

type Drawn = ReturnType<typeof render>;

/** The tab, drawn under its bar, at one inset; its client asks the house nothing. */
async function draw(tab: React.ReactElement): Promise<Drawn> {
  resetTopBarHeight();
  let r!: Drawn;
  await act(async () => {
    r = render(
      <QueryClientProvider client={testQueryClient({ queries: { enabled: false } })}>
        <TopNavBar />
        {tab}
      </QueryClientProvider>,
    );
  });
  return r;
}

const TABS: [string, () => React.ReactElement, () => void][] = [
  ['the Lobby, signed out', () => <LobbyScreen />, () => { mockSignedIn = false; }],
  ['the Lobby, signed in', () => <LobbyScreen />, () => { mockSignedIn = true; }],
  ['the Reel', () => <ReelScreen />, () => { mockSignedIn = true; }],
  ['the Dispatch', () => <DispatchScreen />, () => { mockSignedIn = true; }],
  ['the Darkroom', () => <DarkroomScreen />, () => { mockSignedIn = true; }],
  ['the Lounge, signed in', () => <LoungeScreen />, () => { mockSignedIn = true; }],
  ['the Lounge, signed out', () => <LoungeScreen />, () => { mockSignedIn = false; }],
  ['the Profile, signed out', () => <ProfileTab />, () => { mockSignedIn = false; }],
  ['the Profile, your file', () => <ProfileTab />, () => { mockSignedIn = true; mockRoom = null; }],
  ['the Profile, a room of your file', () => <ProfileTab />, () => { mockSignedIn = true; mockRoom = 'ledger'; }],
];

describe.each(TABS)('%s', (_name, tab, arrange) => {
  beforeEach(arrange);
  afterEach(() => { mockRoom = null; });

  it('starts below the bar at every inset: as built, then as measured', async () => {
    const missing: string[] = [];
    let built = null as Set<string> | null;
    let measured = null as Set<string> | null;
    for (const insetTop of INSETS) {
      mockInsetTop = insetTop;
      const r = await draw(tab());
      // The first frame: the bar as it is built, before it has laid out.
      const asBuilt = navBarHeight(insetTop) + TAB_CONTENT_GAP;
      const firstFrame = placesAt(r.toJSON(), asBuilt);
      if (firstFrame.size === 0) missing.push(`${insetTop}pt, first frame: no top at ${asBuilt}, only ${topValues(r.toJSON())}`);
      built = built ? new Set([...built].filter((p) => firstFrame.has(p))) : firstFrame;

      // The bar measures itself at a height no sum on the inset gives.
      const height = navBarHeight(insetTop) + 0.5;
      await act(async () => {
        fireEvent(r.getByTestId('top-nav-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
      });
      const after = placesAt(r.toJSON(), height + TAB_CONTENT_GAP);
      if (after.size === 0) missing.push(`${insetTop}pt, measured: no top at ${height + TAB_CONTENT_GAP}, only ${topValues(r.toJSON())}`);
      measured = measured ? new Set([...measured].filter((p) => after.has(p))) : after;
      r.unmount();
    }
    expect(missing).toEqual([]);
    // The same place, at every inset: a number that matched once by chance does not pass.
    expect(built!.size).toBeGreaterThan(0);
    expect(measured!.size).toBeGreaterThan(0);
  });
});
