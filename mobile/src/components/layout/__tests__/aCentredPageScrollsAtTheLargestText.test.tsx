/**
 * A centred page centres between its two edges, and scrolls when it is taller.
 *
 * The Lounge's gate, the signed-out Profile and a member's file while it is
 * retrieved stood in the middle of the whole screen: at the largest text sizes
 * their lines ran under both bars, and nothing scrolled to them. Each centred
 * page is drawn here at the largest text size iOS offers (×3.1, the repo's
 * largest pass) and must draw ONE scroll (CentredRoom) that:
 *
 *   · fills the page: no box above it pads, centres or sizes it;
 *   · holds every word the page says;
 *   · grows its content to the room and centres it there (flexGrow, centre);
 *   · starts its content below the top edge and ends it above the foot
 *     (a tab's bars; a pushed page's status bar and home indicator), by navMetrics.
 *
 * That is the whole of the proof, as Yoga lays it out: content shorter than the
 * room is centred in it; taller, it starts at the top padding, and the scroll
 * ends at the foot padding, so no line lies under either edge, scrolled or not.
 */
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import {
  PUSHED_HEADER_GAP, TAB_CONTENT_GAP, bottomEdge, navBarHeight, pushedHeaderTop, resetTopBarHeight, tabBarHeight,
} from '@/src/components/layout/navMetrics';
import LoungeScreen from '@/app/(tabs)/lounge';
import ProfileTab from '@/app/(tabs)/profile';
import UserProfileScreen from '@/app/user/[username]';
import NotFoundScreen from '@/app/+not-found';
import AuthCallback from '@/app/auth-callback';

jest.setTimeout(60_000);

/** The largest text size the layout passes measure (mockups/tools/layout.cjs: iOS ×3.1). */
const LARGEST = 3.1;
const TOP = 59;
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
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 3.1 }),
}));
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual('expo-router/react-navigation'),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));

let mockUser: Record<string, unknown> | null = null;
jest.mock('@/src/stores/auth', () => {
  const state = () => ({
    isAuthenticated: !!mockUser, user: mockUser,
    restoreSession: () => new Promise(() => {}),
  });
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state()) : state());
  (useAuthStore as unknown as { getState: () => unknown }).getState = state;
  return { useAuthStore };
});

/** A member's file: retrieved, unreachable, or nobody's. */
let mockFileData: Record<string, unknown> = {};
jest.mock('@/src/hooks/useProfileController', () => ({
  useProfileController: () => {
    const file = require('./memberFileFixture').memberFile({ isSelf: false });
    return { ...file, data: { ...file.data, ...mockFileData } };
  },
}));

type J = { type: string; props: Record<string, unknown>; children: (J | string)[] | null };

/** Every node, with the chain of nodes above it. */
function walk(tree: unknown, fn: (n: J, above: J[]) => void) {
  const go = (n: J | string | null, above: J[]) => {
    if (!n || typeof n === 'string') return;
    fn(n, above);
    (n.children ?? []).forEach((c) => go(c, [...above, n]));
  };
  (Array.isArray(tree) ? tree : [tree]).forEach((n) => go(n as J, []));
}
const words = (n: J): string[] => {
  const out: string[] = [];
  walk(n, (x) => { if (x.type === 'Text') (x.children ?? []).forEach((c) => { if (typeof c === 'string' && c.trim()) out.push(c.trim()); }); });
  return out;
};

const PAGES: { name: string; kind: 'tab' | 'pushed'; draw: () => React.ReactElement; arrange: () => void }[] = [
  { name: 'the Lounge’s gate', kind: 'tab', draw: () => <LoungeScreen />, arrange: () => { mockUser = null; } },
  { name: 'the Profile, signed out', kind: 'tab', draw: () => <ProfileTab />, arrange: () => { mockUser = null; } },
  { name: 'your file, while its handle is read', kind: 'tab', draw: () => <ProfileTab />,
    arrange: () => { mockUser = { id: 'me', username: null, role: 'archivist', tier: 'archivist', preferences: {} }; } },
  { name: 'your file, retrieved (as a tab)', kind: 'tab', draw: () => <UserProfileScreen usernameOverride="kane" isRootTab />,
    arrange: () => { mockUser = { id: 'me', username: 'kane' }; mockFileData = { loading: true }; } },
  { name: 'a member’s file, retrieved', kind: 'pushed', draw: () => <UserProfileScreen />,
    arrange: () => { mockUser = { id: 'me', username: 'kane' }; mockFileData = { loading: true }; } },
  { name: 'a member’s file, unreachable', kind: 'pushed', draw: () => <UserProfileScreen />,
    arrange: () => { mockUser = { id: 'me', username: 'kane' }; mockFileData = { targetUser: null, error: new Error('offline') }; } },
  { name: 'a member not found', kind: 'pushed', draw: () => <UserProfileScreen />,
    arrange: () => { mockUser = { id: 'me', username: 'kane' }; mockFileData = { targetUser: null, error: null }; } },
  { name: 'a route not in the archive', kind: 'pushed', draw: () => <NotFoundScreen />, arrange: () => { mockUser = null; } },
  { name: 'a link being verified', kind: 'pushed', draw: () => <AuthCallback />, arrange: () => { mockUser = null; } },
];

/** The room's edges, as navMetrics sets them, at this bottom inset. */
const edges = (kind: 'tab' | 'pushed', b: number) => (kind === 'tab'
  ? { top: navBarHeight(TOP) + TAB_CONTENT_GAP, bottom: tabBarHeight(b) + TAB_CONTENT_GAP }
  : { top: pushedHeaderTop(TOP), bottom: bottomEdge(b) + PUSHED_HEADER_GAP });

afterEach(() => { mockFileData = {}; });

it('draws every page at the largest text size', () => {
  let seen = 0;
  const Probe = () => { seen = require('react-native').useWindowDimensions().fontScale; return null; };
  render(<Probe />);
  expect(seen).toBe(LARGEST);
});

describe.each(PAGES.map((p) => [p.name, p] as const))('%s', (_name, page) => {
  beforeEach(page.arrange);

  it.each([0, 34])('at ×3.1 and a %ipt foot: one scroll fills the page, holds every word, and clears both edges', async (b) => {
    mockInsetBottom = b;
    resetTopBarHeight();
    let r!: ReturnType<typeof render>;
    await act(async () => {
      r = render(<QueryClientProvider client={testQueryClient({ queries: { enabled: false } })}>{page.draw()}</QueryClientProvider>);
    });
    const tree = r.toJSON();
    const rooms: { node: J; above: J[] }[] = [];
    walk(tree, (n, above) => { if (n.props.testID === 'centred-room') rooms.push({ node: n, above }); });
    expect(rooms).toHaveLength(1);
    const { node: room, above } = rooms[0];

    // It scrolls, vertically.
    expect(room.type).toBe('RCTScrollView');
    expect(room.props.horizontal).toBeFalsy();
    expect(room.props.scrollEnabled).not.toBe(false);

    // It fills the page: nothing above it pads it in, centres it or sizes it.
    expect(StyleSheet.flatten(room.props.style as never)).toMatchObject({ flex: 1 });
    for (const box of above) {
      const st = (StyleSheet.flatten(box.props.style as never) ?? {}) as Record<string, unknown>;
      expect({ at: box.type, paddingTop: st.paddingTop, paddingBottom: st.paddingBottom, height: st.height })
        .toEqual({ at: box.type, paddingTop: undefined, paddingBottom: undefined, height: undefined });
      expect(st.justifyContent).not.toBe('center');
    }

    // Its content grows to the room, centres there, and keeps clear of both edges.
    const content = StyleSheet.flatten(room.props.contentContainerStyle as never) as Record<string, unknown>;
    const want = edges(page.kind, b);
    expect(content).toMatchObject({ flexGrow: 1, justifyContent: 'center', paddingTop: want.top, paddingBottom: want.bottom });

    // And every word the page says is inside it.
    const said = words(tree as J);
    expect(said.length).toBeGreaterThan(0);
    expect(words(room)).toEqual(said);
    r.unmount();
  });
});
