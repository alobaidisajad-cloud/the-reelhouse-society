/**
 * aSealedStacksCardSaysSo.test.tsx — review round 13 (shareOf, spokenDispatch and the card in
 * app/lounge/[id].tsx).
 *
 * A curator shared a stack into a salon and sealed it afterwards (or shared it sealed): every member
 * there read its title, its count of reels and its curator on the card, and met CLASSIFIED at each
 * tap. The house now takes the stack's words off its cards when it is sealed ({listId, sealed}), and
 * puts them back when it is opened again. The card says the stack is sealed, and nothing of it; it is
 * heard so; and it still opens the stack, which its curator alone may read.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import LoungeRoomScreen, { dispatchActions, shareOf, shareOpens, spokenDispatch } from '@/app/lounge/[id]';
import { useListStore } from '@/src/stores/films';

const ROOM_ID = '00000013-0000-4000-8000-000000000013';
const HOST = '00000013-0000-4000-8000-0000000000aa';
const ROOM = { id: ROOM_ID, name: 'The Back Row', description: '', is_private: false, creator_id: HOST, created_at: '2026-01-01T00:00:00Z', member_count: 3 };
const mockHouse = supabaseFake({ rows: { lounges: [ROOM], lounge_members: [] } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const message = (over: Record<string, unknown>) => ({
  id: 'm1', lounge_id: ROOM_ID, user_id: 'u2', username: 'ana', avatar_url: null, content: 'Look.', type: 'text',
  metadata: null, created_at: '2026-09-29T20:00:00Z', deleted_at: null, reactions: [], status: 'sent', ...over,
}) as never;

/** A stack's card as the house leaves it once its curator seals it: its id, marked sealed. */
const SEALED_STACK = { type: 'list_share', metadata: { listId: '00000013-0000-4000-8000-0000000000b1', sealed: true } };

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000013-0000-4000-8000-000000000013', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
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

describe('a sealed stack\'s card, heard', () => {
  it('is a card still, says it is sealed, and is no door to a member who is not its curator', () => {
    expect(shareOf(message(SEALED_STACK))).toEqual({ typeLabel: 'STACK', title: null, gone: false, sealed: true });
    expect(spokenDispatch(message(SEALED_STACK))).toBe('Look. Shared stack, sealed.');
    // Every tap would land on CLASSIFIED: no "Open the stack" is offered, and the card opens nothing.
    expect(dispatchActions(message(SEALED_STACK)).map((a) => a.name)).toEqual(['activate', 'longpress']);
    expect(shareOpens(message(SEALED_STACK))).toBe(false);
  });

  it('opens for its curator, whose own stack it is', () => {
    useListStore.setState({ lists: [{ id: SEALED_STACK.metadata.listId }] } as never);
    try {
      expect(shareOpens(message(SEALED_STACK))).toBe(true);
      expect(dispatchActions(message(SEALED_STACK))).toContainEqual({ name: 'open', label: 'Open the stack' });
    } finally {
      useListStore.setState({ lists: [] } as never);
    }
  });

  it('a card the website made, its caption taken with the seal, is a sealed card with no words', () => {
    const website = message({ content: '', type: 'list_share', metadata: { listId: '00000013-0000-4000-8000-0000000000b1', sealed: true, caption: true } });
    expect(shareOf(website)).toEqual({ typeLabel: 'STACK', title: null, gone: false, sealed: true });
    expect(spokenDispatch(website)).toBe('Shared stack, sealed.');
  });

  it('a card marked gone as well as sealed is gone', () => {
    const both = message({ type: 'list_share', metadata: { listId: '00000013-0000-4000-8000-0000000000b2', sealed: true, gone: true } });
    expect(shareOf(both)).toEqual({ typeLabel: 'STACK', title: null, gone: true });
  });

  it('a stack opened again is heard by its title, as before', () => {
    const open = message({ type: 'list_share', metadata: { listId: '00000013-0000-4000-8000-0000000000b1', title: 'Nights in Tokyo', curator: 'ana', filmCount: 2 } });
    expect(spokenDispatch(open)).toBe('Look. Shared stack: Nights in Tokyo.');
  });
});

describe('a sealed stack\'s card, drawn', () => {
  beforeEach(() => {
    useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
    useLocalSearchParams.mockReturnValue({ id: ROOM_ID });
  });

  it('says it is sealed by its curator where the title was, with no curator or count', async () => {
    useLoungeStore.setState({ lounges: [ROOM], currentMessages: [message({ id: 'm1', ...SEALED_STACK })] });
    const r = render(<LoungeRoomScreen />);
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(r.getByText('sealed by its curator', { includeHiddenElements: true })).toBeTruthy();
    expect(r.queryByText(/REELS/, { includeHiddenElements: true })).toBeNull();
    await act(async () => { r.unmount(); });
  });

  it('a tap on it takes a member who is not its curator nowhere', async () => {
    const push = jest.fn();
    useRouter.mockReturnValue({ push, replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
    useLoungeStore.setState({ lounges: [ROOM], currentMessages: [message({ id: 'm1', ...SEALED_STACK })] });
    const r = render(<LoungeRoomScreen />);
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    await act(async () => { await fireEvent.press(r.getByText('sealed by its curator', { includeHiddenElements: true })); });
    expect(push).not.toHaveBeenCalled();
    await act(async () => { r.unmount(); });
  });
});
