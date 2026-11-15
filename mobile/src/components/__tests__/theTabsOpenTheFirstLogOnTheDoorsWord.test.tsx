/**
 * theTabsOpenTheFirstLogOnTheDoorsWord.test.tsx — the tabs open the first log once the Initiation
 * says its door is gone, never on a timer from the tap.
 *
 * LOG YOUR FIRST FILM pushed the log 250ms after the tap, while the Initiation's Modal still
 * dismissed; on iOS that presentation was refused and a new member's first act opened nothing
 * (theFirstLogOpensOnceTheDoorIsGone.test.tsx holds the door's own word).
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';


afterEach(() => jest.useRealTimers());

type DoorProps = { visible: boolean; onComplete: (a: 'log' | 'quiet') => void; onGone?: () => void };
let mockDoor: DoorProps | null = null;
const mockPush = jest.fn();
const mockDismiss = jest.fn();

jest.mock('@/src/components/InitiationModal', () => {
  const actual = jest.requireActual('@/src/components/InitiationModal');
  return { ...actual, __esModule: true, default: (p: DoorProps) => { mockDoor = p; return null; } };
});
jest.mock('@/src/hooks/useInitiation', () => ({
  useInitiation: () => ({ visible: true, username: 'vera', memberNo: 12, dismiss: mockDismiss }),
}));
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn() },
}));
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));
jest.mock('@/src/components/layout/TopNavBar', () => ({ TopNavBar: () => null }));

const mountTabs = () => {
  const TabLayout = require('@/app/(tabs)/_layout').default as React.ComponentType;
  return render(<TabLayout />);
};

// The tabs' code is loaded once before the cases, so no case pays for the load.
beforeAll(() => { require('@/app/(tabs)/_layout'); }, 30_000);
beforeEach(() => { mockDoor = null; mockPush.mockClear(); mockDismiss.mockClear(); });

it('LOG YOUR FIRST FILM: the door is closed, and the log opens only once it is gone', async () => {
  const r = await mountTabs();
  jest.useFakeTimers();   // after the render: it settles on real timers
  if (!mockDoor) throw new Error(`the tabs drew no door: ${JSON.stringify(r.toJSON())?.slice(0, 300)}`);
  await act(async () => { mockDoor!.onComplete('log'); });
  expect(mockDismiss).toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(mockPush).not.toHaveBeenCalled();             // no timer from the tap
  await act(async () => { mockDoor!.onGone!(); jest.runOnlyPendingTimers(); });
  expect(mockPush).toHaveBeenCalledWith('/log-modal');
  // Said twice (onDismiss and the backstop), it opens the log once.
  await act(async () => { mockDoor!.onGone!(); jest.runOnlyPendingTimers(); });
  expect(mockPush).toHaveBeenCalledTimes(1);
  await act(async () => { r.unmount(); });
});

it('entering quietly opens nothing when the door is gone', async () => {
  const r = await mountTabs();
  jest.useFakeTimers();   // after the render: it settles on real timers
  if (!mockDoor) throw new Error(`the tabs drew no door: ${JSON.stringify(r.toJSON())?.slice(0, 300)}`);
  await act(async () => { mockDoor!.onComplete('quiet'); });
  await act(async () => { mockDoor!.onGone!(); jest.runOnlyPendingTimers(); });
  expect(mockPush).not.toHaveBeenCalledWith('/log-modal');
  await act(async () => { r.unmount(); });
});
