/**
 * theRoomSaysWhenItCouldNotBeReached.test.tsx — a salon opened with no signal.
 *
 * Any failure to read the room said "Signal Lost — this screening room has
 * been incinerated or never existed." of a room that is there, and its button
 * said RETURN TO THE LOBBY while calling router.back(): nothing at all when the
 * room was opened from a notice. Now a room it could not ask for says so, with
 * TRY AGAIN; a room that is not there says that; and the way out says where it
 * goes, and goes there.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { create } from 'zustand';

import LoungeRoomScreen from '@/app/lounge/[id]';

const ROOM = {
  id: 'room', name: 'The Back Row', description: '', is_private: false,
  creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
let mockRoomAnswer: { data: unknown; error: unknown } = { data: ROOM, error: null };

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], loading: false, sending: false,
    presentCount: 0, typingUsers: [],
    fetchMessages: noop, sendMessage: noop, subscribeToLounge: () => noop, markRead: noop,
    withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => [{ user_id: 'u1', status: 'approved' }],
    broadcastTyping: noop, fetchLounges: noop, loadMoreMessages: noop, purgeHiddenMessages: noop,
  }));
  return { useLoungeStore };
});
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self; chain.eq = self;
      chain.maybeSingle = () => Promise.resolve(mockRoomAnswer);
      return chain;
    },
  },
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'u1', username: 'me' } };
  return {
    useAuthStore: Object.assign(
      (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useIsFocused: () => true }));
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, open: () => {} }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const { useLoungeStore } = jest.requireMock('@/src/stores/lounge') as {
  useLoungeStore: ReturnType<typeof create> & { setState: (s: object) => void };
};
const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as {
  useLocalSearchParams: jest.Mock; useRouter: jest.Mock;
};
const { nav } = jest.requireMock('@/src/utils/typedRouter') as { nav: Record<string, jest.Mock> };
const ROUTER = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };

async function openRoom() {
  useRouter.mockReturnValue(ROUTER);
  useLocalSearchParams.mockReturnValue({ id: 'room' });
  useLoungeStore.setState({ currentMessages: [], lounges: [] });
  const r = render(<LoungeRoomScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return r;
}

beforeEach(() => {
  mockRoomAnswer = { data: ROOM, error: null };
  jest.clearAllMocks();
  nav.canGoBack.mockReturnValue(false);
});

it('a room it could not ask for is not "incinerated" — said, and asked again', async () => {
  mockRoomAnswer = { data: null, error: { message: 'Network request failed' } };
  const r = await openRoom();
  expect(r.queryByText('Signal Lost')).toBeNull();
  expect(r.getByText('Transmission Interrupted')).toBeTruthy();
  mockRoomAnswer = { data: ROOM, error: null };
  await act(async () => { fireEvent.press(r.getByLabelText('Try again')); await new Promise((res) => setTimeout(res, 0)); });
  expect(r.queryByText('Transmission Interrupted')).toBeNull();
  expect(r.getAllByText('The Back Row').length).toBeGreaterThan(0);
});

it('a room that is not there says so', async () => {
  mockRoomAnswer = { data: null, error: null };
  const r = await openRoom();
  expect(r.getByText('Signal Lost')).toBeTruthy();
});

it('opened from a notice, the way out says the Lobby and goes there — never a dead button', async () => {
  mockRoomAnswer = { data: null, error: null };
  const r = await openRoom();
  await act(async () => { fireEvent.press(r.getByLabelText('RETURN TO THE LOBBY')); });
  expect(nav.back).toHaveBeenCalledTimes(1);          // the house's back: the Lobby when there is none
  expect(ROUTER.back).not.toHaveBeenCalled();
});

it('with somewhere to go back to, it says GO BACK', async () => {
  nav.canGoBack.mockReturnValue(true);
  mockRoomAnswer = { data: null, error: null };
  const r = await openRoom();
  expect(r.getByLabelText('GO BACK')).toBeTruthy();
});
