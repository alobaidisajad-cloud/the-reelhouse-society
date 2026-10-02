/**
 * theWelcomeIsNotLostInTheBreath.test.tsx — a new member sees the welcome,
 * however their user arrives.
 *
 * The decision burned the once-only flag and then waited 600ms; the wait was
 * the effect's cleanup, so the profile replacing the sign-in's user inside it
 * (the same created_at, written differently) cancelled the welcome after the
 * flag was spent. And a user that arrived before its created_at was decided
 * "no" for the session.
 */
import React from 'react';
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
  storage: {
    getBoolean: (k: string) => mockSeen.get(k),
    set: (k: string, v: boolean) => { mockSeen.set(k, v); },
  },
}));

/** The hook, mounted: what it last said. */
let said: ReturnType<typeof useInitiation> | null = null;
function Probe() { said = useInitiation(); return null; }
const mount = () => { render(<Probe />); return { get visible() { return said!.visible; } }; };

const setUser = (u: U) => act(async () => { mockUser = u; mockListeners.forEach((l) => l()); });
const pass = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
const justNow = () => new Date(Date.now() - 60_000).toISOString();

beforeEach(() => { jest.useFakeTimers(); mockSeen.clear(); mockUser = null; });
afterEach(() => jest.useRealTimers());

it('the profile replacing the sign-in user inside the breath does not cancel it', async () => {
  const r = mount();
  const at = justNow();
  await setUser({ id: 'u1', username: 'vera', created_at: at });                       // the sign-in's user
  await pass(200);
  await setUser({ id: 'u1', username: 'vera', created_at: at.replace('Z', '+00:00') }); // the profile's
  await pass(600);
  expect(r.visible).toBe(true);
});

it('a user that arrives before its created_at is asked again when it comes', async () => {
  const r = mount();
  await setUser({ id: 'u1', username: 'vera' });
  await pass(1000);
  expect(r.visible).toBe(false);
  await setUser({ id: 'u1', username: 'vera', created_at: justNow() });
  await pass(600);
  expect(r.visible).toBe(true);
});

it('a sign-out inside the breath shows nothing', async () => {
  const r = mount();
  await setUser({ id: 'u1', username: 'vera', created_at: justNow() });
  await setUser(null);
  await pass(600);
  expect(r.visible).toBe(false);
});

it('still once: an account already welcomed is not welcomed again', async () => {
  mockSeen.set('reelhouse_initiation_u1', true);
  const r = mount();
  await setUser({ id: 'u1', username: 'vera', created_at: justNow() });
  await pass(600);
  expect(r.visible).toBe(false);
});
