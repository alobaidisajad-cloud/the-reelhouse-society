/**
 * theWelcomeWaitsForTheLobby.test.tsx — review round 11 (useInitiation)
 * ─────────────────────────────────────────────────────────────────────────────
 * A new member who confirmed their address from a link opened over the sign-in sheet was signed in
 * while that sheet was still presented. The Initiation burned its once-only flag at once and, 600 ms
 * later, asked to be shown over the sheet: on an iPhone a Modal over a presented sheet is refused
 * (or goes with the sheet), and the once-ever welcome was spent unseen. Now it is decided only while
 * the Lobby is in front, and the flag burns when the welcome is truly on screen (the Modal's onShow).
 */
import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react-native';
import { useInitiation } from '../useInitiation';

type U = { id: string; username: string; created_at?: string; member_no?: number | null } | null;
let mockUser: U = null;
const mockListeners = new Set<() => void>();
jest.mock('@/src/stores/auth', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  const useAuthStore = (sel: (s: { user: unknown }) => unknown) =>
    useSyncExternalStore(
      (l: () => void) => { mockListeners.add(l); return () => mockListeners.delete(l); },
      () => sel({ user: mockUser }),
    );
  useAuthStore.getState = () => ({ user: mockUser });
  return { useAuthStore };
});
const mockSeen = new Map<string, boolean>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storage: {
    getBoolean: (k: string) => mockSeen.get(k),
    set: (k: string, v: boolean) => { mockSeen.set(k, v); },
  },
}));

/** The hook as the tabs hold it, told whether the Lobby is in front: what it last said. */
let said: ReturnType<typeof useInitiation> | null = null;
function Probe({ inFront }: { inFront: boolean }) { const now = useInitiation(inFront); useEffect(() => { said = now; }); return null; }
const mount = (inFront: boolean) => {
  const r = render(<Probe inFront={inFront} />);
  return {
    get visible() { return said!.visible; },
    front: (next: boolean) => act(async () => { r.rerender(<Probe inFront={next} />); }),
    shown: () => act(async () => { said!.shown(); }),
    unmount: () => r.unmount(),
  };
};

const setUser = (u: U) => act(async () => { mockUser = u; mockListeners.forEach((l) => l()); });
const pass = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
const justNow = () => new Date(Date.now() - 60_000).toISOString();
const FLAG = 'reelhouse_initiation_u1';

beforeEach(() => { jest.useFakeTimers(); mockSeen.clear(); mockUser = null; said = null; });
afterEach(() => jest.useRealTimers());

it('signed in under the sign-in sheet: nothing is shown or spent until the sheet has gone', async () => {
  const r = await mount(false);
  await setUser({ id: 'u1', username: 'vera', created_at: justNow() });
  await pass(5000);
  expect(r.visible).toBe(false);
  expect(mockSeen.get(FLAG)).toBeUndefined();
  // The sheet goes: the Lobby is in front, and the welcome comes after its breath.
  await r.front(true);
  await pass(600);
  expect(r.visible).toBe(true);
  // Still not spent until the phone has truly shown it.
  expect(mockSeen.get(FLAG)).toBeUndefined();
  await r.shown();
  expect(mockSeen.get(FLAG)).toBe(true);
  await r.unmount();
});

it('a sheet raised inside the breath holds the welcome, and it comes when the Lobby returns', async () => {
  const r = await mount(true);
  await setUser({ id: 'u1', username: 'vera', created_at: justNow() });
  await pass(300);
  await r.front(false);
  await pass(2000);
  expect(r.visible).toBe(false);
  expect(mockSeen.get(FLAG)).toBeUndefined();
  await r.front(true);
  await pass(600);
  expect(r.visible).toBe(true);
  await r.unmount();
});

it('a welcome the phone never showed is not spent: the next launch shows it', async () => {
  const first = await mount(true);
  await setUser({ id: 'u1', username: 'vera', created_at: justNow() });
  await pass(600);
  expect(first.visible).toBe(true);
  // The phone refused to present it (no onShow), and the app was closed.
  await first.unmount();
  expect(mockSeen.get(FLAG)).toBeUndefined();
  const again = await mount(true);
  await pass(600);
  expect(again.visible).toBe(true);
  await again.unmount();
});

it('shown once, never again', async () => {
  const first = await mount(true);
  await setUser({ id: 'u1', username: 'vera', created_at: justNow() });
  await pass(600);
  await first.shown();
  await first.unmount();
  const again = await mount(true);
  await pass(600);
  expect(again.visible).toBe(false);
  await again.unmount();
});
