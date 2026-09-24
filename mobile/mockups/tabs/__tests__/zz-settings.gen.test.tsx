/**
 * A GENERATOR, not a test. The real Settings screen, with the
 * password panel open — the only place the sunken "well" step is drawn.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { whenRendering, writeScreen } from '@/mockups/paths';
import { LOCAL_ART } from '../../../src/components/profile/__tests__/zz-art.gen';


const mockUser = {
  id: 'u1', username: 'kane', email: 'kane@example.com', role: 'archivist', tier: 'archivist',
  created_at: '2024-11-02T00:00:00Z', is_social_private: false, preferences: {},
};
jest.mock('@/src/utils/typedRouter', () => ({ nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@react-navigation/native', () => ({
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
jest.mock('@/src/services/ModerationService', () => ({ ModerationService: { getPendingCount: jest.fn(() => Promise.resolve(0)) } }));
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
    SafeAreaProvider: ({ children }: any) => mockReact.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

// eslint-disable-next-line import/first
import { SettingsScreen } from '@/src/features/settings/SettingsScreen';

whenRendering('settings generator', () => {
  it('writes Settings with the password panel open', async () => {
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<SettingsScreen />); });
    const toggle = r.queryByLabelText('Change password');
    if (toggle) await act(async () => { await fireEvent.press(toggle); });
    else console.log('NO PASSWORD PANEL. On screen:', JSON.stringify(r.toJSON()).replace(/[^A-Za-z &]+/g, ' ').slice(0, 400));
    const html = toHtml(r.toJSON(), { local: LOCAL_ART });
    writeScreen('settings', html);
    console.log('settings:', html.length, 'bytes |', (html.match(/<input|TextInput/g) || []).length, 'fields');
    expect(html.length).toBeGreaterThan(5000);
  });
});
