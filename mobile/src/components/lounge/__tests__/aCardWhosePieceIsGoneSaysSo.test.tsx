/**
 * aCardWhosePieceIsGoneSaysSo.test.tsx — round 11 (shareOf, spokenDispatch and the card in
 * app/lounge/[id].tsx).
 *
 * A member shared another member's essay or stack in a salon; its writer then withdrew the essay,
 * deleted the stack, or left and erased what they wrote. The card in the sharer's message still
 * printed the headline, copied into the message when it was shared. The house now takes the copy
 * down as the piece goes and marks the card gone; the card says WITHDRAWN, and is heard so, never
 * the old headline and never no card at all.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import LoungeRoomScreen, { dispatchActions, shareOf, spokenDispatch } from '@/app/lounge/[id]';

const ROOM_ID = '00000011-0000-4000-8000-000000000011';
const HOST = '00000011-0000-4000-8000-0000000000aa';
const ROOM = { id: ROOM_ID, name: 'The Back Row', description: '', is_private: false, creator_id: HOST, created_at: '2026-01-01T00:00:00Z', member_count: 3 };
const mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const message = (over: Record<string, unknown>) => ({
  id: 'm1', lounge_id: ROOM_ID, user_id: 'u2', username: 'ana', avatar_url: null, content: 'Look.', type: 'text',
  metadata: null, created_at: '2026-09-29T20:00:00Z', deleted_at: null, reactions: [], status: 'sent', ...over,
}) as never;

/** A stack's card as the house leaves it once the stack is deleted: its id, marked gone. */
const GONE_STACK = { type: 'list_share', metadata: { listId: '00000011-0000-4000-8000-0000000000b1', gone: true } };
/** An essay's card as the house leaves it once the essay is withdrawn: no headline, no byline. */
const GONE_ESSAY = { type: 'dossier_share', film_title: null, metadata: { dossier_id: '00000011-0000-4000-8000-0000000000c1', kind: 'dossier', gone: true } };

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000011-0000-4000-8000-000000000011', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [], coversSet: {},
    fetchMessages: noop, sendMessage: noop, subscribeToLounge: () => noop, markRead: noop,
    withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => [{ user_id: 'u1', status: 'approved' }],
    broadcastTyping: noop, fetchLounges: noop, loadMoreMessages: noop, purgeHiddenMessages: noop,
  }));
  return { useLoungeStore };
});
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'u1', username: 'me' } };
  return {
    useAuthStore: Object.assign(
      (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel(state) : state),
      { getState: () => state },
    ),
  };
});
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, open: () => {} }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const { useLoungeStore } = jest.requireMock('@/src/stores/lounge') as { useLoungeStore: { setState: (s: object) => void } };
const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock; useRouter: jest.Mock };

describe('a card whose piece is gone, heard', () => {
  it('a deleted stack\'s card is heard as withdrawn, and still offers to open it', () => {
    expect(shareOf(message(GONE_STACK))).toEqual({ typeLabel: 'STACK', title: null, gone: true });
    expect(spokenDispatch(message(GONE_STACK))).toBe('Look. Shared stack, withdrawn.');
    expect(dispatchActions(message(GONE_STACK))).toContainEqual({ name: 'open', label: 'Open the stack' });
  });

  it('a withdrawn essay\'s card is heard as withdrawn, by its kind', () => {
    const said = spokenDispatch(message(GONE_ESSAY));
    expect(said).toMatch(/^Look\. Shared \w+, withdrawn\.$/);
  });

  it('a card whose piece stands is heard by its title, as before', () => {
    const standing = message({ type: 'list_share', metadata: { listId: '00000011-0000-4000-8000-0000000000b2', title: 'Nights in Tokyo', curator: 'ana' } });
    expect(spokenDispatch(standing)).toBe('Look. Shared stack: Nights in Tokyo.');
  });
});

describe('a card whose piece is gone, drawn', () => {
  beforeEach(() => {
    useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
    useLocalSearchParams.mockReturnValue({ id: ROOM_ID });
  });

  it('says WITHDRAWN where the headline was', async () => {
    useLoungeStore.setState({
      lounges: [ROOM],
      currentMessages: [message({ id: 'm1', ...GONE_STACK }), message({ id: 'm2', content: 'And this.', ...GONE_ESSAY })],
    });
    const r = render(<LoungeRoomScreen />);
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    // Inside the message, which speaks for it (the card is hidden from a screen reader, heard above).
    expect(r.getAllByText('withdrawn', { includeHiddenElements: true })).toHaveLength(2);
    await act(async () => { r.unmount(); });
  });
});
