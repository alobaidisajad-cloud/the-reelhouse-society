/**
 * aSalonsNoticeOpensItsDoor.test.tsx — a salon's notice opens the salon, at its door.
 *
 * "@m is asking to enter The Back Row" opened the asker's file, and "You were admitted to The Back
 * Row" opened only the notices sheet: neither read the salon the notice is about. Now each opens
 * /lounge/<id>?door=1 (noticeRoute), and the salon shows its host who waits at the door, once the
 * roster says someone does, and once. A member opening the same link is shown the room; a host
 * who came another way, the room with the door's count in its header.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { create } from 'zustand';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';

const ROOM_ID = '00000000-0000-4000-b200-000000000001';
const HOST = '00000000-0000-4000-a000-0000000000aa';
const ROOM = {
  id: ROOM_ID, name: 'The Back Row', description: '', is_private: true,
  creator_id: HOST, created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
let mockRoster: { user_id: string; status: string; username?: string }[] = [];
/** The channel's word that the roster changed (subscribeToLounge's onMembership), as the salon gave it. */
let mockOnMembership: (() => void) | null = null;
let mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000000-0000-4000-b200-000000000001', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [],
    fetchMessages: noop, sendMessage: noop, markRead: noop,
    subscribeToLounge: (_id: string, opts: { onMembership?: () => void }) => { mockOnMembership = opts?.onMembership ?? null; return noop; },
    withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => mockRoster,
    broadcastTyping: noop, fetchLounges: noop, loadMoreMessages: noop, purgeHiddenMessages: noop,
  }));
  return { useLoungeStore };
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  return { useAuthStore: mockCreate(() => ({ user: null })) };
});
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
jest.mock('expo-router/react-navigation', () => ({ ...jest.requireActual('expo-router/react-navigation'), useIsFocused: () => true }));
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

const WAITING = { user_id: '00000000-0000-4000-a000-0000000000bb', status: 'pending', username: 'marguerite' };
const SEATED = { user_id: '00000000-0000-4000-a000-0000000000cc', status: 'approved', username: 'kane' };

/** The salon, opened by `who` from a link with these params, its roster read. */
async function open(who: string, params: Record<string, string>) {
  useAuthStore.setState({ user: { id: who, username: who === HOST ? 'host' : 'kane' } });
  useLocalSearchParams.mockReturnValue({ id: ROOM_ID, ...params });
  const r = render(<LoungeRoomScreen />);
  await settle();
  return r;
}

beforeEach(() => {
  mockOnMembership = null;
  mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });
  mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, SEATED, WAITING];
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLoungeStore.setState({ currentMessages: [], lounges: [] });
});

it('a host opened from a notice is shown who waits at the door', async () => {
  const r = await open(HOST, { door: '1' });
  expect(r.getByText('At the Door')).toBeTruthy();
  expect(r.getByLabelText('Admit marguerite')).toBeTruthy();
});

it('a host who came another way is shown the room, the door counted in its header', async () => {
  const r = await open(HOST, {});
  expect(r.queryByText('At the Door')).toBeNull();
  expect(r.getByLabelText('1 at the door')).toBeTruthy();
});

it('a host opened from a notice when no one waits any more is shown the room', async () => {
  mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, SEATED];
  const r = await open(HOST, { door: '1' });
  expect(r.getByText('The Back Row')).toBeTruthy();
  expect(r.queryByText('At the Door')).toBeNull();
  // The room itself, its roster read: the door's count is not drawn, and nothing else waits.
  expect(r.queryByLabelText(/at the door/)).toBeNull();
});

it('a member admitted, opening the same link, is shown the room and no door', async () => {
  const r = await open(SEATED.user_id, { door: '1' });
  expect(r.getByText('The Back Row')).toBeTruthy();
  expect(r.queryByText('At the Door')).toBeNull();
  expect(r.queryByLabelText('Admit marguerite')).toBeNull();
});

it('the door is shown once: closed, a new roster read does not open it again', async () => {
  const r = await open(HOST, { door: '1' });
  expect(r.getByText('At the Door')).toBeTruthy();
  await fireEvent.press(r.getByLabelText('Close'));
  await settle();
  expect(r.queryByText('At the Door')).toBeNull();
  // Another comes to the door, and the channel says so: the roster is read again, and the room
  // keeps its door shut, its count grown.
  mockRoster = [...mockRoster, { user_id: '00000000-0000-4000-a000-0000000000dd', status: 'pending', username: 'orson' }];
  expect(mockOnMembership).not.toBeNull();
  await act(async () => { mockOnMembership?.(); });
  await settle();
  expect(r.getByLabelText('2 at the door')).toBeTruthy();
  expect(r.queryByText('At the Door')).toBeNull();
});
