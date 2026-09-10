/**
 * theDoorIsShown.test.tsx — the rule was real, enforced, and invisible.
 * ─────────────────────────────────────────────────────────────────────────────
 * `posts_door` is a RESTRICTIVE INSERT policy on dispatch_posts and it has been
 * enforced from the day it was written: two days a member, five distinct films
 * logged. Nothing in the app referenced it. A new member opened the writing
 * room, chose a form, wrote a take — or a two-thousand word essay — pressed
 * FILE, and got `Transmission failed`. No reason, no number, no way to find
 * out. The likeliest next thing they did was write it again.
 *
 * These tests pin the four things that make the fix a door rather than a wall:
 *
 *   IT IS CHECKED ABOVE EVERY DESK, not inside one. A member who cannot file
 *   must never reach a desk to find out at the end — the same law the AUTEURS
 *   gate already follows.
 *
 *   IT FAILS OPEN. If the read fails, the member is let through to the refusal
 *   the server was always going to give. Failing closed would lock members out
 *   of their own app because a query timed out.
 *
 *   IT ASKS THE SERVER FOR THE VERDICT. The gate counts DISTINCT film_id, which
 *   `profiles.total_logs` is not — five logs of one film is one film.
 *
 *   IT OFFERS THE ONE ACT THAT MOVES THE COUNT. A door whose button only
 *   dismissed it would be a button that changed nothing.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import ComposeScreen from '@/app/dispatch/compose';

let mockUser: Record<string, unknown> | null = {
  id: 'u1', username: 'me', tier: 'free', created_at: '2026-09-09T00:00:00Z',
};
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) =>
      (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));

const mockReplaced: string[] = [];
const mockPushed: string[] = [];
const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
    replace: (h: string) => { mockReplaced.push(h); },
    push: (h: string) => { mockPushed.push(h); },
    setParams: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));

let mockStanding: Record<string, unknown> | null = null;
let mockRpcError: { message: string } | null = null;
const mockRpcNames: string[] = [];
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self(); chain.eq = () => self(); chain.is = () => self();
      chain.order = () => self(); chain.in = () => Promise.resolve({ data: [], error: null });
      chain.limit = () => Promise.resolve({ data: [], error: null });
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then = (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r);
      return chain;
    },
    rpc: (name: string) => {
      mockRpcNames.push(name);
      return Promise.resolve({
        data: mockStanding ? [mockStanding] : null,
        error: mockRpcError,
      });
    },
  },
}));
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: { getString: () => undefined, set: jest.fn(), delete: jest.fn(), getBoolean: () => false },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));

const mount = async () => {
  const r = render(<ComposeScreen />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};

beforeEach(() => {
  mockUser = { id: 'u1', username: 'me', tier: 'free', created_at: '2026-09-09T00:00:00Z' };
  mockParams = {};
  mockStanding = null;
  mockRpcError = null;
  mockRpcNames.length = 0;
  mockReplaced.length = 0;
  mockPushed.length = 0;
  mockBack.mockClear();
});

describe('the door', () => {
  it('says what remains, in numbers, instead of refusing at the end', async () => {
    mockStanding = { films: 3, films_needed: 5, days: 1, days_needed: 2, may_file: false };
    const { getByText } = await mount();

    expect(getByText('The door opens shortly.')).toBeTruthy();
    expect(getByText('FILMS LOGGED')).toBeTruthy();
    expect(getByText('3 OF 5')).toBeTruthy();
    expect(getByText('DAYS A MEMBER')).toBeTruthy();
    expect(getByText('1 OF 2')).toBeTruthy();
    // And it says the thing that stops this reading as a punishment.
    expect(getByText('NOTHING IS HIDDEN FROM YOU MEANWHILE')).toBeTruthy();
  });

  it('asks the server for the verdict rather than counting on the device', async () => {
    mockStanding = { films: 3, films_needed: 5, days: 1, days_needed: 2, may_file: false };
    await mount();
    // `total_logs` is a different number — five logs of one film is one film —
    // and the gate counts DISTINCT film_id, which PostgREST cannot express.
    //
    // `dispatch_door` and not a new function beside it: this one has been live
    // on the database, and in the repo's own schema dump, the whole time, and a
    // migration to create a second one had already been written before anybody
    // looked for it.
    expect(mockRpcNames).toContain('dispatch_door');
  });

  it('caps the films at what is needed', async () => {
    // `5 OF 5` for a member who has logged twelve and is waiting on the second
    // day. The bar is met, and the line is about the bar; `12 OF 5` reads as an
    // error. The server function keeps saying the true count.
    mockStanding = { films: 12, films_needed: 5, days: 1, days_needed: 2, may_file: false };
    const { getByText, queryByText } = await mount();
    expect(getByText('5 OF 5')).toBeTruthy();
    expect(queryByText('12 OF 5')).toBeNull();
  });

  it('stands above every desk, not inside one', async () => {
    // Reached straight at a desk by a link or a stale param. The door still
    // answers first: a member who cannot file must never reach a desk to find
    // out at the end.
    mockStanding = { films: 0, films_needed: 5, days: 0, days_needed: 2, may_file: false };
    for (const kind of ['take', 'seeking', 'wire', 'ballot', 'dossier']) {
      mockParams = { kind };
      const { getByText } = await mount();
      expect(`${kind}: ${!!getByText('The door opens shortly.')}`).toMatch(/true$/);
    }
  });

  it('offers the one act that moves the count', async () => {
    mockStanding = { films: 3, films_needed: 5, days: 1, days_needed: 2, may_file: false };
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Go and log a film')); });
    // REPLACE, not push: a member who logs a film and presses back should land
    // on the paper, not on the door they have just been let through.
    expect(mockReplaced).toEqual(['/log-modal']);
    expect(mockPushed).toEqual([]);
  });

  it('lets a member who may file straight through', async () => {
    mockStanding = { films: 12, films_needed: 5, days: 40, days_needed: 2, may_file: true };
    const { getByText, queryByText } = await mount();
    expect(queryByText('The door opens shortly.')).toBeNull();
    expect(getByText('WHAT ARE YOU FILING?')).toBeTruthy();
  });

  it('fails OPEN when it cannot find out', async () => {
    // No signal, or a build running ahead of the migration. The server is the
    // gate; this screen is only the explanation. Locking a member out of their
    // own app because a read timed out is the worse error by far.
    mockRpcError = { message: 'network' };
    const { getByText, queryByText } = await mount();
    expect(queryByText('The door opens shortly.')).toBeNull();
    expect(getByText('WHAT ARE YOU FILING?')).toBeTruthy();
  });

  it('draws nothing while it is still asking', async () => {
    // A door that flashes up for one frame and vanishes is worse than a beat of
    // nothing: it tells a member they are locked out and then takes it back.
    mockStanding = { films: 12, films_needed: 5, days: 40, days_needed: 2, may_file: true };
    const r = render(<ComposeScreen />);
    expect(r.queryByText('The door opens shortly.')).toBeNull();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  });

  it('has a way back out', async () => {
    mockStanding = { films: 0, films_needed: 5, days: 0, days_needed: 2, may_file: false };
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Back')); });
    expect(mockBack).toHaveBeenCalled();
  });
});
