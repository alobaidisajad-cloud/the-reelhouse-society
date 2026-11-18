/**
 * aSalonsNoticeInItsRoomOpensTheDoorThere.test.tsx — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A host sitting in their salon, opened from the corridor (/lounge/<id>), tapped the push
 * "@X is asking to enter …" (/lounge/<id>?door=1). The page-in-front guard compared the whole
 * address, so a second copy of the room was stacked over the first, sharing (and, leaving, taking)
 * its channel. Now the path is compared: no room is stacked, the room in front reads its roster
 * again and meets its host at the door.
 *
 * And the room hands its settings the standing it acts on: a seated member whose roster could not
 * be read was told by the settings "The roster is kept for those seated." and offered no STEP OUT.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { create } from 'zustand';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';
import { noteCurrentPath } from '@/src/utils/openSociety';
import { openNoticeFromPush } from '@/src/utils/openNoticeFromPush';

const ROOM_ID = '00000000-0000-4000-b200-000000000001';
const HOST = '00000000-0000-4000-a000-0000000000aa';
const ROOM = {
  id: ROOM_ID, name: 'The Back Row', description: '', is_private: true,
  creator_id: HOST, created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
let mockRoster: { user_id: string; status: string; username?: string }[] | null = [];
let mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000000-0000-4000-b200-000000000001', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [], coversSet: {},
    fetchMessages: noop, sendMessage: noop, markRead: noop,
    subscribeToLounge: () => noop,
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
/** What the room hands its settings: the standing it acts on, and the roster read's failure. */
let mockSettings: { standing?: unknown; rosterFailed?: unknown; onRetryRoster?: () => void } = {};
jest.mock('@/src/components/lounge/LoungeSettingsPanel', () => ({
  LoungeSettingsPanel: (props: { standing?: unknown; rosterFailed?: unknown; onRetryRoster?: () => void }) => { mockSettings = props; return null; },
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
const { nav } = jest.requireMock('@/src/utils/typedRouter') as { nav: { push: jest.Mock } };
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
};

const WAITING = { user_id: '00000000-0000-4000-a000-0000000000bb', status: 'pending', username: 'marguerite' };
const SEATED = { user_id: '00000000-0000-4000-a000-0000000000cc', status: 'approved', username: 'kane' };
const ASKING: AppNotification = {
  id: 'n1', user_id: HOST, type: 'system', message: 'is asking to enter The Back Row', read: false,
  created_at: '2026-11-17T09:00:00Z', related_lounge_id: ROOM_ID, from_username: 'marguerite',
} as AppNotification;

async function open(who: string) {
  useAuthStore.setState({ user: { id: who, username: who === HOST ? 'host' : 'kane' } });
  useLocalSearchParams.mockReturnValue({ id: ROOM_ID });
  const r = render(<LoungeRoomScreen />);
  await settle();
  return r;
}

beforeEach(() => {
  jest.mocked(nav.push).mockClear();
  mockSettings = {};
  mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });
  mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, SEATED];
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLoungeStore.setState({ currentMessages: [], lounges: [], coversSet: {} });
  useNotificationStore.setState({ notifications: [ASKING], markRead: jest.fn(async () => {}) } as never);
});

it('a host in their salon who taps "is asking to enter" is met at the door there: no second room is stacked', async () => {
  const r = await open(HOST);
  expect(r.queryByText('At the Door')).toBeNull();

  // Marguerite asks to enter; the host, in the room, taps the push.
  mockRoster = [...(mockRoster ?? []), WAITING];
  noteCurrentPath(`/lounge/${ROOM_ID}`);
  await act(async () => { await openNoticeFromPush('n1'); });
  await settle();

  expect(nav.push).not.toHaveBeenCalled();
  expect(r.getByText('At the Door')).toBeTruthy();
  expect(r.getByLabelText('Admit marguerite')).toBeTruthy();
  await r.unmount();
});

it('a seated member whose roster could not be read hands the settings their seat, and a way to read it again', async () => {
  // The corridor knows the seat; the roster read fails.
  useLoungeStore.setState({ lounges: [{ ...ROOM, membership_status: 'approved' }] });
  mockRoster = null;
  const r = await open(SEATED.user_id);
  expect(mockSettings.standing).toBe('approved');
  expect(mockSettings.rosterFailed).toBe(true);
  // TRY AGAIN reads it again: read, the settings are told it no longer failed.
  mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, SEATED];
  expect(mockSettings.onRetryRoster).toBeDefined();
  await act(async () => { mockSettings.onRetryRoster?.(); });
  await settle();
  expect([mockSettings.standing, mockSettings.rosterFailed]).toEqual(['approved', false]);
  await r.unmount();
});
