/**
 * theHeaderCountsTheSeated.test.tsx — review round 7
 * ─────────────────────────────────────────────────────────────────────────────
 * The salon's header said the roster's length, less the pending: the banned and the muted were
 * counted as seated, and a muted or banned reader, whose roster read holds their own row alone,
 * read "1 MEMBER" in a full salon. Now a reader who reads the roster whole (the seated, the host)
 * is told the approved alone; anyone else, the house's own member_count, as the corridor's card.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { create } from 'zustand';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useBlockStore } from '@/src/stores/blockStore';

const ROOM_ID = '00000000-0000-4000-b200-000000000002';
const HOST = '00000000-0000-4000-a000-0000000000aa';
const ME = '00000000-0000-4000-a000-0000000000ee';
/** Public, so a muted or banned reader still reads it under its header. */
const ROOM = {
  id: ROOM_ID, name: 'The Back Row', description: '', is_private: false,
  creator_id: HOST, created_at: '2026-01-01T00:00:00Z', member_count: 9,
};
let mockRoster: { user_id: string; status: string; username?: string }[] = [];
let mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000000-0000-4000-b200-000000000002', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [], coversSet: {},
    fetchMessages: noop, sendMessage: noop, markRead: noop, subscribeToLounge: () => noop,
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
jest.mock('@/src/components/lounge/LoungeSettingsPanel', () => ({ LoungeSettingsPanel: () => null }));

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

const SEATED = { user_id: '00000000-0000-4000-a000-0000000000bb', status: 'approved', username: 'marguerite' };
const BANNED = { user_id: '00000000-0000-4000-a000-0000000000cc', status: 'banned', username: 'orson' };
const MUTED = { user_id: '00000000-0000-4000-a000-0000000000dd', status: 'muted', username: 'welles' };
const WAITING = { user_id: '00000000-0000-4000-a000-0000000000ff', status: 'pending', username: 'agnes' };

/** The salon, opened by this member, its roster read. */
async function openAs(userId: string) {
  useAuthStore.setState({ user: { id: userId, username: 'me' } });
  useLocalSearchParams.mockReturnValue({ id: ROOM_ID });
  const r = render(<LoungeRoomScreen />);
  await settle();
  return r;
}

beforeEach(() => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLoungeStore.setState({ currentMessages: [], lounges: [], coversSet: {} });
  useBlockStore.setState({ blocked: [], _blockedIndex: new Set(), muted: [], _mutedIndex: new Set() });
});

describe('the salon’s header, counting its members', () => {
  it('a seated member is told the seated alone: the banned, the muted and the waiting are not counted', async () => {
    mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, { user_id: ME, status: 'approved', username: 'me' }, SEATED, BANNED, MUTED, WAITING];
    const r = await openAs(ME);
    expect(r.getByText('3 MEMBERS')).toBeTruthy();
    expect(r.queryByText('5 MEMBERS')).toBeNull();
  });

  it('the host is told the seated alone too', async () => {
    mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, SEATED, BANNED, MUTED, WAITING];
    const r = await openAs(HOST);
    expect(r.getByText('2 MEMBERS')).toBeTruthy();
    expect(r.queryByText('4 MEMBERS')).toBeNull();
  });

  it('a muted member, whose roster holds their own row alone, is told the house’s count, never "1 MEMBER"', async () => {
    mockRoster = [{ user_id: ME, status: 'muted', username: 'me' }];
    const r = await openAs(ME);
    expect(r.getByText('9 MEMBERS')).toBeTruthy();
    expect(r.queryByText('1 MEMBER')).toBeNull();
  });

  it('a banned member reading the public room is told the house’s count, never "1 MEMBER"', async () => {
    mockRoster = [{ user_id: ME, status: 'banned', username: 'me' }];
    const r = await openAs(ME);
    expect(r.getByText('9 MEMBERS')).toBeTruthy();
    expect(r.queryByText('1 MEMBER')).toBeNull();
  });
});
