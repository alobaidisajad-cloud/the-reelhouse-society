/**
 * A render budget for the lounge room: what a keystroke, a new message and a
 * reaction may redraw.
 *
 * The room re-renders on every keystroke (the composer's text is its state)
 * and on every change to the lounge store. Each message row is memoised, so
 * none of that reaches the transcript, until a handler or a derived prop is
 * made new on each render and every row on screen redraws per letter typed.
 * Counted by the rows' own renders, so this fails the day that happens.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { create } from 'zustand';

import LoungeRoomScreen from '@/app/lounge/[id]';

/** Every render of a message row, by the words it speaks. */
const mockRowRenders: string[] = [];
jest.mock('@/src/components/PressableScale', () => {
  const Real = jest.requireActual('@/src/components/PressableScale').default;
  const ReactActual = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: { accessibilityRole?: string; accessibilityLabel?: string }) => {
      // A message is the one pressable whose role is text (spokenDispatch).
      if (props.accessibilityRole === 'text') mockRowRenders.push(props.accessibilityLabel ?? '');
      return ReactActual.createElement(Real, props);
    },
  };
});

const ROOM = {
  id: 'room', name: 'The Back Row', description: '', is_private: false,
  creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
const message = (n: number, over: Record<string, unknown> = {}) => ({
  id: `m${n}`, lounge_id: 'room', user_id: n % 2 ? 'u2' : 'u3', username: n % 2 ? 'ana' : 'bo',
  avatar_url: null, content: `Message number ${n}.`, type: 'text', metadata: null,
  created_at: new Date(2026, 8, 29, 20, n).toISOString(), deleted_at: null,
  reactions: [], status: 'sent', ...over,
});

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], loading: false, sending: false,
    presentCount: 0, typingUsers: [],
    fetchMessages: noop, sendMessage: noop, subscribeToLounge: () => noop, markRead: noop,
    withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => [{ user_id: 'u1', status: 'approved' }],
    broadcastTyping: noop, fetchLounges: noop, loadMoreMessages: noop, purgeHiddenMessages: noop,
  }));
  return { useLoungeStore };
});

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self; chain.eq = self;
      chain.single = () => Promise.resolve({ data: ROOM, error: null });
      chain.maybeSingle = chain.single;
      return chain;
    },
  },
}));
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

const { useLoungeStore } = jest.requireMock('@/src/stores/lounge') as {
  useLoungeStore: ReturnType<typeof create> & { setState: (s: object) => void; getState: () => Record<string, unknown> };
};
const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as {
  useLocalSearchParams: jest.Mock; useRouter: jest.Mock;
};
// expo-router's useRouter returns one router for the app's life; the shared mock
// makes a new one per call, which would make every handler built on it new.
const ROUTER = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };
beforeEach(() => useRouter.mockReturnValue(ROUTER));

const FORTY = Array.from({ length: 40 }, (_, i) => message(i + 1));

async function openRoom() {
  useLocalSearchParams.mockReturnValue({ id: 'room' });
  useLoungeStore.setState({ currentMessages: FORTY, lounges: [ROOM] });
  const r = render(<LoungeRoomScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  mockRowRenders.length = 0;
  return r;
}

describe('the lounge room, per change', () => {
  it('a keystroke in the composer redraws no message', async () => {
    const r = await openRoom();
    for (const letter of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      await act(async () => { fireEvent.changeText(r.getByLabelText('Compose a dispatch'), letter); });
    }
    expect(mockRowRenders).toEqual([]);
  });

  it('a new message draws itself and redraws no other', async () => {
    await openRoom();
    await act(async () => {
      useLoungeStore.setState({ currentMessages: [...FORTY, message(41)] });
    });
    expect(mockRowRenders.length).toBe(1);
    expect(mockRowRenders[0]).toMatch(/Message number 41/);
  });

  it('a reaction on one message redraws that message alone', async () => {
    await openRoom();
    await act(async () => {
      useLoungeStore.setState({
        currentMessages: FORTY.map((m) => (m.id === 'm7' ? { ...m, reactions: [{ reaction: 'certified', count: 1, mine: false }] } : m)),
      });
    });
    expect(mockRowRenders.length).toBe(1);
    expect(mockRowRenders[0]).toMatch(/Message number 7/);
  });

  it('someone at the typewriter redraws no message', async () => {
    await openRoom();
    await act(async () => { useLoungeStore.setState({ typingUsers: ['ana'] }); });
    await act(async () => { useLoungeStore.setState({ presentCount: 3 }); });
    expect(mockRowRenders).toEqual([]);
  });
});
