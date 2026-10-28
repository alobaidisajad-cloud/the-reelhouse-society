/**
 * A BUILD UNDER THE FLOOR IS TURNED AWAY, AND NOTHING ELSE IS (P3.9, P4.24).
 *
 * A build the house no longer runs had no way to be told so: the server held no floor, and the
 * app read none. house_settings holds the lowest build each platform runs; the app answers from
 * the floor kept on the phone at once, reads it again in the background after the first screen
 * and on every return, and shows "please update" and nothing else for a build under it. A read
 * that fails, or a floor never read, turns no build away; a floor kept from before still does,
 * offline. The screen's one act opens the app's own page in the store.
 */
import React from 'react';
import { AppState, InteractionManager, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import { belowFloor, keptFloor, readHouseFloor } from '@/src/lib/houseFloor';
import { useBelowFloor } from '@/src/hooks/useBelowFloor';
import { FloorGate, PleaseUpdate, STORE_LISTING } from '@/src/components/PleaseUpdate';
import { Text } from '@/src/components/text';
import { supabaseFake } from '@/test-utils/supabaseFake';

/** The house, as strict as production as the train leaves it: its one floor, or a read refused. */
let mockHouse = supabaseFake({ rows: { house_settings: [{ id: true, min_build_ios: 0, min_build_android: 0 }] } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
/** The phone's own build number, as the installed app says it. */
let mockBuild: string | null = '41';
jest.mock('expo-application', () => ({ get nativeBuildVersion() { return mockBuild; } }));
/** The gesture root's layout callback, as the gate handed it. */
let mockRootLaidOut: (() => void) | undefined;
// The gesture root as a plain view: its native half does not start under jest.
jest.mock('react-native-gesture-handler', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return { GestureHandlerRootView: (p: { onLayout?: () => void }) => { mockRootLaidOut = p.onLayout; return ReactLocal.createElement(View, p); } };
});
const mockKept = new Map<string, string>();
jest.mock('@/src/lib/bootStore', () => ({
  bootStore: () => ({
    getString: (k: string) => mockKept.get(k),
    set: (k: string, v: string) => { mockKept.set(k, v); },
  }),
}));

const floorAt = (ios: number, android = 0) =>
  supabaseFake({ rows: { house_settings: [{ id: true, min_build_ios: ios, min_build_android: android }] } });
const unreachable = () => supabaseFake({ fail: { house_settings: { code: 'PGRST000', message: 'fetch failed' } } });

/** Every listener AppState was given, so a return to the app can be played. */
const returns: ((s: AppStateStatus) => void)[] = [];
beforeEach(() => {
  mockKept.clear();
  mockBuild = '41';
  returns.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    returns.push(fn as (s: AppStateStatus) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
  // The first screen's own work done at once: the floor's first read follows it.
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task) => {
    if (typeof task === 'function') task();
    return { then: () => Promise.resolve(), done: () => {}, cancel: () => {} } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
  });
});
afterEach(() => { jest.restoreAllMocks(); });

const settled = () => act(async () => { await new Promise((done) => setTimeout(done, 0)); });

describe('the floor and the build', () => {
  it('turns away only a build under its own platform\'s floor', () => {
    const floor = { ios: 42, android: 7 };
    expect([
      belowFloor(floor, 41, 'ios'), belowFloor(floor, 42, 'ios'), belowFloor(floor, 43, 'ios'),
      belowFloor(floor, 6, 'android'), belowFloor(floor, 7, 'android'), belowFloor(floor, 41, 'android'),
    ]).toEqual([true, false, false, true, false, false]);
  });

  it('turns no build away when the floor or the build is not known', () => {
    expect([belowFloor(null, 1, 'ios'), belowFloor({ ios: 99, android: 99 }, null, 'ios')]).toEqual([false, false]);
  });

  it('keeps the floor the house answered, and changes nothing when it cannot be read', async () => {
    mockHouse = floorAt(42, 7);
    await expect(readHouseFloor()).resolves.toEqual({ ios: 42, android: 7 });
    expect(keptFloor()).toEqual({ ios: 42, android: 7 });
    mockHouse = unreachable();
    await expect(readHouseFloor()).resolves.toBeNull();
    expect(keptFloor()).toEqual({ ios: 42, android: 7 });
  });

  it('reads a kept floor that is not whole as none', () => {
    mockKept.set('house_floor', '{"ios":"42"}');
    expect(keptFloor()).toBeNull();
  });
});

describe('the app, as it opens and returns', () => {
  it('a read that fails, with no floor kept, opens the app', async () => {
    mockHouse = unreachable();
    const { result } = await renderHook(() => useBelowFloor());
    await settled();
    expect(result.current).toBe(false);
  });

  it('a floor kept above this build turns it away at once, offline', async () => {
    mockKept.set('house_floor', JSON.stringify({ ios: 42, android: 42 }));
    mockHouse = unreachable();
    const { result } = await renderHook(() => useBelowFloor());
    expect(result.current).toBe(true);
    await settled();
    expect(result.current).toBe(true);
  });

  it('a floor at or below this build opens the app; raised while it was away, it turns it away on return', async () => {
    mockHouse = floorAt(41, 41);
    const { result } = await renderHook(() => useBelowFloor());
    await settled();
    expect(result.current).toBe(false);
    mockHouse = floorAt(45, 45);
    await act(async () => { returns.forEach((fn) => fn('active')); });
    await settled();
    expect(result.current).toBe(true);
    expect(keptFloor()).toEqual({ ios: 45, android: 45 });
  });

  it('under the floor, the gate draws "please update" alone, and lays it out as the first screen', async () => {
    mockKept.set('house_floor', JSON.stringify({ ios: 42, android: 42 }));
    mockHouse = unreachable();
    const laidOut = jest.fn();
    const r = render(<FloorGate onLayout={laidOut}><Text>The Lobby</Text></FloorGate>);
    await settled();
    expect(r.getByText('A Newer Reel Is Showing')).toBeTruthy();
    expect(r.queryByText('The Lobby')).toBeNull();
    // The root laid out, as the phone lays out the first screen: the splash ends there.
    await act(async () => { mockRootLaidOut?.(); });
    expect(laidOut).toHaveBeenCalledTimes(1);
  });

  it('at or above the floor, the gate draws the app', async () => {
    mockHouse = floorAt(41, 41);
    const r = render(<FloorGate onLayout={jest.fn()}><Text>The Lobby</Text></FloorGate>);
    await settled();
    expect(r.getByText('The Lobby')).toBeTruthy();
    expect(r.queryByText('A Newer Reel Is Showing')).toBeNull();
  });

  it('the root is drawn behind the gate, its whole house inside it', () => {
    const layout = readFileSync(join(__dirname, '..', '..', '..', 'app', '_layout.tsx'), 'utf8');
    const open = layout.indexOf('<FloorGate onLayout={onLayoutReady}>');
    expect(open).toBeGreaterThan(layout.indexOf('if (!appReady || !fontsSettled) return null;'));
    expect(open).toBeLessThan(layout.indexOf('<GlobalErrorBoundary>'));
    expect(layout.indexOf('</FloorGate>')).toBeGreaterThan(layout.indexOf('</GlobalErrorBoundary>'));
  });
});

describe('the screen', () => {
  it('says why, and its one act opens the app\'s page in the store', async () => {
    // The setup's own stand-in, handed back by spyOn with what it heard before: cleared first.
    const open = jest.spyOn(Linking, 'openURL').mockClear().mockResolvedValue(true);
    const r = render(<PleaseUpdate />);
    expect(r.getByText('A Newer Reel Is Showing')).toBeTruthy();
    expect(r.getAllByRole('button')).toHaveLength(1);
    await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Update the app. Opens the store.' })); });
    expect(open.mock.calls).toEqual([[STORE_LISTING.app]]);
  });

  it('opens the store\'s web page when the store app will not open', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockClear().mockRejectedValueOnce(new Error('no store')).mockResolvedValue(true);
    const r = render(<PleaseUpdate />);
    await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Update the app. Opens the store.' })); });
    expect(open.mock.calls.map(([url]) => url)).toEqual([STORE_LISTING.app, STORE_LISTING.web]);
  });
});
