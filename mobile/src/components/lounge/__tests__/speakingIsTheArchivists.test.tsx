/**
 * SPEAKING IS THE ARCHIVIST'S (P4.16, DECISIONS 3.4).
 *
 * A member without the rank keeps their seat, reads, and takes back their own words and
 * reactions. The room drew the composer, the reaction picker, REPLY and every reaction chip for
 * them all the same, and the house refused the message only after it was written. Now the rope
 * stands where the composer would, saying why; the sheet offers no picker and no REPLY; a chip
 * they hold takes their reaction back, and another is only read. An Archivist is offered all of it.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import LoungeRoomScreen from '@/app/lounge/[id]';
import { useOfflineQueueStore } from '@/src/stores/offlineQueueStore';
import { supabaseFake } from '@/test-utils/supabaseFake';

const ROOM = {
  id: '5a1e0c00-0000-4000-8000-000000000001', name: 'The Back Row', description: '', is_private: false,
  creator_id: '5a1e0c00-0000-4000-8000-0000000000aa', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
/** The house, as strict as production: the salon's own row is what the room reads of it. */
const mockHouse = supabaseFake({ rows: { lounges: [ROOM] } });
const WORDS = {
  id: 'm1', lounge_id: '5a1e0c00-0000-4000-8000-000000000001', user_id: 'u2', username: 'ana', avatar_url: null,
  content: 'Late Spring is a perfect film.', type: 'text', metadata: null,
  created_at: '2026-09-29T20:00:00Z', deleted_at: null, status: 'sent',
  reactions: [
    { reaction: 'bravo', count: 3, mine: true },
    { reaction: 'panned', count: 1, mine: false },
  ],
};

jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '5a1e0c00-0000-4000-8000-000000000001', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [],
    fetchMessages: noop, sendMessage: noop, subscribeToLounge: () => noop, markRead: noop,
    withdrawMessage: noop, retryMessage: noop, toggleReaction: jest.fn(),
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => [{ user_id: 'u1', status: 'approved' }],
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
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

/** The member's standing for speaking and reacting; their seat is always held here. */
let mockStanding: { held: boolean; standing: 'stranger' | 'lapsed' | 'reading' } = { held: false, standing: 'stranger' };
const mockOpen = jest.fn();
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: (feature: string) => (feature === 'the-lounge'
    ? { held: true, rank: 'archivist', standing: 'stranger', open: () => {} }
    : { ...mockStanding, rank: 'archivist', open: () => mockOpen(feature) }),
}));
/** What the room hands the message's sheet: drawn on its own in theSheetOffersOnlyWhatCanWork. */
const mockSheet: { canReact?: boolean; canReply?: boolean } = {};
jest.mock('@/src/components/lounge/ActionSheet', () => ({
  __esModule: true,
  ActionSheet: (p: { canReact?: boolean; canReply?: boolean }) => { mockSheet.canReact = p.canReact; mockSheet.canReply = p.canReply; return null; },
  default: (p: { canReact?: boolean; canReply?: boolean }) => { mockSheet.canReact = p.canReact; mockSheet.canReply = p.canReply; return null; },
}));

const { useLoungeStore } = jest.requireMock('@/src/stores/lounge') as {
  useLoungeStore: { setState: (s: object) => void; getState: () => { toggleReaction: jest.Mock } };
};
const { useLocalSearchParams } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };

async function openRoom(standing: typeof mockStanding) {
  mockStanding = standing;
  mockOpen.mockClear();
  useLoungeStore.getState().toggleReaction.mockClear();
  useLocalSearchParams.mockReturnValue({ id: '5a1e0c00-0000-4000-8000-000000000001' });
  useLoungeStore.setState({ currentMessages: [WORDS], lounges: [ROOM] });
  const r = render(<LoungeRoomScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  // The room is drawn, seated: its words are on screen.
  expect(r.getByText('Late Spring is a perfect film.')).toBeTruthy();
  return r;
}

describe('a seated member without the rank', () => {
  it('reads, and finds the rope where the composer was, saying why', async () => {
    const r = await openRoom({ held: false, standing: 'stranger' });
    expect(r.queryByLabelText('Compose a dispatch')).toBeNull();
    expect(r.getByText('You keep your seat and every word you wrote. Speaking is for Archivists.')).toBeTruthy();
    await act(async () => { await fireEvent.press(r.getByText('✦ ASCEND THE RANKS')); });
    expect(mockOpen).toHaveBeenCalledWith('lounge-speaking');
  });

  it('is offered no picker and no REPLY on a message', async () => {
    await openRoom({ held: false, standing: 'stranger' });
    expect(mockSheet).toEqual({ canReact: false, canReply: false });
  });

  it('takes back their own reaction, and adds none with another chip', async () => {
    const r = await openRoom({ held: false, standing: 'stranger' });
    await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'BRAVO, 3' })); });
    expect(useLoungeStore.getState().toggleReaction).toHaveBeenCalledWith('m1', 'bravo');
    // Another's reaction is read, never offered as a control.
    expect(r.getByLabelText('PANNED, 1')).toBeTruthy();
    expect(r.queryByRole('button', { name: 'PANNED, 1' })).toBeNull();
    await act(async () => { await fireEvent.press(r.getByLabelText('PANNED, 1')); });
    expect(useLoungeStore.getState().toggleReaction).toHaveBeenCalledTimes(1);
  });

  it('whose dues have lapsed is told so', async () => {
    const r = await openRoom({ held: false, standing: 'lapsed' });
    expect(r.getByText('You keep your seat and every word you wrote. Your dues have lapsed.')).toBeTruthy();
    expect(r.queryByLabelText('Compose a dispatch')).toBeNull();
  });
});

describe('an Archivist', () => {
  it('is offered the composer, the picker, REPLY and every chip', async () => {
    const r = await openRoom({ held: true, standing: 'stranger' });
    expect(r.getByLabelText('Compose a dispatch')).toBeTruthy();
    expect(r.queryByText(/Speaking is for Archivists/)).toBeNull();
    expect(mockSheet).toEqual({ canReact: true, canReply: true });
    await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'PANNED, 1' })); });
    expect(useLoungeStore.getState().toggleReaction).toHaveBeenCalledWith('m1', 'panned');
  });
});

describe('the room counts its members in its header, and nothing more', () => {
  afterEach(() => { useLoungeStore.setState({ fetchMembers: async () => [{ user_id: 'u1', status: 'approved' }] }); });

  it.each([
    [1, '1 MEMBER'],
    [51, '51 MEMBERS'],
  ])('%i seated reads "%s"', async (n, said) => {
    const roster = Array.from({ length: n }, (_, i) => ({ user_id: i === 0 ? 'u1' : `m${i}`, status: 'approved' }));
    useLoungeStore.setState({ fetchMembers: async () => roster });
    const r = await openRoom({ held: true, standing: 'stranger' });
    expect(r.getByText(said)).toBeTruthy();
    expect(r.queryByText(/TAKEN|FULL| OF \d/)).toBeNull();
    // Gone before the roster's reader is put back, which would have the room read again.
    r.unmount();
  });
});

describe('words written offline and refused for the rank when sent', () => {
  const HELD_WORDS = { ...WORDS, id: 'mine-1', user_id: 'u1', username: 'me', content: 'Tokyo Story, again.', reactions: [], status: undefined };
  afterEach(() => { useOfflineQueueStore.setState({ queued: [] }); });

  it('stay in the room with their words, failed, to be sent again, after a remount too', async () => {
    useOfflineQueueStore.setState({ queued: [{
      id: 'q1', type: 'send_lounge_message', timestamp: Date.now(), owner: 'u1', _held: 'rank',
      payload: { id: 'mine-1', _tempId: 'mine-1', lounge_id: '5a1e0c00-0000-4000-8000-000000000001', user_id: 'u1', content: 'Tokyo Story, again.' },
    }] });
    for (let opened = 0; opened < 2; opened += 1) {
      mockStanding = { held: false, standing: 'lapsed' };
      useLocalSearchParams.mockReturnValue({ id: '5a1e0c00-0000-4000-8000-000000000001' });
      useLoungeStore.setState({ currentMessages: [WORDS, HELD_WORDS], lounges: [ROOM] });
      const r = render(<LoungeRoomScreen />);
      await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
      expect(r.getByText('Tokyo Story, again.')).toBeTruthy();
      expect(r.getAllByText('Failed · tap to retry')).toHaveLength(1);
      r.unmount();
    }
  });
});
