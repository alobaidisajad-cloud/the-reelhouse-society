/**
 * theDoorWaitsForTheGuestList.test.tsx — a private room's gate, while its roster
 * is read and when it cannot be.
 *
 * Until the roster is read the gate knocks, and if it cannot be read the gate
 * says so, with a way to try again: a member of a private room is never shown
 * the request door before the list says they are not on it.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GateView } from '@/app/lounge/[id]';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), channel: jest.fn() } }));

const ROOM = {
  id: 'room', name: 'The Back Row', description: '', is_private: true,
  creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 4,
} as never;

const door = (gate: Parameters<typeof GateView>[0]['gate'], onRetry = jest.fn(), onRequest = jest.fn()) =>
  ({ onRetry, onRequest, r: render(
    <GateView gate={gate} lounge={ROOM} memberCount={4} onRequest={onRequest} onRetry={onRetry} pending={false} />,
  ) });

describe('the door of a private room', () => {
  it('knocks while the guest list is read, and offers no request', () => {
    const { r } = door('knocking');
    expect(r.getByText('CHECKING THE GUEST LIST')).toBeTruthy();
    expect(r.queryByText('REQUEST A SEAT')).toBeNull();
  });

  it('says the list could not be reached, and TRY AGAIN asks again', () => {
    const { r, onRetry, onRequest } = door('unreachable');
    expect(r.getByText(/The guest list could not be reached/)).toBeTruthy();
    expect(r.queryByText('REQUEST A SEAT')).toBeNull();
    fireEvent.press(r.getByLabelText('Try the guest list again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRequest).not.toHaveBeenCalled();
  });

  it('shows the request door only once the list says the member is not on it', () => {
    const { r } = door('request');
    expect(r.getByText('REQUEST A SEAT')).toBeTruthy();
  });
});
