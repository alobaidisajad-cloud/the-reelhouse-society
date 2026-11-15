/**
 * aRoomBeneathAnotherHearsNothing.test.tsx — a room under another room neither listens nor reads.
 *
 * A notice opens another room over the one on screen (nav.push), and the first stays mounted
 * beneath. Its channel wrote its presence and typists into the new room's header, the new room's
 * leaving took the channel from it, a return to the app read its words into the store over the
 * room in front, and back in front it waited for its own words for good ("retrieving", its sends
 * never shown). And only the sheet's BLOCK purged a member's words: a report that blocked, or a
 * block from another screen, left them drawn under the toast that said they were hidden.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useBlockStore } from '@/src/stores/blockStore';

const ROOM = '00000011-0000-4000-8000-000000000011';
const OTHER = '00000022-0000-4000-8000-000000000022';
const OPEN = { id: ROOM, name: 'The Back Row', description: '', is_private: false, creator_id: '00000099-0000-4000-8000-000000000099', created_at: '2026-01-01T00:00:00Z', member_count: 3 };
const mockHouse = supabaseFake({ rows: { lounges: [OPEN] } });

let mockFocused = true;
const mockLeave = jest.fn();
const mockSubscribe = jest.fn((_id: string, _opts: unknown) => mockLeave);
const mockFetch = jest.fn();
const mockMarkRead = jest.fn();
const mockPurge = jest.fn();

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000011-0000-4000-8000-000000000011', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false, presentCount: 0, typingUsers: [], coversSet: {},
    fetchMessages: (id: string) => mockFetch(id), sendMessage: noop,
    subscribeToLounge: (id: string, opts: unknown) => mockSubscribe(id, opts),
    markRead: (id: string) => mockMarkRead(id), withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => [{ user_id: 'u1', status: 'approved' }],
    broadcastTyping: noop, fetchLounges: noop, loadMoreMessages: noop, purgeHiddenMessages: () => mockPurge(),
  }));
  return { useLoungeStore };
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
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
jest.mock('expo-router/react-navigation', () => ({
  ...require('@/test-utils/navigationMock').navigationMock(),
  useIsFocused: () => mockFocused,
}));
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, open: () => {} }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock; useRouter: jest.Mock };
const { useLoungeStore } = jest.requireMock('@/src/stores/lounge') as { useLoungeStore: { setState: (s: object) => void } };
const settle = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });

let appStateHeard: ((s: string) => void)[] = [];

async function openRoom() {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLocalSearchParams.mockReturnValue({ id: ROOM });
  const r = render(<LoungeRoomScreen />);
  await settle();
  return r;
}
const refocus = async (r: ReturnType<typeof render>, focused: boolean) => {
  mockFocused = focused;
  r.rerender(<LoungeRoomScreen />);
  await settle();
};

beforeEach(() => {
  mockFocused = true;
  [mockSubscribe, mockLeave, mockFetch, mockMarkRead, mockPurge].forEach((m) => m.mockClear());
  useLoungeStore.setState({ currentLoungeId: ROOM });
  appStateHeard = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHeard.push(h);
    return { remove: () => { appStateHeard = appStateHeard.filter((x) => x !== h); } };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

it('leaves its channel when another room is opened over it, and joins again back in front', async () => {
  const r = await openRoom();
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  await refocus(r, false);
  expect(mockLeave).toHaveBeenCalledTimes(1);
  await refocus(r, true);
  expect(mockSubscribe).toHaveBeenCalledTimes(2);
  r.unmount();
});

it('back in front after another room held the store, reads its own words again', async () => {
  const r = await openRoom();
  await refocus(r, false);
  useLoungeStore.setState({ currentLoungeId: OTHER });   // the room opened over it
  mockFetch.mockClear(); mockMarkRead.mockClear();
  await refocus(r, true);
  expect(mockFetch).toHaveBeenCalledWith(ROOM);
  expect(mockMarkRead).toHaveBeenCalledWith(ROOM);
  r.unmount();
});

it('back in front with its own words still held, reads nothing again', async () => {
  const r = await openRoom();
  await refocus(r, false);
  mockFetch.mockClear();
  await refocus(r, true);
  expect(mockFetch).not.toHaveBeenCalled();
  r.unmount();
});

it('a return to the app is read by the room in front alone', async () => {
  const r = await openRoom();
  await refocus(r, false);
  mockFetch.mockClear();
  await act(async () => { appStateHeard.forEach((h) => h('active')); });
  expect(mockFetch).not.toHaveBeenCalled();
  await refocus(r, true);
  mockFetch.mockClear();
  await act(async () => { appStateHeard.forEach((h) => h('active')); });
  expect(mockFetch).toHaveBeenCalledWith(ROOM);
  r.unmount();
});

it('a member blocked from anywhere leaves the room at once', async () => {
  const r = await openRoom();
  mockPurge.mockClear();
  await act(async () => { useBlockStore.setState({ _blockedIndex: new Set(['someone']) } as never); });
  expect(mockPurge).toHaveBeenCalled();
  r.unmount();
});
