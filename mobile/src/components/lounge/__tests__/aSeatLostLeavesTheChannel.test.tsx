/**
 * The room joins its live channel only as the salon's rules allow, and joins
 * again when the member's standing changes, without leaving the room.
 * ─────────────────────────────────────────────────────────────────────────────
 * A private salon's channel is received only by its seated members, so a member
 * whose seat is lost (removed, banned, gone) leaves it at once and stops sharing
 * presence; a member reading an open salon without a seat joins it unseen; and a
 * member waiting at a private door has no channel to hear the door open on, so
 * the notice of their admission makes the room ask again, and join.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { useNotificationStore } from '@/src/stores/notificationStore';

const PRIVATE = { id: 'room', name: 'The Back Row', description: '', is_private: true, creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 3 };
let mockRoom: Record<string, unknown> = PRIVATE;
let mockRoster: { user_id: string; status: string }[] = [];
const mockLeave = jest.fn();
const mockSubscribe = jest.fn((_id: string, _opts: { seated?: boolean; onMembership?: () => void }) => mockLeave);

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: 'room', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false, presentCount: 0, typingUsers: [],
    fetchMessages: noop, sendMessage: noop,
    subscribeToLounge: (id: string, opts: { seated?: boolean; onMembership?: () => void }) => mockSubscribe(id, opts),
    markRead: noop, withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => mockRoster,
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
      chain.maybeSingle = () => Promise.resolve({ data: mockRoom, error: null });
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
jest.mock('@/src/utils/typedRouter', () => ({ nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) } }));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useIsFocused: () => true }));
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, open: () => {} }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock; useRouter: jest.Mock };
const settle = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });

async function openRoom() {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLocalSearchParams.mockReturnValue({ id: 'room' });
  const r = render(<LoungeRoomScreen />);
  await settle();
  return r;
}

beforeEach(() => {
  mockSubscribe.mockClear();
  mockLeave.mockClear();
  mockRoom = PRIVATE;
  useNotificationStore.setState({ noticesHeard: 0 });
});

it('a seated member of a private salon joins its channel seated, and leaves it the moment the seat is lost', async () => {
  mockRoster = [{ user_id: 'u1', status: 'approved' }];
  const r = await openRoom();
  expect(mockSubscribe.mock.calls.map(([id, o]) => [id, o.seated])).toEqual([['room', true]]);
  // The seat is taken away; the channel says the roster changed.
  mockRoster = [];
  await act(async () => { mockSubscribe.mock.calls[0][1].onMembership?.(); await new Promise((res) => setTimeout(res, 0)); });
  expect(mockLeave).toHaveBeenCalledTimes(1);
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  r.unmount();
});

it('a member reading an open salon without a seat joins it, sharing no presence', async () => {
  mockRoom = { ...PRIVATE, is_private: false };
  mockRoster = [];
  const r = await openRoom();
  expect(mockSubscribe.mock.calls.map(([, o]) => o.seated)).toEqual([false]);
  r.unmount();
});

it('a member waiting at a private door joins nothing, then joins seated when the notice of admission arrives', async () => {
  mockRoster = [{ user_id: 'u1', status: 'pending' }];
  const r = await openRoom();
  expect(mockSubscribe).not.toHaveBeenCalled();
  mockRoster = [{ user_id: 'u1', status: 'approved' }];
  await act(async () => { useNotificationStore.setState({ noticesHeard: 1 }); await new Promise((res) => setTimeout(res, 0)); });
  await settle();
  expect(mockSubscribe.mock.calls.map(([id, o]) => [id, o.seated])).toEqual([['room', true]]);
  r.unmount();
});
