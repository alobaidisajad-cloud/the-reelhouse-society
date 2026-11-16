/**
 * thoseYouHaveHiddenAreLetBackFromSettings.test.tsx — review round 7
 * ─────────────────────────────────────────────────────────────────────────────
 * UNBLOCK and UNMUTE were offered only on the member's own file, and every road to that file hides
 * them: a block or a mute stood for good. Settings now names those one has hidden, by their
 * handles, each with the way back; says "No one" when there is no one; and says so, with TRY
 * AGAIN, when the names or the block list itself could not be read.
 */
import React, { act } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { HiddenMembersSection } from '../HiddenMembersSection';
import { useBlockStore } from '@/src/stores/blockStore';

const ORSON = '22222222-2222-4222-8222-222222222222';
const AGNES = '33333333-3333-4333-8333-333333333333';

const unreachable = { code: '', message: 'TypeError: Network request failed' };
/** Whether the house can be reached for the names, and for the block list. */
let mockNamesReached = true;
let mockBlocksReached = true;
const mockHouse = supabaseFake({
  answer: {
    profiles: (ask) => (mockNamesReached
      ? [{ id: ORSON, username: 'orson' }, { id: AGNES, username: 'agnes' }]
        .filter((p) => ask.filters.every(([op, col, val]) => op !== 'in' || col !== 'id' || (val as string[]).includes(p.id)))
      : unreachable),
  },
  rpc: {
    get_user_blocks: () => (mockBlocksReached
      ? [{ blocked_id: ORSON, type: 'block' }, { blocked_id: AGNES, type: 'mute' }]
      : { error: unreachable }),
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: '11111111-1111-4111-8111-111111111111', username: 'kane' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  (useAuthStore as unknown as { subscribe: () => () => void }).subscribe = () => () => {};
  return { useAuthStore };
});

const unblockUser = jest.fn(async () => {});
const unmuteUser = jest.fn(async () => {});
const hidden = (blocked: string[], muted: string[]) => useBlockStore.setState({
  blocked, muted, _blockedIndex: new Set(blocked), _mutedIndex: new Set(muted), blocksKnown: true,
} as never);

beforeEach(() => {
  jest.clearAllMocks();
  mockNamesReached = true;
  mockBlocksReached = true;
  useBlockStore.setState({ unblockUser, unmuteUser } as never);
});

it('those blocked and muted are named by their handles, each with the way to let them back', async () => {
  hidden([ORSON], [AGNES]);
  const r = render(<HiddenMembersSection />);
  await waitFor(() => expect(r.getByText('@orson')).toBeTruthy());
  expect(r.getByText('@agnes')).toBeTruthy();
  expect(r.getByText('BLOCKED')).toBeTruthy();
  expect(r.getByText('MUTED')).toBeTruthy();

  await act(async () => { await fireEvent.press(r.getByLabelText('Unblock @orson')); });
  expect(unblockUser).toHaveBeenCalledWith(ORSON);
  await act(async () => { await fireEvent.press(r.getByLabelText('Unmute @agnes')); });
  expect(unmuteUser).toHaveBeenCalledWith(AGNES);
  expect(unblockUser).toHaveBeenCalledTimes(1);
  expect(unmuteUser).toHaveBeenCalledTimes(1);
});

it('with no one hidden, it says no one', async () => {
  hidden([], []);
  const r = render(<HiddenMembersSection />);
  expect(r.getByText(/^No one\. A member you block or mute is listed here/)).toBeTruthy();
});

it('names that could not be read are said to be out of reach, never a blank list; TRY AGAIN reads them', async () => {
  mockNamesReached = false;
  hidden([ORSON], []);
  const r = render(<HiddenMembersSection />);
  await waitFor(() => expect(r.getByText('Those you have hidden could not be reached.')).toBeTruthy());
  expect(r.queryByText('@orson')).toBeNull();

  mockNamesReached = true;
  await act(async () => { await fireEvent.press(r.getByText('TRY AGAIN')); });
  await waitFor(() => expect(r.getByText('@orson')).toBeTruthy());
});

it('a block list never read is asked of the house; one that could not be read says so, and TRY AGAIN asks again', async () => {
  useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set(), blocksKnown: false } as never);
  mockBlocksReached = false;
  const r = render(<HiddenMembersSection />);
  // Never "No one" over a list the phone has not read.
  expect(r.queryByText(/^No one\./)).toBeNull();
  await waitFor(() => expect(r.getByText('Those you have hidden could not be reached.')).toBeTruthy());
  expect(r.queryByText(/^No one\./)).toBeNull();

  mockBlocksReached = true;
  await act(async () => { await fireEvent.press(r.getByText('TRY AGAIN')); });
  await waitFor(() => expect(r.getByText('@orson')).toBeTruthy());
  expect(r.getByText('@agnes')).toBeTruthy();
});
