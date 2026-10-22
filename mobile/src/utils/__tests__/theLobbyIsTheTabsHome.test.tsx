/**
 * theLobbyIsTheTabsHome.test.tsx — Back lands on the Lobby, from a cold link and from any tab.
 *
 * The tab navigator builds its own first tab, and its own Back, from the props it is given, not
 * from expo-router's `unstable_settings` (that names a group's first route to the link parser only,
 * and a link to a page outside the tabs never reaches it). Unnamed, both were the first tab the bar
 * lists, the Dispatch: it loaded unseen beneath every screen opened cold by a link, Back from that
 * screen landed there, and Back from the Lobby went to the Dispatch before it left the app (Sealed
 * E2E 39787831762, auth_deep_link, after the `unstable_settings` line had shipped).
 *
 * Rendered through expo-router itself: a stand-in house with the real tabs in the real order, read
 * from app/(tabs)/_layout.tsx, which must hand its navigator TABS_HOME.
 */
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { Text } from 'react-native';
// The real navigators, from their own entry points: jest.setup.ts stands `expo-router` itself in.
import { Stack } from 'expo-router/stack';
import { Tabs } from 'expo-router/tabs';
import { router } from 'expo-router/build/imperative-api';
import { act, cleanup, renderRouter } from 'expo-router/testing-library';
import { TABS_HOME } from '@/src/utils/lastTab';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TABS_LAYOUT = read('app/(tabs)/_layout.tsx');
const ORDER = [...TABS_LAYOUT.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);

const page = (name: string) => function Page() { return <Text>{name}</Text>; };

function house() {
  return {
    _layout: { default: () => <Stack />, unstable_settings: { anchor: '(tabs)' } },
    '(tabs)/_layout': () => (
      <Tabs {...TABS_HOME}>
        {ORDER.map((name) => <Tabs.Screen key={name} name={name} />)}
      </Tabs>
    ),
    ...Object.fromEntries(ORDER.map((name) => [`(tabs)/${name}`, page(`tab ${name}`)])),
    '+not-found': page('not in the archive'),
  };
}

it('reads the real tabs, the Lobby among them and not first', () => {
  expect(ORDER.slice(0, 5)).toEqual(['dispatch', 'reels', 'index', 'darkroom', 'profile']);
  expect(read('app/_layout.tsx')).toMatch(/anchor: '\(tabs\)'/);
});

it('the tab layout hands its navigator the Lobby as its home', () => {
  expect(TABS_LAYOUT).toMatch(/<Tabs\s+\{\.\.\.TABS_HOME\}/);
});

/** The router settles its state on timers (renderRouter turns them fake): run them out. */
const settle = () => act(() => { jest.runOnlyPendingTimers(); });
const go = (move: () => void) => { act(move); settle(); };

afterEach(() => { cleanup(); jest.useRealTimers(); });

// The page beneath the open one is hidden from the reader; it is there all the same.
const BENEATH = { includeHiddenElements: true };

// One render, one journey: expo-router keeps its router in one store for the whole file, and a
// second render here was steered by the first's.
it('a screen opened cold by a link has the Lobby beneath it, where Back lands, never the first tab listed; Back from any other tab lands there too, and from the Lobby leaves the app', () => {
  const app = renderRouter(house(), { initialUrl: '/no-such-room' });
  settle();
  expect(app.getByText('not in the archive')).toBeTruthy();
  // A tab is drawn once opened: beneath the page, the Lobby is, and the Dispatch never was.
  expect(app.getByText('tab index', BENEATH)).toBeTruthy();
  expect(app.queryByText('tab dispatch', BENEATH)).toBeNull();
  expect(router.canGoBack()).toBe(true);
  go(() => router.back());
  expect(app.getPathname()).toBe('/');

  const landed = (['/dispatch', '/reels', '/darkroom', '/profile'] as const).map((tab) => {
    go(() => router.navigate(tab));
    expect(app.getPathname()).toBe(tab);
    go(() => router.back());
    return app.getPathname();
  });
  expect(landed).toEqual(['/', '/', '/', '/']);
  expect(router.canGoBack()).toBe(false);
});
