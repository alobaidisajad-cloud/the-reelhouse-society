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

const PRIVATE = { id: '00000011-0000-4000-8000-000000000011', name: 'The Back Row', description: '', is_private: true, creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 3 };
let mockRoom: Record<string, unknown> = PRIVATE;
let mockRoster: { user_id: string; status: string }[] = [];
const mockLeave = jest.fn();
const mockSubscribe = jest.fn((_id: string, _opts: { seated?: boolean; onMembership?: () => void }) => mockLeave);

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000011-0000-4000-8000-000000000011', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false, presentCount: 0, typingUsers: [], coversSet: {},
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
jest.mock('expo-router/react-navigation', () => ({ ...jest.requireActual('expo-router/react-navigation'), useIsFocused: () => true }));
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, open: () => {} }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock; useRouter: jest.Mock };
const settle = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });

async function openRoom() {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLocalSearchParams.mockReturnValue({ id: '00000011-0000-4000-8000-000000000011' });
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
  expect(mockSubscribe.mock.calls.map(([id, o]) => [id, o.seated])).toEqual([['00000011-0000-4000-8000-000000000011', true]]);
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
  expect(mockSubscribe.mock.calls.map(([id, o]) => [id, o.seated])).toEqual([['00000011-0000-4000-8000-000000000011', true]]);
  r.unmount();
});

/**
 * Review round 10: a muted seat in a private salon reads its words (the house lets it, as its MUTE
 * says), and the room never joined the channel for it, so nothing new reached it while it read.
 * It listens now as it reads, sharing no presence; a door asked at, or no seat, still hears nothing.
 */
describe('a muted seat in a private salon (review round 10)', () => {
  it('hears the salon as it reads it, joining its channel without a presence; with no seat, nothing is heard', async () => {
    mockRoster = [{ user_id: 'u1', status: 'muted' }];
    const muted = await openRoom();
    expect(mockSubscribe.mock.calls.map(([id, o]) => [id, o.seated])).toEqual([['00000011-0000-4000-8000-000000000011', false]]);
    muted.unmount();
    // The same salon for one with no seat and no request: its channel is the seated's.
    mockSubscribe.mockClear();
    mockRoster = [];
    const none = await openRoom();
    expect(mockSubscribe).not.toHaveBeenCalled();
    none.unmount();
  });

  it('keeps hearing it when the mute is lifted, now seated, and leaves it when the seat is lost', async () => {
    mockRoster = [{ user_id: 'u1', status: 'muted' }];
    const r = await openRoom();
    const first = mockSubscribe.mock.calls[0];
    expect(first).toBeDefined();
    mockRoster = [{ user_id: 'u1', status: 'approved' }];
    await act(async () => { first![1].onMembership?.(); await new Promise((res) => setTimeout(res, 0)); });
    expect(mockSubscribe.mock.calls.map(([, o]) => o.seated)).toEqual([false, true]);
    const second = mockSubscribe.mock.calls[1];
    expect(second).toBeDefined();
    mockRoster = [];
    await act(async () => { second![1].onMembership?.(); await new Promise((res) => setTimeout(res, 0)); });
    expect(mockLeave).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    r.unmount();
  });
});
