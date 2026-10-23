/**
 * theSignOutNamesWhatItErases.test.tsx — the member's own sign-out erases what
 * this phone holds for them, so it never does so in silence.
 *
 * Online, the queue is sent before the session ends. What is left (changes not
 * yet sent, drafts, failed writes holding their words) is named in the confirm,
 * with the count of each, and the member may stay signed in. Driven through the
 * real queue and the real drafts; only the network and the auth store stand in.
 */
import React, { act } from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { SettingsScreen } from '../SettingsScreen';
import { enqueueMutation, getOfflineQueue } from '@/src/utils/offlineQueue';
import { writeDraft } from '@/src/utils/memberDrafts';
import { supabase } from '@/src/lib/supabase';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const mockUser = {
  id: MEMBER, username: 'ana', email: 'member@example.com',
  created_at: '2026-03-04T00:00:00Z', is_social_private: false, preferences: {},
};

/** What happened, in order: each write sent, and the sign-out. */
const mockEvents: string[] = [];
const mockLogout = jest.fn(() => { mockEvents.push('logout'); return Promise.resolve(); });
const mockAlert = jest.fn();

const mockDisk = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockDisk.get(k),
    set: (k: string, v: string) => { mockDisk.set(k, String(v)); },
    delete: (k: string) => { mockDisk.delete(k); },
    getAllKeys: () => [...mockDisk.keys()],
    clearAll: () => mockDisk.clear(),
  },
  isStorageEncrypted: () => true,
  setSensitive: (k: string, v: string) => { mockDisk.set(k, v); },
}));
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => {
    const state = { user: mockUser, logout: mockLogout, setPreference: jest.fn(() => Promise.resolve()) };
    return sel ? sel(state) : state;
  };
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({ user: mockUser });
  return { useAuthStore };
});
jest.mock('@/src/utils/mutationExecutor', () => ({
  executeMutation: (m: { type: string }) => { mockEvents.push(`sent ${m.type}`); return Promise.resolve({}); },
  applyIdMapToPayload: (p: Record<string, unknown>) => p,
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@react-navigation/native', () => ({ ...require('@/test-utils/navigationMock').navigationMock(),
  usePreventRemove: jest.fn(),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/src/stores/settings', () => {
  const useSettingsStore = (sel?: (s: unknown) => unknown) => {
    const state = { tactileAudioEnabled: true, setTactileAudioEnabled: jest.fn() };
    return sel ? sel(state) : state;
  };
  (useSettingsStore as unknown as { getState: () => unknown }).getState = () => ({ tactileAudioEnabled: true });
  return { useSettingsStore };
});
jest.mock('@/src/hooks/useUpdateUser', () => ({ useUpdateUser: () => ({ mutateAsync: jest.fn(() => Promise.resolve()), isPending: false }) }));
jest.mock('@/src/services/ModerationService', () => ({ ModerationService: { getPendingCount: jest.fn(() => Promise.resolve(0)) } }));
jest.mock('@/src/lib/pushNotifications', () => ({
  getPushPermissionState: jest.fn(() => Promise.resolve('granted')),
  requestPushPermission: jest.fn(() => Promise.resolve('granted')),
  registerForPushNotifications: jest.fn(async () => null),
}));
jest.mock('@/src/features/settings/DataVault', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: () => React.createElement(Text, null, '[DataVault]') };
});
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(false)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(false)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
}));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (p: Record<string, unknown>) => React.createElement('Icon', p) });
});
jest.mock('react-native/Libraries/Alert/Alert', () => {
  const Alert = { alert: (...a: unknown[]) => mockAlert(...a) };
  return { __esModule: true, default: Alert, ...Alert };
});
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.4.2', extra: {} } } }));

type Button = { text: string; style?: string; onPress?: () => unknown };

const online = (on: boolean) => {
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: on, isInternetReachable: on });
};

/** Presses SIGN OUT on the settings screen and returns the confirm it raised. */
async function askToSignOut(): Promise<{ title: string; message: string; buttons: Button[] }> {
  const r = render(<SettingsScreen />);
  await act(async () => {});
  await waitFor(() => expect(r.getAllByText('Settings').length).toBeGreaterThan(0));
  mockAlert.mockClear();
  await act(async () => { await fireEvent.press(r.getByLabelText('SIGN OUT')); });
  const last = mockAlert.mock.calls.find((c) => c[0] === 'Depart the Society');
  expect(last).toBeDefined();
  const [title, message, buttons] = last as [string, string, Button[]];
  return { title, message, buttons };
}

const twoQueued = () => {
  enqueueMutation({ type: 'add_critique', payload: { _tempId: 'c1', post_id: 'p1', user_id: MEMBER, body: 'Two reels in.' } });
  enqueueMutation({ type: 'add_watchlist', payload: { user_id: MEMBER, film_id: 550 } });
};

beforeEach(() => {
  mockDisk.clear();
  mockEvents.length = 0;
  mockLogout.mockClear();
  // The member's own session, which the queue is sent under.
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: MEMBER } } }, error: null });
});

describe('the member\'s own sign-out names what it erases', () => {
  it('offline, with two queued writes: names 2 changes, and staying keeps both', async () => {
    online(false);
    twoQueued();

    const { message, buttons } = await askToSignOut();
    expect(message).toBe('Your membership will remain. This phone still holds, for you: '
      + '2 changes not yet sent. Signing out erases all of them.');

    const stay = buttons.find((b) => b.text === 'STAY SIGNED IN');
    expect(stay?.style).toBe('cancel');
    await act(async () => { await stay?.onPress?.(); });
    expect(mockLogout).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toHaveLength(2);
    expect(mockEvents).toEqual([]);
  });

  it('also names the drafts and the failed writes holding their words', async () => {
    online(false);
    twoQueued();
    expect(writeDraft(MEMBER, 'dossier', { title: 'On Ozu' })).toBe(true);
    expect(writeDraft(MEMBER, 'critique', { body: 'Half a thought.' }, 'post-2')).toBe(true);
    mockDisk.set('reelhouse-offline-mutations_dead_letter', JSON.stringify([
      { id: 'd1', type: 'add_critique', timestamp: Date.now(), owner: MEMBER,
        payload: { body: 'Refused.', _failReason: 'schema' } },
      // Not words, and not hers: neither is counted.
      { id: 'd2', type: 'certify_filing', timestamp: Date.now(), owner: MEMBER, payload: {} },
      { id: 'd3', type: 'add_critique', timestamp: Date.now(), owner: 'someone-else', payload: {} },
    ]));

    const { message } = await askToSignOut();
    expect(message).toBe('Your membership will remain. This phone still holds, for you: '
      + '2 changes not yet sent, 2 drafts and 1 piece of writing that could not be sent. '
      + 'Signing out erases all of them.');
  });

  it('online, both are sent before the sign-out', async () => {
    online(true);
    twoQueued();

    const { message, buttons } = await askToSignOut();
    expect(mockEvents).toEqual(['sent add_critique', 'sent add_watchlist']);
    expect(getOfflineQueue()).toHaveLength(0);
    // Nothing left to name.
    expect(message).toBe('Your membership will remain. You may return at any time.');

    await act(async () => { await buttons.find((b) => b.text === 'SIGN OUT')?.onPress?.(); });
    expect(mockEvents).toEqual(['sent add_critique', 'sent add_watchlist', 'logout']);
  });
});
