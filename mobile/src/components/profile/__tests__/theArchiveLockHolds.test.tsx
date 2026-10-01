/**
 * theArchiveLockHolds.test.tsx — the lock in front of your own Archive.
 *
 * It was drawn OVER the room, with the room still rendered underneath: a
 * screen reader read every film through it. And on a phone with a passcode
 * but no Face ID or Touch ID enrolled it opened without asking anything,
 * though Settings lets such a phone turn it on.
 */
import React, { act } from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import ProfileArchiveTab from '../ProfileArchiveTab';
import { nav } from '@/src/utils/typedRouter';

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', preferences: { biometric_lock: true } } };
  return { useAuthStore: (sel: (s: typeof state) => unknown) => sel(state) };
});
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn() } }));

const LA = LocalAuthentication as unknown as { getEnrolledLevelAsync: jest.Mock; authenticateAsync: jest.Mock };
const logs = [{ id: 'l1', filmId: 1, title: 'Stalker', status: 'watched', watchedDate: '2026-03-01' }] as never[];

const mount = async () => {
  const r = render(
    <ProfileArchiveTab
      logs={logs} archiveFiltered={logs} isSelf archiveSieve="all" setArchiveSieve={jest.fn()}
      renderPosterCard={(log: { title: string }) => <Text>{log.title}</Text>}
      groupByMonth={(items) => ({ 'MARCH 2026': items })}
    />,
  );
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};
const filmShown = (r: Awaited<ReturnType<typeof mount>>) => r.queryAllByText('Stalker', { includeHiddenElements: true }).length > 0;

beforeEach(() => jest.clearAllMocks());

it('while it stands, nothing of the room is there — not even for a screen reader', async () => {
  LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
  LA.authenticateAsync.mockReturnValue(new Promise(() => {}));   // the prompt still up
  const r = await mount();
  expect(r.getByText('RESTRICTED ACCESS')).toBeTruthy();
  expect(filmShown(r)).toBe(false);
});

it('a phone with only a passcode is asked for it, and opens on it', async () => {
  LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
  LA.authenticateAsync.mockResolvedValue({ success: true });
  const r = await mount();
  expect(LA.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false }));
  expect(filmShown(r)).toBe(true);
});

it('a phone with nothing to open it stays shut, says why, and offers the way to turn it off', async () => {
  LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
  const r = await mount();
  expect(LA.authenticateAsync).not.toHaveBeenCalled();
  expect(filmShown(r)).toBe(false);
  expect(r.getByText('This phone has no Face ID, Touch ID or passcode to open it with.')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByLabelText('Turn the lock off in Settings')); });
  expect(nav.push).toHaveBeenCalledWith('/settings');
});

it('an error, or a failed attempt, keeps it shut', async () => {
  LA.getEnrolledLevelAsync.mockRejectedValue(new Error('LAErrorSystemCancel'));
  let r = await mount();
  expect(filmShown(r)).toBe(false);
  expect(r.getByText('Authentication Unavailable')).toBeTruthy();
  r.unmount();
  LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
  LA.authenticateAsync.mockResolvedValue({ success: false, error: 'authentication_failed' });
  r = await mount();
  expect(filmShown(r)).toBe(false);
  expect(r.getByText('Authentication Failed')).toBeTruthy();
});
