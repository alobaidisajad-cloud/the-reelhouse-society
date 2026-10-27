/**
 * A rank gained elsewhere is seen (P4.7, P4.17).
 *
 * The member's own row, their rank among it, was read at sign-in and on a few screens' asking;
 * a rank bought on the web, or lapsed, stayed unseen in an app left open for days. Back in the
 * app once that read is older than a read stays fresh, it is read again; a glance away reads
 * nothing.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AppBootstrapper from '../AppBootstrapper';

const mockReread = jest.fn(async () => true);
const mockMember = { user: { id: 'u1', username: 'vesper' }, isAuthenticated: true, rereadProfile: mockReread };
jest.mock('@/src/stores/auth', () => ({
  storage: { getString: () => 'held', set: jest.fn(), delete: jest.fn(), getBoolean: () => false },
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(mockMember), {
    getState: () => mockMember,
    subscribe: () => () => {},
  }),
}));
jest.mock('@/src/lib/pushNotifications', () => ({
  PUSH_TOKEN_KEY: 'push',
  registerForPushNotifications: jest.fn(async () => {}),
  setupNotificationResponseHandler: () => Promise.resolve(() => {}),
}));
jest.mock('@/src/lib/revenueCat', () => ({ initRevenueCat: jest.fn(async () => {}), reconcileRank: jest.fn(async () => {}) }));
jest.mock('@/src/lib/endSession', () => ({ settleOwedSignOut: jest.fn(async () => {}) }));
jest.mock('@/src/stores/notificationStore', () => ({
  useNotificationStore: { getState: () => ({ fetchNotifications: jest.fn(async () => {}), setupRealtime: () => () => {} }) },
}));
jest.mock('@/src/utils/offlineQueue', () => ({ flushOfflineQueue: jest.fn() }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/stores/domain/marksLedger', () => ({ readMarks: jest.fn(async () => {}) }));
jest.mock('@/src/utils/memoryManager', () => ({ __esModule: true, default: { initialize: jest.fn(), cleanup: jest.fn() } }));
jest.mock('expo-updates', () => ({ checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })) }));

let heard: ((next: AppStateStatus) => void)[] = [];
const say = (next: AppStateStatus) => act(async () => { heard.forEach((l) => l(next)); });
const opened = Date.now();

beforeEach(() => {
  heard = [];
  mockReread.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    heard.push(listener as (next: AppStateStatus) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => { jest.restoreAllMocks(); });

it('back in the app once the member’s row is older than a read stays fresh, their rank is read again', async () => {
  await act(async () => { render(<AppBootstrapper><></></AppBootstrapper>); });
  await say('background');
  jest.spyOn(Date, 'now').mockReturnValue(opened + 6 * 60_000);
  await say('active');
  expect(mockReread).toHaveBeenCalledTimes(1);
  // Read just now: the next return, a minute on, reads nothing.
  await say('background');
  jest.spyOn(Date, 'now').mockReturnValue(opened + 7 * 60_000);
  await say('active');
  expect(mockReread).toHaveBeenCalledTimes(1);
});

it('a glance away reads nothing', async () => {
  await act(async () => { render(<AppBootstrapper><></></AppBootstrapper>); });
  await say('background');
  jest.spyOn(Date, 'now').mockReturnValue(opened + 60_000);
  await say('active');
  expect(mockReread).not.toHaveBeenCalled();
});
