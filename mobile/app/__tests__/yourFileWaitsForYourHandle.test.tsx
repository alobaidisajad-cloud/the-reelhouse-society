/**
 * yourFileWaitsForYourHandle.test.tsx — the Profile tab never calls you a stranger.
 * ─────────────────────────────────────────────────────────────────────────────
 * Signed in, the house knows who you are a moment before it has read your
 * handle. The Profile tab opened in that moment (or after the read failed) drew
 * your member file for no handle at all, which asked for nobody and said
 * "Member Not Found" about yourself. The sealed E2E's keyboard probe caught it,
 * tapping Profile straight after signing in. Now the handle is read first, and a
 * read that fails says so, with the house's TRY AGAIN.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

let mockUser: Record<string, unknown> | null = null;
const mockRestore = jest.fn();
jest.mock('@/src/stores/auth', () => {
  const state = () => ({ user: mockUser, isAuthenticated: !!mockUser, restoreSession: mockRestore });
  const useAuthStore = Object.assign((sel: (s: unknown) => unknown) => sel(state()), { getState: state });
  return { useAuthStore };
});
jest.mock('../user/[username]', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ usernameOverride }: { usernameOverride?: string }) => <Text>{`MEMBER FILE ${usernameOverride}`}</Text> };
});
jest.mock('@/src/components/layout/FrozenTab', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/src/components/atmosphere/RoomLight', () => ({ RoomLight: () => null }));

// eslint-disable-next-line import/first
import ProfileTab from '../(tabs)/profile';

beforeEach(() => { mockRestore.mockReset(); });

it('signed in with the handle still unread, it reads it, and never says "Member Not Found"', async () => {
  mockUser = { id: 'u1' };
  let finish!: () => void;
  mockRestore.mockReturnValue(new Promise<void>((res) => { finish = res; }));
  const r = render(<ProfileTab />);
  expect(r.getByText('RETRIEVING DOSSIER')).toBeTruthy();
  expect(mockRestore).toHaveBeenCalledTimes(1);
  expect(r.queryByText(/MEMBER FILE/)).toBeNull();

  // The read brings the handle: the file opens, for you.
  mockUser = { id: 'u1', username: 'e2e_member' };
  await act(async () => { finish(); });
  r.rerender(<ProfileTab />);
  expect(r.getByText('MEMBER FILE e2e_member')).toBeTruthy();
});

it('a read that fails says the house could not be reached, and TRY AGAIN reads again', async () => {
  mockUser = { id: 'u1' };
  mockRestore.mockResolvedValue(undefined);
  const r = render(<ProfileTab />);
  await act(async () => { await Promise.resolve(); });
  expect(r.getByText('Transmission Interrupted')).toBeTruthy();
  expect(r.queryByText(/MEMBER FILE/)).toBeNull();

  await act(async () => { fireEvent.press(r.getByText(/TRY AGAIN/)); });
  expect(mockRestore).toHaveBeenCalledTimes(2);
});

it('with the handle known, your file opens at once, and nothing is read again', () => {
  mockUser = { id: 'u1', username: 'e2e_member' };
  const r = render(<ProfileTab />);
  expect(r.getByText('MEMBER FILE e2e_member')).toBeTruthy();
  expect(mockRestore).not.toHaveBeenCalled();
});
