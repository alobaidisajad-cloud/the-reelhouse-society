/**
 * theBoardSaysWhenItCouldNotBeRead.test.tsx — the notices, when they could not
 * be read.
 *
 * A failed read was logged and nothing else: with no saved notices the board
 * said "The board is clear. No notices posted to your attention." The store now
 * records the failure (never persisted), and the board says it could not be
 * reached, with TRY AGAIN.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

let mockAnswer: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 };
jest.mock('@/src/lib/supabase', () => {
  const chain: any = {};
  for (const k of ['select', 'eq', 'order', 'limit', 'or']) chain[k] = () => chain;
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(mockAnswer).then(res, rej);
  return { supabase: { from: () => chain, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn() } };
});
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'me', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  (useAuthStore as any).subscribe = () => () => {};
  return { useAuthStore };
});
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/hooks/useFollowRequests', () => ({ refreshFollowRequestCount: jest.fn() }));
// The door's own panel, which is not what is under test.
jest.mock('@/src/components/profile/FollowRequestsPanel', () => () => null);

// eslint-disable-next-line import/first
import { useNotificationStore } from '../notificationStore';
// eslint-disable-next-line import/first
import NotificationsModal from '@/app/(modals)/notifications-modal';

const down = { data: null, error: { message: 'Network request failed' } };

beforeEach(() => {
  useNotificationStore.setState({ notifications: [], fetchFailed: false, loading: false, _fetching: false });
});

describe('the store', () => {
  it('records a board it could not read, and forgets it once the board is read', async () => {
    mockAnswer = down;
    await useNotificationStore.getState().fetchNotifications();
    expect(useNotificationStore.getState().fetchFailed).toBe(true);
    mockAnswer = { data: [], error: null, count: 0 };
    await useNotificationStore.getState().fetchNotifications();
    expect(useNotificationStore.getState().fetchFailed).toBe(false);
  });
});

describe('the board', () => {
  it('a board it could not read is not a clear one — said, and asked again', async () => {
    mockAnswer = down;
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<NotificationsModal />); });
    expect(r.queryByText('The board is clear.')).toBeNull();
    expect(r.getByText('Transmission Interrupted')).toBeTruthy();
    mockAnswer = { data: [], error: null, count: 0 };
    await act(async () => { fireEvent.press(r.getByLabelText('Try again')); });
    expect(r.getByText('The board is clear.')).toBeTruthy();
  });
});
