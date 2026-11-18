/**
 * aSeatRequestedIsHeard.test.tsx — review round 12.
 *
 * At a private salon's door, REQUEST A SEAT gives way to "Your request is with the host." the
 * moment it is pressed: the button a screen-reader member pressed vanished under their focus, and
 * nothing said the request was taken. When the house takes it (its answer, not the press), the
 * screen reader is moved onto the words that say so; a door drawn pending on arrival moves nobody.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { GateView } from '@/app/lounge/[id]';

const mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ROOM = {
  id: 'room', name: 'The Back Row', description: '', is_private: true,
  creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 4,
} as never;

const gate = (seatAsked: number) => (
  <GateView gate="pending" lounge={ROOM} memberCount={4} onRequest={jest.fn()} onRetry={jest.fn()} pending={false} seatAsked={seatAsked} />
);

it('moves a screen reader onto "Your request is with the host." once the house has taken the request, and not before', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  let r!: ReturnType<typeof render>;
  // Pending on arrival (a request made another day): nobody is moved.
  await act(async () => { r = render(gate(0)); });
  expect(r.getByText('Your request is with the host.')).toBeTruthy();
  expect(focus).not.toHaveBeenCalled();
  // The house answered the request made here.
  await act(async () => { r.rerender(gate(1)); });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  focus.mockRestore();
});
