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
import { useNotificationStore } from '@/src/stores/notificationStore';

const ROOM_ID = '00000000-0000-4000-b200-000000000001';
const HOST = '00000000-0000-4000-a000-0000000000aa';
const ROOM = {
  id: ROOM_ID, name: 'The Back Row', description: '', is_private: true,
  creator_id: HOST, created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
/** The roster the house gives; null, a read that could not be reached. */
let mockRoster: { user_id: string; status: string; username?: string }[] | null = [];
/** The channel's word that the roster changed (subscribeToLounge's onMembership), as the salon gave it. */
let mockOnMembership: (() => void) | null = null;
let mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000000-0000-4000-b200-000000000001', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [], coversSet: {},
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
/** The room's settings, as handed the salon: the cover they show is the one it is given. */
let mockSettingsCover: unknown = 'unseen';
jest.mock('@/src/components/lounge/LoungeSettingsPanel', () => ({
  LoungeSettingsPanel: ({ lounge }: { lounge: { cover_image?: string | null } }) => { mockSettingsCover = lounge.cover_image; return null; },
}));

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
  useLoungeStore.setState({ currentMessages: [], lounges: [], coversSet: {} });
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
  mockRoster = [...(mockRoster ?? []), { user_id: '00000000-0000-4000-a000-0000000000dd', status: 'pending', username: 'orson' }];
  expect(mockOnMembership).not.toBeNull();
  await act(async () => { mockOnMembership?.(); });
  await settle();
  expect(r.getByLabelText('2 at the door')).toBeTruthy();
  expect(r.queryByText('At the Door')).toBeNull();
});

/**
 * A request sent was kept as "requesting" for good: once the host declined and the roster no
 * longer held it, the member was still told their request was with the host (review round 1).
 */
it('a request the host declines is the door to ask again, never "with the host" for ever', async () => {
  const ASKER = '00000000-0000-4000-a000-0000000000dd';
  mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, SEATED];
  const r = await open(ASKER, {});
  expect(r.getByText('REQUEST A SEAT')).toBeTruthy();

  // Asked: the roster now holds the request.
  mockRoster = [...mockRoster, { user_id: ASKER, status: 'pending', username: 'kane' }];
  await act(async () => { await fireEvent.press(r.getByText('REQUEST A SEAT')); });
  await settle();
  expect(r.getByText('Your request is with the host.')).toBeTruthy();

  // Declined: the roster no longer holds it. A private door has no channel, so the next notice
  // heard is what asks the roster again.
  mockRoster = mockRoster.filter((m) => m.user_id !== ASKER);
  expect(mockOnMembership).toBeNull();
  await act(async () => { useNotificationStore.setState({ noticesHeard: useNotificationStore.getState().noticesHeard + 1 }); });
  await settle();
  expect(r.queryByText('Your request is with the host.')).toBeNull();
  expect(r.getByText('REQUEST A SEAT')).toBeTruthy();
});

it('a request whose first roster could not be read, then declined, is the door to ask again once a roster is read', async () => {
  const ASKER = '00000000-0000-4000-a000-0000000000dd';
  const seated = [{ user_id: HOST, status: 'approved', username: 'host' }, SEATED];
  mockRoster = seated;
  const r = await open(ASKER, {});
  // Asked, and answered: the roster read after it is out of reach. The house holds the request.
  mockRoster = null;
  await act(async () => { await fireEvent.press(r.getByText('REQUEST A SEAT')); });
  await settle();
  expect(r.getByText('Your request is with the host.')).toBeTruthy();

  // Declined before any roster held it: the next roster read ends the request in flight.
  mockRoster = seated;
  await act(async () => { useNotificationStore.setState({ noticesHeard: useNotificationStore.getState().noticesHeard + 1 }); });
  await settle();
  expect(r.queryByText('Your request is with the host.')).toBeNull();
  expect(r.getByText('REQUEST A SEAT')).toBeTruthy();
});

/**
 * A cover the host changed or took away was kept in the Lounge list alone: the room had read its
 * own record when it opened, and its settings showed the old cover (review round 1).
 */
it('a cover the host sets or takes away is the one the room\'s settings show, at once', async () => {
  mockSettingsCover = 'unseen';
  await open(HOST, {});
  expect(mockSettingsCover).toBeUndefined();
  await act(async () => { useLoungeStore.setState({ coversSet: { [ROOM_ID]: '/new-cover.jpg' } }); });
  expect(mockSettingsCover).toBe('/new-cover.jpg');
  await act(async () => { useLoungeStore.setState({ coversSet: { [ROOM_ID]: null } }); });
  expect(mockSettingsCover).toBeNull();
});
