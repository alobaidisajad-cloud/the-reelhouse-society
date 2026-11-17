/**
 * aDissolvedSalonSaysSoInTheRoom.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member sits in a salon while its host dissolves it. The room never learned: the salon itself
 * has no channel, and only opening the room asked for it. Back from another app the room stood
 * with the salon's name and words; every SEND failed under "tap to retry", and TAKE A SEAT said
 * to check the connection.
 *
 * Now the room asks for itself again on a return to the app, and after a word, a seat or a request
 * the house refused: gone, it draws its own "Signal Lost" page with its way out.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';

const ROOM = '00000011-0000-4000-8000-000000000011';
const OPEN = { id: ROOM, name: 'The Back Row', description: '', is_private: false, creator_id: '00000099-0000-4000-8000-000000000099', created_at: '2026-01-01T00:00:00Z', member_count: 3 };
const standing = () => supabaseFake({ rows: { lounges: [OPEN] } });
const dissolved = () => supabaseFake({ rows: { lounges: [] } });
let mockHouse = standing();

const mockSend = jest.fn(async (..._a: unknown[]): Promise<boolean | 'queued'> => true);
const mockJoin = jest.fn(async (_id: string) => true);
let mockSeat: { user_id: string; status: string }[] = [{ user_id: 'u1', status: 'approved' }];

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000011-0000-4000-8000-000000000011', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false, presentCount: 0, typingUsers: [], coversSet: {},
    fetchMessages: noop, sendMessage: (...a: unknown[]) => mockSend(...a),
    subscribeToLounge: () => noop,
    markRead: noop, withdrawMessage: noop, retryMessage: async () => false, toggleReaction: noop,
    requestMembership: async () => 'error', joinPublicLounge: (id: string) => mockJoin(id),
    fetchMembers: async () => mockSeat,
    broadcastTyping: noop, fetchLounges: noop, loadMoreMessages: noop, purgeHiddenMessages: noop,
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
jest.mock('@/src/utils/typedRouter', () => ({ nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('expo-router/react-navigation', () => ({
  ...require('@/test-utils/navigationMock').navigationMock(),
  useIsFocused: () => true,
}));
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, open: () => {}, openOr: (go: () => void) => go() }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock; useRouter: jest.Mock };
const settle = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });

let appStateHeard: ((s: string) => void)[] = [];

async function openRoom() {
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLocalSearchParams.mockReturnValue({ id: ROOM });
  const r = render(<LoungeRoomScreen />);
  await settle();
  return r;
}

beforeEach(() => {
  mockHouse = standing();
  mockSeat = [{ user_id: 'u1', status: 'approved' }];
  mockSend.mockClear().mockResolvedValue(true);
  mockJoin.mockClear().mockResolvedValue(true);
  appStateHeard = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHeard.push(h);
    return { remove: () => { appStateHeard = appStateHeard.filter((x) => x !== h); } };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

it('dissolved while the member was away, the room says so on their return, with its way out', async () => {
  const r = await openRoom();
  expect(r.queryByText('Signal Lost')).toBeNull();
  mockHouse = dissolved();
  await act(async () => { appStateHeard.forEach((h) => h('active')); });
  await settle();
  expect(r.getByText('Signal Lost')).toBeTruthy();
  expect(r.getByLabelText('GO BACK')).toBeTruthy();
  r.unmount();
});

it('standing on the return, the room stays as it was', async () => {
  const r = await openRoom();
  await act(async () => { appStateHeard.forEach((h) => h('active')); });
  await settle();
  expect(r.queryByText('Signal Lost')).toBeNull();
  expect(r.getAllByText('The Back Row').length).toBeGreaterThan(0);
  r.unmount();
});

it('a word refused in a salon dissolved meanwhile turns the room to "Signal Lost"', async () => {
  const r = await openRoom();
  mockHouse = dissolved();
  mockSend.mockResolvedValue(false);
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Compose a dispatch'), 'Still here?'); });
  await act(async () => { await fireEvent.press(r.getByLabelText('Send the dispatch')); });
  await settle();
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(r.getByText('Signal Lost')).toBeTruthy();
  r.unmount();
});

it('a word that went asks nothing again', async () => {
  const r = await openRoom();
  mockHouse = dissolved();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Compose a dispatch'), 'Here.'); });
  await act(async () => { await fireEvent.press(r.getByLabelText('Send the dispatch')); });
  await settle();
  expect(r.queryByText('Signal Lost')).toBeNull();
  r.unmount();
});

it('a seat refused in a salon dissolved meanwhile turns the room to "Signal Lost"', async () => {
  mockSeat = [];
  const r = await openRoom();
  mockHouse = dissolved();
  mockJoin.mockResolvedValue(false);
  await act(async () => { await fireEvent.press(r.getByLabelText('Take a seat in this salon')); });
  await settle();
  expect(mockJoin).toHaveBeenCalledWith(ROOM);
  expect(r.getByText('Signal Lost')).toBeTruthy();
  r.unmount();
});
