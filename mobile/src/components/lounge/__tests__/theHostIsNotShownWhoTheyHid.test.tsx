/**
 * theHostIsNotShownWhoTheyHid.test.tsx — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * The salon's door showed its host every request, a member they had blocked or muted among them,
 * with ADMIT beside it, and its badge counted them: the follow-request door has never shown one.
 * Now a member the host has hidden is neither shown at the door nor counted, from the moment they
 * are hidden. And a reaction chip the member gave is said chosen, as it is drawn: a tap on it
 * takes it back.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { create } from 'zustand';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useBlockStore } from '@/src/stores/blockStore';

const ROOM_ID = '00000000-0000-4000-b200-000000000001';
const HOST = '00000000-0000-4000-a000-0000000000aa';
const ROOM = {
  id: ROOM_ID, name: 'The Back Row', description: '', is_private: true,
  creator_id: HOST, created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
let mockRoster: { user_id: string; status: string; username?: string }[] = [];
let mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000000-0000-4000-b200-000000000001', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
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

const WAITING = { user_id: '00000000-0000-4000-a000-0000000000bb', status: 'pending', username: 'marguerite' };
const BLOCKED = { user_id: '00000000-0000-4000-a000-0000000000cc', status: 'pending', username: 'orson' };
const MUTED = { user_id: '00000000-0000-4000-a000-0000000000dd', status: 'pending', username: 'welles' };

const hide = (blocked: string[], muted: string[]) => useBlockStore.setState({
  blocked, _blockedIndex: new Set(blocked), muted, _mutedIndex: new Set(muted),
});

/** The salon, opened by its host with these params, its roster read. */
async function open(params: Record<string, string>) {
  useAuthStore.setState({ user: { id: HOST, username: 'host' } });
  useLocalSearchParams.mockReturnValue({ id: ROOM_ID, ...params });
  const r = render(<LoungeRoomScreen />);
  await settle();
  return r;
}

beforeEach(() => {
  mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });
  mockRoster = [{ user_id: HOST, status: 'approved', username: 'host' }, WAITING, BLOCKED, MUTED];
  useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
  useLoungeStore.setState({ currentMessages: [], lounges: [], coversSet: {} });
  hide([BLOCKED.user_id], [MUTED.user_id]);
});
afterAll(() => { hide([], []); });

describe('the door, for a host who has blocked or muted someone waiting at it', () => {
  it('shows only the member they have not hidden, with ADMIT', async () => {
    const r = await open({ door: '1' });
    expect(r.getByText('At the Door')).toBeTruthy();
    expect(r.getByLabelText('Admit marguerite')).toBeTruthy();
    expect(r.queryByLabelText('Admit orson')).toBeNull();
    expect(r.queryByLabelText('Admit welles')).toBeNull();
  });

  it('counts only the member they have not hidden in the header', async () => {
    const r = await open({});
    expect(r.getByLabelText('1 at the door')).toBeTruthy();
    expect(r.queryByLabelText('3 at the door')).toBeNull();
  });

  it('takes a member off the count the moment the host blocks them, the room still open', async () => {
    const r = await open({});
    expect(r.getByLabelText('1 at the door')).toBeTruthy();
    await act(async () => { hide([BLOCKED.user_id, WAITING.user_id], [MUTED.user_id]); });
    expect(r.queryByLabelText(/at the door/)).toBeNull();
  });
});

describe('a reaction chip', () => {
  it('the reaction the member gave is said chosen; another’s is not', async () => {
    useLoungeStore.setState({
      currentMessages: [{
        id: 'm1', lounge_id: ROOM_ID, user_id: WAITING.user_id, username: 'marguerite', avatar_url: null,
        content: 'Late Spring is a perfect film.', type: 'text', metadata: null,
        created_at: '2026-09-29T20:00:00Z', deleted_at: null, status: 'sent',
        reactions: [
          { reaction: 'bravo', count: 3, mine: true },
          { reaction: 'panned', count: 1, mine: false },
        ],
      }],
    });
    const r = await open({});
    expect(r.getByText('Late Spring is a perfect film.')).toBeTruthy();
    expect(r.getByRole('button', { name: 'BRAVO, 3' }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(r.getByRole('button', { name: 'PANNED, 1' }).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });
});
