/**
 * theRoomIsAskedForOnce.test.tsx — a salon reads its room and its roster once, however often the
 * session settles.
 *
 * The auth store hands a new `user` object at each session restore. The salon keyed its reads on
 * that object, so one opening asked for the room, its roster and the Lounge list three times over
 * (speed lab 39868403930: `lounges` read five times, `lounge_members` five, while the salon took
 * 3 s to be ready). Now they are keyed on who reads, by id: a new object of the same member asks for
 * nothing again, and a different member asks for their own.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { create } from 'zustand';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';

const ROOM_ID = '00000000-0000-4000-b200-000000000001';
const ROOM = {
  id: ROOM_ID, name: 'The Back Row', description: '', is_private: false,
  creator_id: '00000000-0000-4000-a000-0000000000aa', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
const mockAsked: string[] = [];
let mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000000-0000-4000-b200-000000000001', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [],
    fetchMessages: noop, sendMessage: noop, subscribeToLounge: () => noop, markRead: noop,
    withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => { mockAsked.push('roster'); return [{ user_id: 'u1', status: 'approved' }]; },
    broadcastTyping: noop, fetchLounges: () => { mockAsked.push('lounge list'); }, loadMoreMessages: noop, purgeHiddenMessages: noop,
  }));
  return { useLoungeStore };
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  return { useAuthStore: mockCreate(() => ({ user: { id: 'u1', username: 'me' } })) };
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
const { useAuthStore } = jest.requireMock('@/src/stores/auth') as {
  useAuthStore: ReturnType<typeof create> & { setState: (s: object) => void };
};
const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as {
  useLocalSearchParams: jest.Mock; useRouter: jest.Mock;
};
const settle = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });
/** The room's reads (from the house) and the roster's and list's (from the store), as asked. */
const count = (what: string) => (what === 'lounges'
  ? mockHouse.asked.filter((a) => a.table === 'lounges').length
  : mockAsked.filter((x) => x === what).length);

beforeEach(() => {
  mockAsked.length = 0;
  mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLocalSearchParams.mockReturnValue({ id: ROOM_ID });
  useLoungeStore.setState({ currentMessages: [], lounges: [] });
  useAuthStore.setState({ user: { id: 'u1', username: 'me' } });
});

it('asks for the room and its roster once while the session settles, and again for another member', async () => {
  render(<LoungeRoomScreen />);
  await settle();
  expect([count('lounges'), count('roster')]).toEqual([1, 1]);

  // The session settling: the same member, handed over as a new object, twice.
  await act(async () => { useAuthStore.setState({ user: { id: 'u1', username: 'me' } }); });
  await act(async () => { useAuthStore.setState({ user: { id: 'u1', username: 'me', bio: 'restored' } }); });
  await settle();
  expect([count('lounges'), count('roster')]).toEqual([1, 1]);

  // Another member reads the room as themselves.
  await act(async () => { useAuthStore.setState({ user: { id: 'u2', username: 'them' } }); });
  await settle();
  expect(count('roster')).toBe(2);
});
