/**
 * A GENERATOR, not a test. The real Settings screen, with the
 * password panel open — the only place the sunken "well" step is drawn —
 * and with the member's record that could not be read.
 */
import React, { act } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '../../../src/components/profile/__tests__/zz-art.gen';


const mockUser = {
  id: 'u1', username: 'kane', email: 'kane@example.com', role: 'archivist', tier: 'archivist',
  created_at: '2024-11-02T00:00:00Z', is_social_private: false, preferences: {},
};
jest.mock('@/src/utils/typedRouter', () => ({ nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-router/react-navigation', () => ({
  ...require('@/test-utils/navigationMock').navigationMock(),
  usePreventRemove: () => {}, useNavigation: () => ({ dispatch: jest.fn() }), useIsFocused: () => true,
}));
// The state is built on each CALL: jest.mock is hoisted above `const mockUser`,
// so a state object built inside the factory captures `undefined` and the screen
// renders nothing (`if (!user) return null`).
jest.mock('@/src/stores/auth', () => {
  const build = () => ({ user: mockUser, isAuthenticated: true, logout: jest.fn(), setPreference: jest.fn(() => Promise.resolve()) });
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(build()) : build());
  (useAuthStore as any).getState = () => build();
  return { useAuthStore };
});
jest.mock('@/src/stores/settings', () => {
  const state = { tactileAudioEnabled: true, setTactileAudioEnabled: jest.fn() };
  const useSettingsStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useSettingsStore as any).getState = () => state;
  return { useSettingsStore };
});
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: { clearAll: jest.fn(), set: jest.fn(), getString: jest.fn(), delete: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }),
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/src/services/AuthService', () => ({ AuthService: { requestAccountDeletion: jest.fn(), updatePassword: jest.fn() } }));
jest.mock('@/src/hooks/useUpdateUser', () => ({ useUpdateUser: () => ({ mutateAsync: jest.fn(() => Promise.resolve()), isPending: false }) }));
// The member's record with the house as one reads it: a pause served and upheld on appeal, and a
// warning standing as given. Each state below sets what the read answers.
const mockMyVerdicts = jest.fn();
const RECORD = [
  { id: 'v-2', action: 'suspend', reason: 'Words aimed at a member in a salon, against the house rules.',
    created_at: new Date(2026, 8, 12, 12).toISOString(), duration_hours: 72, expires_at: new Date(2026, 8, 15, 12).toISOString(),
    lifted_at: null, appeal_status: 'upheld', content_type: 'lounge_message' },
  { id: 'v-1', action: 'warn', reason: 'A spoiler of the ending, written without its mark.',
    created_at: new Date(2026, 5, 3, 12).toISOString(), duration_hours: null, expires_at: null,
    lifted_at: null, appeal_status: null, content_type: 'log' },
];
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: { getPendingCount: jest.fn(() => Promise.resolve(0)), getMyVerdicts: (...a: unknown[]) => mockMyVerdicts(...a) },
}));
jest.mock('@/src/lib/pushNotifications', () => ({
  getPushPermissionState: jest.fn(() => Promise.resolve('granted')), requestPushPermission: jest.fn(),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.4.2', extra: {} } } }));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children, style }: any) => mockReact.createElement(View, { style: [{ flex: 1 }, style] }, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, ...require('@/mockups/paths').PHONE }),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: 1 }),
}));

// eslint-disable-next-line import/first
import { SettingsScreen } from '@/src/features/settings/SettingsScreen';

whenRendering('settings generator', () => {
  beforeEach(() => mockMyVerdicts.mockResolvedValue(RECORD));

  it('writes Settings with the password panel open', async () => {
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<SettingsScreen />); });
    await waitFor(() => expect(r.getByText('MEMBERSHIP PAUSED · 72 HOURS')).toBeTruthy());
    // Found or the run fails: this plate is the only drawing of the panel's well,
    // and a plate written without it would pass as if it held it.
    const toggle = r.getByLabelText('Change password');
    await act(async () => { await fireEvent.press(toggle); });
    const html = toHtml(r.toJSON(), { local: LOCAL_ART });
    writeScreen('settings', html);
    console.log('settings:', html.length, 'bytes |', (html.match(/<input|TextInput/g) || []).length, 'fields');
    expect(html.length).toBeGreaterThan(5000);
  });

  // The record that could not be read, its TRY AGAIN measured in the card that clips it.
  it('writes Settings with the record unread', async () => {
    mockMyVerdicts.mockRejectedValue(new Error('network'));
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<SettingsScreen />); });
    await waitFor(() => expect(r.getByText('Your record could not be read.')).toBeTruthy(), { timeout: 10_000 });
    expect(r.getByRole('button', { name: 'Try again: read your record with the house' })).toBeTruthy();
    writeScreen('settings-record-unread', toHtml(r.toJSON(), { local: LOCAL_ART }));
  });
});
